/**
 * 诊断渲染、文件处理状态、运行通过屏障与加载失败横幅视图控制器：
 * 从 lean-panel 拆出所有纯 DOM 与定时器结算逻辑，不直接依赖 Monaco 实体，便于 jsdom 单测覆盖。
 */
import type { LeanRuntimeArch } from '../../device';
import { isExerciseSolved, isExerciseStarter } from '../../exercise';
import type { Messages } from '../../i18n/types';
import {
  computeDiagnosticsLatencyMs,
  isAssetRelatedError,
  shouldPreserveDiagnosticsOnCrash,
  shouldShowRunPassed,
} from '../../lean-recovery';
import { anchorImportDiagnostics, type LspDiagnostic } from '../../lean-session';
import { markLessonCompleted } from '../../progress';
import type { RuntimeExtensionId } from '../../runtime-extensions';
import { track } from '../../telemetry';
import {
  diagnosticBadgeClass,
  diagnosticClass,
  diagnosticLocationClass,
  diagnosticMessageClass,
  mutedItemClass,
  type LeanPanelVariant,
} from '../lean-markup';

type StatusKind = 'idle' | 'loading' | 'ready' | 'error';

export type DiagnosticsViewOptions = {
  readonly host: HTMLElement;
  readonly uri: string;
  readonly variant: LeanPanelVariant;
  readonly starterCode: string;
  readonly lessonSlug?: string;
  readonly t: Messages['playground'];
  readonly getCode: () => string;
  readonly setModelMarkers: (diagnostics: readonly LspDiagnostic[]) => void;
  readonly revealLocation: (lineNumber: number, column: number) => void;
  readonly isSessionReady: () => boolean;
  readonly requestDocumentSymbol: () => Promise<unknown>;
  readonly getSelectedArch: () => LeanRuntimeArch;
  readonly getRunStartedAt: () => number;
  readonly getLastEditAt: () => number;
  readonly log: (message: string) => void;
  readonly setStatus: (text: string, kind: StatusKind) => void;
  readonly onProcessingChange: (active: boolean) => void;
  readonly onRunPassed: () => void;
  readonly onQuickFixLibrary: (id: RuntimeExtensionId) => void;
  readonly getLastAssetFallback: () => { name: string; message: string } | null;
  readonly onDiagnostics?: (diagnostics: LspDiagnostic[]) => void;
  readonly trackEvent?: typeof track;
  readonly perfNow?: () => number;
};

const makeEl = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const createDiagnosticsView = (options: DiagnosticsViewOptions) => {
  const { uri, variant, starterCode, lessonSlug, t, getCode } = options;
  const trackEvent = options.trackEvent ?? track;
  const perfNow = options.perfNow ?? (() => performance.now());
  const byRole = <T extends HTMLElement>(role: string) =>
    options.host.querySelector<T>(`[data-role="${role}"]`);
  const diagnosticsEl = byRole<HTMLUListElement>('diagnostics')!;
  const diagCountEl = byRole<HTMLElement>('count')!;
  const runOkEl = byRole<HTMLElement>('run-ok');
  const loadFailureEl = byRole<HTMLElement>('load-failure');
  const passedEl = byRole<HTMLElement>('passed');
  const exerciseStarter = isExerciseStarter(starterCode);

  let lastDiagnostics: LspDiagnostic[] = [];
  let diagnosticSeq = 0;
  let fileProcessing = false;
  let firstDiagnosticsReported = false;
  let barrierFallbackLogged = false;
  let runBarrierDisabled = false;
  let successSeq = 0;
  let successTimer: number | undefined;
  let settleTimer: number | undefined;
  let processingFallbackTimer: number | undefined;

  const updatePassedBadge = (list: LspDiagnostic[]) => {
    if (!exerciseStarter) return;
    const solved = isExerciseSolved(starterCode, getCode(), list);
    if (passedEl) passedEl.hidden = !solved;
    if (solved && lessonSlug) markLessonCompleted(lessonSlug);
  };

  const resetRunOk = () => {
    successSeq += 1;
    window.clearTimeout(successTimer);
    window.clearTimeout(settleTimer);
    successTimer = settleTimer = undefined;
    if (runOkEl) runOkEl.hidden = true;
  };

  const confirmRunSettled = async (seq: number, warningCount: number, latencyMs: number) => {
    if (variant !== 'full' || seq !== successSeq || !options.isSessionReady() || fileProcessing)
      return;
    let barrierOk = !runBarrierDisabled;
    if (barrierOk) {
      try {
        const result = await Promise.race([
          options.requestDocumentSymbol(),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000)),
        ]);
        if (result === null) barrierOk = false;
      } catch {
        barrierOk = false;
      }
    }
    if (seq !== successSeq || !options.isSessionReady() || fileProcessing) return;
    if (!barrierOk) {
      if (!barrierFallbackLogged) {
        barrierFallbackLogged = true;
        options.log(t.logRunBarrierFallback);
      }
      if (lastDiagnostics.length === 0) {
        options.setStatus(t.statusRunUnconfirmed, 'ready');
        diagnosticsEl.replaceChildren(makeEl('li', mutedItemClass, t.diagnosticsUnconfirmed));
      }
      return;
    }
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = undefined;
      if (seq !== successSeq || !options.isSessionReady()) return;
      if (!runOkEl) return;
      if (
        !shouldShowRunPassed({ variant, barrierOk, fileProcessing, diagnostics: lastDiagnostics })
      )
        return;
      options.onRunPassed();
      const titleEl = byRole<HTMLElement>('run-ok-title');
      const detailEl = byRole<HTMLElement>('run-ok-detail');
      if (!titleEl || !detailEl) return;
      titleEl.textContent = t.runPassed;
      detailEl.textContent = t.runPassedDetail(warningCount, latencyMs);
      runOkEl.hidden = false;
    }, 150);
  };

  const scheduleRunPassedCheck = (warningCount: number, latencyMs: number, delayMs = 200) => {
    if (variant !== 'full' || fileProcessing) return;
    const seq = successSeq;
    window.clearTimeout(successTimer);
    successTimer = window.setTimeout(() => {
      successTimer = undefined;
      void confirmRunSettled(seq, warningCount, latencyMs);
    }, delayMs);
  };

  const hideLoadFailure = () => {
    if (loadFailureEl) loadFailureEl.hidden = true;
  };

  const showLoadFailure = (message: string, compatibility = false) => {
    const titleEl = byRole<HTMLElement>('load-failure-title');
    const detailEl = byRole<HTMLElement>('load-failure-detail');
    const errorEl = byRole<HTMLElement>('load-failure-error');
    const actionsEl = byRole<HTMLElement>('load-failure-actions');
    if (!loadFailureEl || !titleEl || !detailEl || !errorEl) return;
    const assetRelated = !compatibility && isAssetRelatedError(message);
    const fallback = options.getLastAssetFallback();
    titleEl.textContent = compatibility
      ? t.compatibilityTitle
      : assetRelated
        ? t.loadFailureTitle
        : t.startFailureTitle;
    detailEl.textContent = compatibility
      ? t.compatibilityDetail
      : assetRelated
        ? t.loadFailureDetail
        : '';
    detailEl.hidden = !compatibility && !assetRelated;
    errorEl.textContent = compatibility
      ? message
      : fallback
        ? `${message}\n${t.assetFallbackLabel(fallback.name, fallback.message)}`
        : message;
    if (actionsEl) actionsEl.hidden = compatibility;
    loadFailureEl.hidden = false;
  };

  const clearProcessingFallback = () => {
    window.clearTimeout(processingFallbackTimer);
    processingFallbackTimer = undefined;
  };

  const finishFileProcessing = () => {
    if (!options.isSessionReady()) return;
    const { errors, warnings } = countBy(lastDiagnostics);
    const latency = computeDiagnosticsLatencyMs(options.getLastEditAt(), perfNow());
    if (diagnosticSeq > 0) options.setStatus(t.statusReady(diagnosticSeq, latency), 'ready');
    if (errors === 0 && runOkEl?.hidden) scheduleRunPassedCheck(warnings, latency, 150);
  };

  const scheduleProcessingFallback = () => {
    clearProcessingFallback();
    processingFallbackTimer = window.setTimeout(() => {
      processingFallbackTimer = undefined;
      if (!fileProcessing || !options.isSessionReady()) return;
      fileProcessing = false;
      finishFileProcessing();
    }, 2000);
  };

  const countBy = (list: readonly LspDiagnostic[]) => ({
    errors: list.filter((d) => d.severity === 1 || d.severity === undefined).length,
    warnings: list.filter((d) => d.severity === 2).length,
  });

  const handleFileProgress = (params: { uri: string; processingCount: number }) => {
    if (params.uri.toLowerCase() !== uri.toLowerCase()) return;
    const wasProcessing = fileProcessing;
    fileProcessing = params.processingCount > 0;
    if (fileProcessing) {
      scheduleProcessingFallback();
      options.onProcessingChange(true);
      resetRunOk();
      if (options.isSessionReady() && diagnosticSeq > 0)
        options.setStatus(t.statusChecking, 'ready');
      return;
    }
    clearProcessingFallback();
    if (wasProcessing) finishFileProcessing();
    options.onProcessingChange(false);
  };

  const renderDiagnostics = (params: { uri: string; diagnostics: LspDiagnostic[] }) => {
    if (params.uri.toLowerCase() !== uri.toLowerCase()) return;

    const diagnostics = anchorImportDiagnostics(params.diagnostics, getCode());
    const latency = computeDiagnosticsLatencyMs(options.getLastEditAt(), perfNow());
    if (!firstDiagnosticsReported) {
      firstDiagnosticsReported = true;
      const startedAt = options.getRunStartedAt();
      trackEvent('first_diagnostics', {
        ms: startedAt ? perfNow() - startedAt : 0,
        count: diagnostics.length,
        arch: options.getSelectedArch(),
      });
    }
    diagnosticSeq += 1;
    if (fileProcessing) {
      scheduleProcessingFallback();
      options.setStatus(t.statusChecking, 'ready');
    } else {
      clearProcessingFallback();
      options.setStatus(t.statusReady(diagnosticSeq, latency), 'ready');
    }

    options.setModelMarkers(diagnostics);
    updatePassedBadge(diagnostics);
    lastDiagnostics = diagnostics;
    options.onDiagnostics?.(diagnostics);

    resetRunOk();
    const { errors, warnings } = countBy(diagnostics);
    if (variant === 'full' && errors === 0) scheduleRunPassedCheck(warnings, latency, 200);

    diagnosticsEl.replaceChildren();
    diagCountEl.textContent = String(diagnostics.length);
    if (diagnostics.length === 0) {
      diagnosticsEl.append(makeEl('li', mutedItemClass, t.statusNoDiagnostics(latency)));
      return;
    }

    for (const diagnostic of diagnostics) {
      const item = makeEl('li', 'mb-1.5');
      const button = makeEl('button', diagnosticClass);
      button.type = 'button';
      const sev = diagnostic.severity;
      const sevText =
        sev === 2
          ? t.severityWarning
          : sev === 1 || sev === undefined
            ? t.severityError
            : t.severityInfo;
      button.append(
        makeEl('span', diagnosticBadgeClass(sev), sevText),
        makeEl(
          'span',
          diagnosticLocationClass(sev),
          `${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`,
        ),
        makeEl('span', diagnosticMessageClass, diagnostic.message),
      );
      button.addEventListener('click', () => {
        options.revealLocation(
          diagnostic.range.start.line + 1,
          diagnostic.range.start.character + 1,
        );
      });
      item.append(button);

      const missing = /unknown (?:module prefix|package) '(Std|Batteries)'/.exec(
        diagnostic.message,
      );
      if (missing) {
        const library = missing[1]!;
        const fix = makeEl(
          'button',
          'mt-1 cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-[650] text-accent-contrast disabled:cursor-progress disabled:opacity-55',
          t.libraryQuickFix(library),
        );
        fix.type = 'button';
        fix.dataset.role = 'library-quick-fix';
        fix.addEventListener('click', () => {
          fix.disabled = true;
          fix.textContent = t.libraryQuickFixDone(library);
          options.onQuickFixLibrary(library.toLowerCase() as RuntimeExtensionId);
        });
        item.append(fix);
      }

      diagnosticsEl.append(item);
    }
  };

  const resetCycle = () => {
    hideLoadFailure();
    clearProcessingFallback();
    fileProcessing = false;
    firstDiagnosticsReported = false;
    barrierFallbackLogged = false;
    resetRunOk();
  };

  return {
    renderDiagnostics,
    handleFileProgress,
    onContentChanged: (currentCode: string) => {
      resetRunOk();
      if (
        passedEl &&
        exerciseStarter &&
        !isExerciseSolved(starterCode, currentCode, lastDiagnostics)
      ) {
        passedEl.hidden = true;
      }
    },
    showLoadFailure,
    hideLoadFailure,
    handleCrashDiagnostics: () => {
      clearProcessingFallback();
      fileProcessing = false;
      firstDiagnosticsReported = false;
      resetRunOk();
      if (shouldPreserveDiagnosticsOnCrash(lastDiagnostics)) return;
      const item = document.createElement('li');
      item.className = mutedItemClass;
      item.textContent = t.crashDiagnostics;
      diagnosticsEl.replaceChildren(item);
      diagCountEl.textContent = '0';
      lastDiagnostics = [];
    },
    resetRunOk,
    resetForStart: resetCycle,
    resetForStop: resetCycle,
    skipRunBarrier: () => {
      runBarrierDisabled = true;
    },
    isFileProcessing: () => fileProcessing,
    dispose: () => {
      resetRunOk();
      clearProcessingFallback();
    },
  };
};

export type DiagnosticsView = ReturnType<typeof createDiagnosticsView>;
