// editor.api 只带编辑器内核，不注册 80 多种内置语言，主包和内存都小得多。
import * as monaco from 'monaco-editor/editor/editor.api';
// 补全、悬停、查找等交互能力需要单独引入，见 monaco-contrib.ts。
import '../monaco-contrib';
import editorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { createMessageConnection } from 'vscode-jsonrpc/browser';
import LeanWorker from '../../node_modules/@wasm-idle/lsp/dist/lean4/worker.js?worker';
import { messagesFor, type Locale } from '../i18n';
import { setSourcePreference, type AssetSourcePreference } from '../asset-source';
import { cacheBudgetBytes, currentMemoryTier, wasm64MaxMemoryBytes } from '../device';
import {
  abbreviationSuggestions,
  findAbbreviationQuery,
  matchAbbreviation,
} from '../lean-abbreviations';
import { clearDraft, readDraft, saveDraft } from '../draft';
import { clearRuntimeCache } from '../runtime-cache';
import { isExerciseSolved, isExerciseStarter } from '../exercise';
import { findDeclaration } from '../lean-declaration';
import { stripGoalFence } from '../lean-goal';
import { LEAN_LANGUAGE_ID, registerLean } from '../lean-language';
import { markLessonCompleted } from '../progress';
import {
  computeDiagnosticsLatencyMs,
  decideCrashRecovery,
  isAssetRelatedError,
  nextAutoRestartDelayMs,
  shouldPreserveDiagnosticsOnCrash,
  shouldShowRunPassed,
} from '../lean-recovery';
import { extractImportLines, LeanSession, type LspDiagnostic } from '../lean-session';
import { createLeanMemoryGuard, sampleBrowserMemoryBytes } from '../lean-memory-guard';
import { toMonacoCompletions, type LspCompletionResult } from '../lsp-completion';
import { reportError, track } from '../telemetry';
import { getResolvedTheme, onResolvedThemeChange } from '../theme';
import {
  diagnosticBadgeClass,
  diagnosticClass,
  diagnosticLocationClass,
  diagnosticMessageClass,
  mutedItemClass,
  renderLeanMarkup,
  type LeanPanelVariant,
} from './lean-markup';

(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

registerLean(monaco);

export type { LeanPanelVariant };

export type LeanPanelProgressKind = 'idle' | 'loading' | 'ready' | 'error';

export type LeanPanelProgress = {
  /** 当前阶段文案，如“加载运行时…（首次约 102MB）”“启动 LSP…”。 */
  label: string;
  kind: LeanPanelProgressKind;
  /** 资产下载进度；未知时为 null，用不确定进度条。 */
  ratio: number | null;
};

export type LeanPanelOptions = {
  variant: LeanPanelVariant;
  code: string;
  locale: Locale;
  /** 面板可见时自动启动，省掉一次点击后的等待。 */
  autoStart?: boolean;
  /** 主包加载前用户已主动点过「启动 Lean」：挂载后立即启动（不延迟、不受低内存自动启动限制）。 */
  startImmediately?: boolean;
  /** 从课程练习进来时提供，用于显示「回到本课」并命名导出文件。 */
  lessonSlug?: string;
  /** 提供时按该 key 自动保存草稿，刷新后恢复。 */
  draftKey?: string;
  /** 启动与下载进度，供课程页在不可见面板外显示。 */
  onProgress?: (progress: LeanPanelProgress) => void;
};

export type LeanPanel = {
  setCode: (code: string, options?: { focus?: boolean }) => void;
  getCode: () => string;
  focus: () => void;
  /** 把代码送进语言服务器并等一次诊断结果，供课程页做内联输出。 */
  run: (code: string) => Promise<LspDiagnostic[]>;
  /** 读取当前进度快照，课程页点击运行时先回显已有状态。 */
  getProgress: () => LeanPanelProgress;
  /** 崩溃或手动关闭后重启引擎，编辑器内容保留。 */
  restart: () => Promise<boolean>;
};

export type { LspDiagnostic };

export const createLeanPanel = (host: HTMLElement, options: LeanPanelOptions): LeanPanel => {
  const {
    variant,
    code,
    locale,
    autoStart = false,
    startImmediately = false,
    lessonSlug,
    draftKey,
    onProgress,
  } = options;
  const t = messagesFor(locale).playground;
  const memoryTier = currentMemoryTier();
  const memoryGuardMaxBytes = wasm64MaxMemoryBytes(memoryTier);
  const draft = draftKey ? readDraft(draftKey) : null;

  // 若 SSG 已渲染完整外框且无需动态挂载练习回链，复用原 DOM 保持首屏 H1/布局不被替换。
  const hasPrerendered =
    !lessonSlug &&
    host.querySelector<HTMLElement>('[data-ssr-markup]')?.dataset.ssrMarkup === variant;
  if (!hasPrerendered) {
    host.innerHTML = renderLeanMarkup(locale, variant, t, lessonSlug);
  }

  const statusEl = host.querySelector<HTMLElement>('[data-role="status"]')!;
  const startEl = host.querySelector<HTMLButtonElement>('[data-role="start"]')!;
  startEl.disabled = false;
  const barEl = host.querySelector<HTMLElement>('[data-role="bar"]')!;
  const logEl = host.querySelector<HTMLPreElement>('[data-role="log"]')!;
  const diagnosticsEl = host.querySelector<HTMLUListElement>('[data-role="diagnostics"]')!;
  const diagCountEl = host.querySelector<HTMLElement>('[data-role="count"]')!;
  const runOkEl = host.querySelector<HTMLElement>('[data-role="run-ok"]');
  const runOkTitleEl = host.querySelector<HTMLElement>('[data-role="run-ok-title"]');
  const runOkDetailEl = host.querySelector<HTMLElement>('[data-role="run-ok-detail"]');
  const crashEl = host.querySelector<HTMLElement>('[data-role="crash"]');
  const crashTitleEl = host.querySelector<HTMLElement>('[data-role="crash-title"]');
  const crashDetailEl = host.querySelector<HTMLElement>('[data-role="crash-detail"]');
  const crashRestartEl = host.querySelector<HTMLButtonElement>('[data-role="crash-restart"]');
  const crashCopyEl = host.querySelector<HTMLButtonElement>('[data-role="crash-copy"]');
  const loadFailureEl = host.querySelector<HTMLElement>('[data-role="load-failure"]');
  const loadFailureTitleEl = host.querySelector<HTMLElement>('[data-role="load-failure-title"]');
  const loadFailureDetailEl = host.querySelector<HTMLElement>('[data-role="load-failure-detail"]');
  const loadFailureErrorEl = host.querySelector<HTMLElement>('[data-role="load-failure-error"]');
  const retryLoadEl = host.querySelector<HTMLButtonElement>('[data-role="retry-load"]');
  const sourceButtons = [...host.querySelectorAll<HTMLButtonElement>('[data-source]')];
  const goalEl = host.querySelector<HTMLPreElement>('[data-role="goal"]')!;
  const statementEl = host.querySelector<HTMLElement>('[data-role="goal-statement"]')!;
  const resetEl = host.querySelector<HTMLButtonElement>('[data-role="reset"]');
  const exportEl = host.querySelector<HTMLButtonElement>('[data-role="export"]');
  const passedEl = host.querySelector<HTMLElement>('[data-role="passed"]');

  // 先恢复分栏宽度、编辑器占比与面板显隐，再创建 Monaco，避免首帧后布局重排引发 CLS。
  const LAYOUT_KEY = 'lean-panel:layout';
  const PANELS_KEY = 'lean-panel:panels';
  const DEFAULT_RATIO = 0.45;

  const readLayout = (
    compact: boolean,
  ): { editorRatio: number; panelWidth: number | null; panels: Record<string, boolean> } => {
    const fallback = {
      editorRatio: DEFAULT_RATIO,
      panelWidth: null,
      // 完整编辑器默认显示日志；紧凑面板默认收起，给诊断留空间。
      panels: { goal: true, diagnostics: true, log: !compact },
    };
    try {
      const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as {
        editorRatio?: unknown;
        panelWidth?: unknown;
      };
      const panels = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') as Record<
        string,
        boolean
      >;
      return {
        editorRatio:
          typeof stored.editorRatio === 'number' &&
          stored.editorRatio >= 0.2 &&
          stored.editorRatio <= 0.7
            ? stored.editorRatio
            : DEFAULT_RATIO,
        panelWidth:
          typeof stored.panelWidth === 'number' &&
          stored.panelWidth >= 300 &&
          stored.panelWidth <= 800
            ? stored.panelWidth
            : null,
        panels: { ...fallback.panels, ...panels },
      };
    } catch {
      return fallback;
    }
  };

  const layout = readLayout(variant === 'compact');
  const editorWrap = host.querySelector<HTMLElement>('[data-role="editor-wrap"]');
  const resizeHandle = host.querySelector<HTMLElement>('[data-role="resize"]');

  const applyEditorRatio = (ratio: number) => {
    if (editorWrap) editorWrap.style.flex = `0 0 ${(ratio * 100).toFixed(2)}%`;
  };

  if (editorWrap && resizeHandle) {
    applyEditorRatio(layout.editorRatio);

    resizeHandle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const container = editorWrap.parentElement;
      if (!container) return;

      const total = container.clientHeight || 1;
      const startY = event.clientY;
      const startRatio = layout.editorRatio;

      const onMove = (moveEvent: PointerEvent) => {
        const next = startRatio + (moveEvent.clientY - startY) / total;
        layout.editorRatio = Math.min(0.7, Math.max(0.2, next));
        applyEditorRatio(layout.editorRatio);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        try {
          localStorage.setItem(
            LAYOUT_KEY,
            JSON.stringify({ editorRatio: layout.editorRatio, panelWidth: layout.panelWidth }),
          );
        } catch {
          // 隐私模式下写不了，忽略即可。
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // 完整编辑器允许拖动左右分栏；窄屏恢复单列，避免内联样式压过响应式布局。
  const workspaceEl = host.querySelector<HTMLElement>('[data-role="workspace"]');
  const splitHandle = host.querySelector<HTMLElement>('[data-role="split"]');
  const wideQuery = window.matchMedia('(min-width: 901px)');

  const splitColumns = (width: number) => `minmax(0, 1fr) 6px ${width}px`;

  const applySplit = () => {
    if (!workspaceEl || !splitHandle || layout.panelWidth === null) return;
    if (!wideQuery.matches) {
      workspaceEl.style.gridTemplateColumns = '';
      return;
    }
    const style = window.getComputedStyle(workspaceEl);
    const contentWidth =
      workspaceEl.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    // 6px 分隔条 + 两段 16px gap + 编辑器至少 320px。
    const width = Math.max(300, Math.min(layout.panelWidth, contentWidth - 320 - 38));
    workspaceEl.style.gridTemplateColumns = splitColumns(width);
  };

  applySplit();
  wideQuery.addEventListener('change', applySplit);

  if (splitHandle && workspaceEl) {
    splitHandle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const asideEl = host.querySelector<HTMLElement>('[data-role="aside"]');
      const startWidth = asideEl?.getBoundingClientRect().width ?? 340;
      const style = window.getComputedStyle(workspaceEl);
      const contentWidth =
        workspaceEl.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      const maxWidth = Math.max(300, contentWidth - 320 - 38);

      const onMove = (moveEvent: PointerEvent) => {
        const next = startWidth + (startX - moveEvent.clientX);
        layout.panelWidth = Math.min(maxWidth, Math.max(300, next));
        if (wideQuery.matches) {
          workspaceEl.style.gridTemplateColumns = splitColumns(layout.panelWidth);
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        try {
          localStorage.setItem(
            LAYOUT_KEY,
            JSON.stringify({ editorRatio: layout.editorRatio, panelWidth: layout.panelWidth }),
          );
        } catch {
          // 同上。
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  for (const toggle of host.querySelectorAll<HTMLInputElement>('[data-panel-toggle]')) {
    const key = toggle.dataset.panelToggle ?? '';
    const target = host.querySelector<HTMLElement>(`[data-panel="${key}"]`);
    const visible = layout.panels[key] ?? true;

    toggle.checked = visible;
    if (target) target.hidden = !visible;

    toggle.addEventListener('change', () => {
      if (target) target.hidden = !toggle.checked;
      layout.panels[key] = toggle.checked;
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(layout.panels));
      } catch {
        // 同上。
      }
    });
  }

  const uri = 'file:///workspace/Main.lean';
  const model = monaco.editor.createModel(
    draft?.code ?? code,
    LEAN_LANGUAGE_ID,
    monaco.Uri.parse(uri),
  );
  const editor = monaco.editor.create(host.querySelector<HTMLElement>('[data-role="editor"]')!, {
    model,
    theme: getResolvedTheme() === 'light' ? 'vs' : 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 15,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: 24,
    scrollBeyondLastLine: false,
    padding: { top: 16, bottom: 16 },
    renderLineHighlight: 'all',
    tabSize: 2,
    wordWrap: 'on',
  });
  editor.layout();

  const stopThemeSync = onResolvedThemeChange((theme) => {
    monaco.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark');
  });

  // Lean 的 \to / \forall 缩写：Tab 或空格后替换成 Unicode 符号。
  // 空格已经插入，所以替换范围要排除最后那个空格；Tab 则需要自己移动光标。
  const expandAbbreviation = (offset: number): boolean => {
    const position = editor.getPosition();
    if (!position) return false;
    const line = model.getLineContent(position.lineNumber);
    const targetColumn = position.column - offset;
    const match = matchAbbreviation(line, targetColumn);
    if (!match) return false;
    editor.executeEdits('lean-abbreviations', [
      {
        range: new monaco.Range(
          position.lineNumber,
          match.startColumn,
          position.lineNumber,
          targetColumn,
        ),
        text: match.symbol,
        forceMoveMarkers: true,
      },
    ]);
    if (offset === 0) {
      editor.setPosition({
        lineNumber: position.lineNumber,
        column: match.startColumn + match.symbol.length,
      });
    }
    return true;
  };

  editor.onKeyDown((event) => {
    if (event.keyCode === monaco.KeyCode.Tab && expandAbbreviation(0)) {
      event.preventDefault();
    }
  });

  // Monaco 没有公开的单字符输入事件，这里从内容变更里识别「插入了一个空格」。
  model.onDidChangeContent((event) => {
    if (event.changes.length !== 1) return;
    const change = event.changes[0];
    if (change?.text === ' ' && change.rangeLength === 0) {
      // 在变更事件里直接改文档会重入，推迟到当前事件处理完。
      window.setTimeout(() => expandAbbreviation(1), 0);
    }
  });

  // 输入 `\` 时给出缩写候选，忘了拼写也能选；选中后整段 `\name` 替换为符号。
  monaco.languages.registerCompletionItemProvider(LEAN_LANGUAGE_ID, {
    triggerCharacters: ['\\'],
    provideCompletionItems: (completionModel, position) => {
      const line = completionModel.getLineContent(position.lineNumber);
      const query = findAbbreviationQuery(line, position.column);
      if (!query) return { suggestions: [] };
      const range = new monaco.Range(
        position.lineNumber,
        query.startColumn,
        position.lineNumber,
        position.column,
      );
      return {
        suggestions: abbreviationSuggestions(query.query).map(({ name, symbol }, index) => ({
          // 用对象形式的 label：Monaco 才会把 description 显示在每一行，而不是只在选中行显示 detail。
          label: {
            label: `\\${name}`,
            description: `${symbol}\u2003\u2003${t.abbreviationDetail}`,
          },
          kind: monaco.languages.CompletionItemKind.Text,
          insertText: symbol,
          range,
          // 用表内顺序而不是字母序，先出现 \to / \forall 这类高频缩写。
          sortText: String(index).padStart(3, '0'),
        })),
      };
    },
  });

  // 练习工具条：重置先进入一次「确认重置？」状态，再点才覆盖代码，避免手滑。
  let resetArmTimer: number | undefined;
  const disarmReset = () => {
    window.clearTimeout(resetArmTimer);
    if (!resetEl) return;
    delete resetEl.dataset.armed;
    resetEl.textContent = t.resetCode;
  };

  resetEl?.addEventListener('click', () => {
    if (resetEl.dataset.armed !== 'true') {
      if (model.getValue() === code) return;
      resetEl.dataset.armed = 'true';
      resetEl.textContent = t.resetConfirmAction;
      window.clearTimeout(resetArmTimer);
      resetArmTimer = window.setTimeout(disarmReset, 3000);
      return;
    }
    disarmReset();
    if (draftKey) clearDraft(draftKey);
    if (passedEl) passedEl.hidden = true;
    model.setValue(code);
    editor.setPosition({ lineNumber: 1, column: 1 });
    editor.revealLine(1);
    editor.focus();
  });
  resetEl?.addEventListener('blur', disarmReset);

  exportEl?.addEventListener('click', () => {
    const blob = new Blob([model.getValue()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${lessonSlug ?? 'playground'}.lean`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  // 只有带 sorry 的具名练习才有「过关」概念；还必须保留 starter 里的定理名。
  const exerciseStarter = isExerciseStarter(code);
  const updatePassedBadge = (list: LspDiagnostic[]) => {
    if (!exerciseStarter) return;
    const solved = isExerciseSolved(code, model.getValue(), list);
    if (passedEl) passedEl.hidden = !solved;
    // 从课程练习进入 playground 时带 lessonSlug：通过即写入完成进度。
    if (solved && lessonSlug) markLessonCompleted(lessonSlug);
  };

  const log = (message: string) => {
    logEl.textContent += `[${new Date().toLocaleTimeString()}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  if (draft) log(t.logDraftRestored);

  let draftTimer: number | undefined;
  const scheduleDraftSave = () => {
    if (!draftKey) return;
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => saveDraft(draftKey, model.getValue()), 400);
  };
  const saveDraftNow = () => {
    if (!draftKey) return;
    window.clearTimeout(draftTimer);
    saveDraft(draftKey, model.getValue());
  };

  let lastEditAt = 0;
  let lastDiagnostics: LspDiagnostic[] = [];
  let changePending = false;
  let diagnosticSeq = 0;
  let debounceTimer: number | undefined;
  // 成功提示必须等 documentSymbol 屏障和诊断静默窗口结束后再显示，避免先亮后灭。
  let successTimer: number | undefined;
  let settleTimer: number | undefined;
  let successSeq = 0;
  // 屏障不可用（请求失败、返回 null 或超时）时绝不误亮通过，只记录一次日志。
  let barrierFallbackLogged = false;
  let runBarrierDisabled = false;
  let fileProcessing = false;

  let progressLabel = t.statusIdle;
  let progressKind: LeanPanelProgressKind = 'idle';
  let progressRatio: number | null = null;
  let hasAssetProgress = false;

  // 观测用：一次启动只报一条 LSP 就绪、一条首帧诊断；资产进度只报首字节与完成。
  let runStartedAt = 0;
  let firstDiagnosticsReported = false;
  const assetTelemetry = { started: false, completed: false, startedAt: 0 };

  // 崩溃恢复：只自动重启一次；60 秒内再次崩溃就交给用户处理，避免崩溃循环。
  let engineEverReady = false;
  let recoveryPending = false;
  let recoveryAttempt = 0;
  let autoRecoverTimer: number | undefined;
  let autoStartTimer: number | undefined;
  let startInflight: Promise<boolean> | null = null;
  let lastCrashAt = 0;

  const cancelAutoRecover = () => {
    window.clearTimeout(autoRecoverTimer);
    autoRecoverTimer = undefined;
  };

  const cancelAutoStart = () => {
    window.clearTimeout(autoStartTimer);
    autoStartTimer = undefined;
  };
  let lastCrashMessage = '';
  let lastCrashedCode: string | null = null;
  let lastStartError: string | null = null;
  let lastAssetFallback: { name: string; message: string } | null = null;
  let freshHandled = false;

  const formatMb = (bytes: number): string => Math.round(bytes / (1024 * 1024)).toString();
  const memoryGuard = createLeanMemoryGuard({
    maxBytes: memoryGuardMaxBytes,
    sampleMemoryBytes: () => sampleBrowserMemoryBytes(),
    onPollError: (error) => {
      log(t.logRuntimeError(error instanceof Error ? error.message : String(error)));
    },
    onRecycle: ({ peakBytes, reason }) => {
      const mb = formatMb(peakBytes);
      if (reason === 'background-hidden') {
        if (!session.isReady) return;
        log(t.logMemoryBackgroundRelease(mb));
        stop();
        return;
      }
      if (!session.isReady || fileProcessing || startInflight) return;
      log(t.logMemorySoftRecycle(mb));
      stop();
      void start();
    },
    onHardLimit: ({ bytes, maxBytes }) => {
      const mb = formatMb(bytes);
      const limitMb = formatMb(maxBytes);
      log(t.logMemoryHardLimit(mb, limitMb));
      reportError('memory-limit', `${mb}/${limitMb} MB`);
      stop();
      setStatus(t.statusMemoryLimit, 'error');
    },
  });
  const onVisibilityChange = () => {
    memoryGuard.setVisible(document.visibilityState !== 'hidden');
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const emitProgress = () =>
    onProgress?.({ label: progressLabel, kind: progressKind, ratio: progressRatio });

  const setStatus = (text: string, kind: LeanPanelProgressKind = 'idle') => {
    statusEl.textContent = text;
    statusEl.title = text;
    statusEl.dataset.state = kind;
    progressLabel = text;
    progressKind = kind;
    emitProgress();
  };

  const setProgress = (ratio: number | null) => {
    barEl.style.width =
      ratio === null ? '0%' : `${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%`;
    progressRatio = ratio;
    emitProgress();
  };

  // 低内存设备不自动下载：状态里写清楚，并把原因挂在启动按钮上。
  if (memoryTier === 'low') {
    setStatus(t.statusLowMemory, 'idle');
    startEl.title = t.lowMemoryHint;
    log(t.logLowMemory);
  }

  // Pages 静态资源不支持 Range；Service Worker 从站点同源 /cdn/ 网关（Function → R2）
  // 分片下载 Lean 资产，网关不可用时回退 GitHub raw，最后回退同源全量请求。
  const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return;
    const startedAt = performance.now();
    try {
      await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      log(t.logSwReady);
      track('sw', { ok: true, ms: performance.now() - startedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(t.logSwFailed(message));
      track('sw', { ok: false, ms: performance.now() - startedAt, message });
    }
  };

  void registerServiceWorker();

  const onServiceWorkerMessage = (event: MessageEvent) => {
    const data = event.data as {
      type?: string;
      name?: string;
      loaded?: number;
      total?: number;
      overallLoaded?: number;
      overallTotal?: number;
      message?: string;
      source?: string;
    };
    if (data?.type === 'lean-asset-fallback' && data.name) {
      lastAssetFallback = { name: data.name, message: data.message ?? 'unknown error' };
      log(t.statusChunkFallback(data.name, data.message ?? 'unknown error'));
      return;
    }
    if (data?.type !== 'lean-asset-progress' || !data.name || !data.loaded || !data.total) return;

    // 新 SW 会带上所有资产累计后的总进度；旧 SW 只有单资产数据时退回单资产。
    const loaded = data.overallLoaded ?? data.loaded;
    const total = data.overallTotal ?? data.total;
    if (total <= 0) return;
    hasAssetProgress = true;
    // 全部字节下载完后 Lean 还要解压和初始化，此时文案切回启动阶段。
    const downloaded = loaded >= total;

    if (!assetTelemetry.started) {
      assetTelemetry.started = true;
      assetTelemetry.startedAt = performance.now();
      track('assets', { phase: 'first_bytes', source: data.source ?? 'unknown' });
    }
    if (downloaded && !assetTelemetry.completed) {
      assetTelemetry.completed = true;
      track('assets', {
        phase: 'complete',
        bytes: total,
        ms: performance.now() - assetTelemetry.startedAt,
      });
    }
    setStatus(
      downloaded
        ? t.statusStarting
        : total < 0.1 * 1048576
          ? t.statusLoading
          : t.statusChunks((loaded / 1048576).toFixed(1), (total / 1048576).toFixed(1)),
      'loading',
    );
    setProgress(loaded / total);
  };

  navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);

  const severityOf = (severity?: number): monaco.MarkerSeverity => {
    switch (severity) {
      case 2:
        return monaco.MarkerSeverity.Warning;
      case 3:
        return monaco.MarkerSeverity.Info;
      case 4:
        return monaco.MarkerSeverity.Hint;
      default:
        return monaco.MarkerSeverity.Error;
    }
  };

  const resetRunOk = () => {
    successSeq += 1;
    window.clearTimeout(successTimer);
    successTimer = undefined;
    window.clearTimeout(settleTimer);
    settleTimer = undefined;
    if (runOkEl) runOkEl.hidden = true;
  };

  /**
   * 诊断是分批到达的：第一批没有错误不代表整个文件通过。
   * 必须结合 $/lean/fileProgress 空闲与 documentSymbol 屏障，再等 150ms 静默才亮成功提示；
   * 屏障失败、超时或文件仍在处理中时，绝不能假显示“运行通过”。
   */
  const confirmRunSettled = async (seq: number, warningCount: number, latencyMs: number) => {
    if (variant !== 'full' || seq !== successSeq || !session.isReady || fileProcessing) return;
    let barrierOk = !runBarrierDisabled;
    if (barrierOk) {
      try {
        const result = await Promise.race([
          session.request('textDocument/documentSymbol', { textDocument: { uri } }),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000)),
        ]);
        if (result === null) barrierOk = false;
      } catch {
        barrierOk = false;
      }
    }
    if (seq !== successSeq || !session.isReady || fileProcessing) return;
    if (!barrierOk) {
      if (!barrierFallbackLogged) {
        barrierFallbackLogged = true;
        log(t.logRunBarrierFallback);
      }
      if (lastDiagnostics.length === 0) {
        setStatus(t.statusRunUnconfirmed, 'ready');
        const item = document.createElement('li');
        item.className = mutedItemClass;
        item.textContent = t.diagnosticsUnconfirmed;
        diagnosticsEl.replaceChildren(item);
      }
      return;
    }
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = undefined;
      if (seq !== successSeq || !session.isReady) return;
      if (!runOkEl || !runOkTitleEl || !runOkDetailEl) return;
      if (
        !shouldShowRunPassed({
          variant,
          barrierOk,
          fileProcessing,
          diagnostics: lastDiagnostics,
        })
      ) {
        return;
      }
      lastCrashedCode = null;
      runOkTitleEl.textContent = t.runPassed;
      runOkDetailEl.textContent = t.runPassedDetail(warningCount, latencyMs);
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

  const showLoadFailure = (message: string) => {
    if (!loadFailureEl || !loadFailureTitleEl || !loadFailureDetailEl || !loadFailureErrorEl)
      return;
    const assetRelated = isAssetRelatedError(message);
    loadFailureTitleEl.textContent = assetRelated ? t.loadFailureTitle : t.startFailureTitle;
    loadFailureDetailEl.textContent = assetRelated ? t.loadFailureDetail : '';
    loadFailureDetailEl.hidden = !assetRelated;
    loadFailureErrorEl.textContent = lastAssetFallback
      ? `${message}\n${t.assetFallbackLabel(lastAssetFallback.name, lastAssetFallback.message)}`
      : message;
    loadFailureEl.hidden = false;
  };

  const renderDiagnostics = (params: { uri: string; diagnostics: LspDiagnostic[] }) => {
    if (params.uri.toLowerCase() !== uri.toLowerCase()) return;

    const latency = computeDiagnosticsLatencyMs(lastEditAt, performance.now());
    if (!firstDiagnosticsReported) {
      firstDiagnosticsReported = true;
      track('first_diagnostics', {
        ms: runStartedAt ? performance.now() - runStartedAt : 0,
        count: params.diagnostics.length,
      });
    }
    diagnosticSeq += 1;
    setStatus(fileProcessing ? t.statusChecking : t.statusReady(diagnosticSeq, latency), 'ready');

    monaco.editor.setModelMarkers(
      model,
      LEAN_LANGUAGE_ID,
      params.diagnostics.map((diagnostic) => ({
        severity: severityOf(diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source ?? 'Lean',
        startLineNumber: diagnostic.range.start.line + 1,
        startColumn: diagnostic.range.start.character + 1,
        endLineNumber: diagnostic.range.end.line + 1,
        endColumn: diagnostic.range.end.character + 1,
      })),
    );

    updatePassedBadge(params.diagnostics);
    lastDiagnostics = params.diagnostics;

    // 每批新诊断先收起旧的“运行通过”，等文件处理完再决定是否重新显示。
    resetRunOk();
    const errorCount = params.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 1 || diagnostic.severity === undefined,
    ).length;
    const warningCount = params.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 2,
    ).length;
    if (variant === 'full' && errorCount === 0) {
      scheduleRunPassedCheck(warningCount, latency, 200);
    }

    diagnosticsEl.replaceChildren();
    diagCountEl.textContent = String(params.diagnostics.length);

    if (params.diagnostics.length === 0) {
      const item = document.createElement('li');
      item.className = mutedItemClass;
      item.textContent = t.statusNoDiagnostics(latency);
      diagnosticsEl.append(item);
      return;
    }

    for (const diagnostic of params.diagnostics) {
      const item = document.createElement('li');
      item.className = 'mb-1.5';
      const button = document.createElement('button');
      button.className = diagnosticClass;
      button.type = 'button';

      const severity = diagnostic.severity;
      const badge = document.createElement('span');
      badge.className = diagnosticBadgeClass(severity);
      badge.textContent =
        severity === 2
          ? t.severityWarning
          : severity === 1 || severity === undefined
            ? t.severityError
            : t.severityInfo;

      const location = document.createElement('span');
      location.className = diagnosticLocationClass(severity);
      location.textContent = `${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`;

      const message = document.createElement('span');
      message.className = diagnosticMessageClass;
      message.textContent = diagnostic.message;

      button.append(badge, location, message);
      button.addEventListener('click', () => {
        const position = {
          lineNumber: diagnostic.range.start.line + 1,
          column: diagnostic.range.start.character + 1,
        };
        editor.setPosition(position);
        editor.revealPositionInCenter(position);
        editor.focus();
      });

      item.append(button);
      diagnosticsEl.append(item);
    }
  };

  const session = new LeanSession({
    createServer: async () => {
      // 运行时约 700KB，按需加载，首屏只留编辑器。
      const { getLean4LanguageServer } = await import('@wasm-idle/lsp/lean4');
      return getLean4LanguageServer({
        rootUrl: '/',
        // 慢网络下 22MB 的 pack 可能超过 10 分钟，放宽超时避免下载中途被中止。
        startupTimeoutMs: 60 * 60_000,
        assetTimeoutMs: 60 * 60_000,
        // 低内存设备只下调持久缓存；wasm 上限保持 1GiB，Init 导入峰值需要它。
        persistentCache: {
          maxBytes: cacheBudgetBytes(memoryTier),
          maxEntryBytes: cacheBudgetBytes(memoryTier),
        },
        // Init 导入后堆约 370 MiB，但导入峰值更高，1 GiB 才稳。
        lean4: { maxMemoryBytes: 1024 ** 3 },
        createWorker: () => {
          const worker = new LeanWorker();
          worker.addEventListener('message', (event: MessageEvent<{ memoryBytes?: unknown }>) => {
            if (typeof event.data?.memoryBytes === 'number') {
              memoryGuard.reportBytes(event.data.memoryBytes, 'event');
            }
          });
          return worker;
        },
        onStatus: (status) => {
          if (status.state === 'loading') {
            // 资产字节数统一用 SW 的聚合进度，避免两个来源轮流覆盖导致百分比回跳。
            // 首块分片可能几十秒才完成，这里保留 start() 的“加载运行时…”文案，
            // 不要提前写成“启动 LSP…”让人误以为下载已经结束。
            if (!hasAssetProgress) setProgress(null);
          } else if (status.state === 'ready') {
            engineEverReady = true;
            setProgress(1);
            setStatus(t.statusLspReady, 'ready');
            log(t.logRuntimeReady);
            track('lsp_ready', { ms: runStartedAt ? performance.now() - runStartedAt : 0 });
          } else if (status.state === 'error') {
            log(t.logRuntimeError(status.message));
            reportError('runtime', status.message);
            if (engineEverReady) {
              handleRuntimeCrash(status.message);
            } else {
              setStatus(t.statusError(status.message), 'error');
            }
          }
        },
      });
    },
    createConnection: (server) =>
      createMessageConnection(server.transport.reader, server.transport.writer),
    onDiagnostics: renderDiagnostics,
    onFileProgress: (params) => {
      if (params.uri.toLowerCase() !== uri.toLowerCase()) return;
      const wasProcessing = fileProcessing;
      fileProcessing = params.processingCount > 0;
      if (fileProcessing) {
        memoryGuard.setProcessing(true);
        resetRunOk();
        if (session.isReady && diagnosticSeq > 0) {
          setStatus(t.statusChecking, 'ready');
        }
        return;
      }
      if (wasProcessing && session.isReady) {
        const errorCount = lastDiagnostics.filter(
          (diagnostic) => diagnostic.severity === 1 || diagnostic.severity === undefined,
        ).length;
        const warningCount = lastDiagnostics.filter(
          (diagnostic) => diagnostic.severity === 2,
        ).length;
        const latency = computeDiagnosticsLatencyMs(lastEditAt, performance.now());
        if (diagnosticSeq > 0) {
          setStatus(t.statusReady(diagnosticSeq, latency), 'ready');
        }
        if (errorCount === 0 && runOkEl?.hidden) {
          scheduleRunPassedCheck(warningCount, latency, 150);
        }
      }
      memoryGuard.setProcessing(false);
    },
    onLog: log,
    // #check 的信息可能比 documentSymbol 晚几十毫秒，留一个静默窗口避免丢输出。
    diagnosticSettleMs: 300,
  });

  const lspRequest = async <T>(method: string, params: unknown): Promise<T | null> => {
    try {
      return await session.request<T>(method, params);
    } catch (error) {
      log(t.logRequestFailed(method, error instanceof Error ? error.message : String(error)));
      return null;
    }
  };

  const positionParams = (position: monaco.Position) => ({
    textDocument: { uri },
    position: { line: position.lineNumber - 1, character: position.column - 1 },
  });

  let lastSyncedImports = extractImportLines(model.getValue());

  const syncEditorChange = (): void => {
    if (!session.isReady) return;
    changePending = false;
    const nextCode = model.getValue();
    const nextImports = extractImportLines(nextCode);
    if (nextImports !== lastSyncedImports) {
      lastSyncedImports = nextImports;
      // 头部 import 变化会使整份 FileWorker 快照失效；若堆水位已过高，直接重建 Worker 顺手释放旧堆。
      if (memoryGuard.shouldRecycleOnImportChange()) {
        log(t.logMemoryImportRecycle(formatMb(memoryGuard.getSnapshot().peakBytes)));
        stop();
        void start();
        return;
      }
    }
    lastEditAt = performance.now();
    session.change(nextCode);
    memoryGuard.recordEdit();
  };

  /**
   * 补全、悬停、跳转都基于 LSP 当前文档。编辑有 350ms 防抖，请求前必须先把
   * 未发送的改动刷过去，否则服务端会按旧文档计算（表现为刚输入 `.` 补全为空）。
   */
  const flushChange = () => {
    if (!session.isReady || !changePending) return;
    window.clearTimeout(debounceTimer);
    syncEditorChange();
  };

  monaco.languages.registerHoverProvider(LEAN_LANGUAGE_ID, {
    provideHover: async (_model, position) => {
      if (!(await session.whenReady())) return null;
      flushChange();
      const hover = await lspRequest<{
        contents:
          | string
          | { kind?: string; value: string }
          | Array<string | { kind?: string; value: string }>;
      }>('textDocument/hover', positionParams(position));
      log(t.logHover(position.lineNumber, position.column, Boolean(hover)));
      if (!hover?.contents) return null;

      const contents = (Array.isArray(hover.contents) ? hover.contents : [hover.contents]).map(
        (entry) => (typeof entry === 'string' ? { value: entry } : { value: entry.value }),
      );
      return { contents };
    },
  });

  monaco.languages.registerCompletionItemProvider(LEAN_LANGUAGE_ID, {
    triggerCharacters: ['.'],
    provideCompletionItems: async (completionModel, position) => {
      // 运行时就绪早于 LSP 初始化，启动窗口内的请求先等握手完成，避免空补全。
      if (!(await session.whenReady())) return { suggestions: [], incomplete: false };
      flushChange();
      const result = await lspRequest<LspCompletionResult>(
        'textDocument/completion',
        positionParams(position),
      );
      const word = completionModel.getWordUntilPosition(position);
      const fallback = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      const { suggestions, incomplete } = toMonacoCompletions(result, fallback);
      log(t.logCompletion(position.lineNumber, position.column, suggestions.length));
      return { suggestions, incomplete };
    },
  });

  monaco.languages.registerDefinitionProvider(LEAN_LANGUAGE_ID, {
    provideDefinition: async (_model, position) => {
      if (!(await session.whenReady())) return null;
      flushChange();
      const result = await lspRequest<
        | {
            uri: string;
            range: {
              start: { line: number; character: number };
              end: { line: number; character: number };
            };
          }
        | Array<{
            uri: string;
            range: {
              start: { line: number; character: number };
              end: { line: number; character: number };
            };
          }>
      >('textDocument/definition', positionParams(position));
      if (!result) return null;
      const locations = Array.isArray(result) ? result : [result];
      return locations
        .filter((location) => location.uri.toLowerCase() === uri.toLowerCase())
        .map((location) => ({
          uri: monaco.Uri.parse(location.uri),
          range: new monaco.Range(
            location.range.start.line + 1,
            location.range.start.character + 1,
            location.range.end.line + 1,
            location.range.end.character + 1,
          ),
        }));
    },
  });

  // 面板第一行：光标所在声明的签名。与光标列位置无关，只在跨行或改代码时变化。
  let lastDeclVersion = -1;
  let lastDeclLine = -1;
  const updateStatement = () => {
    const position = editor.getPosition();
    if (!position) return;
    const version = model.getVersionId();
    if (version === lastDeclVersion && position.lineNumber === lastDeclLine) return;
    lastDeclVersion = version;
    lastDeclLine = position.lineNumber;
    const declaration = findDeclaration(model.getLinesContent(), position.lineNumber - 1);
    const text = declaration?.signature ?? '';
    if (statementEl.textContent !== text) {
      statementEl.textContent = text;
      statementEl.title = text;
    }
    statementEl.hidden = text === '';
  };

  updateStatement();

  model.onDidChangeContent(() => {
    lastCrashedCode = null;
    updateStatement();
    scheduleDraftSave();
    disarmReset();
    // 代码一改就收起旧的“运行通过”；等新诊断真正处理完再重新显示。
    resetRunOk();
    // 改回 sorry 或删掉目标定理时立即收起徽章，不用等下一轮诊断。
    if (passedEl && exerciseStarter && !isExerciseSolved(code, model.getValue(), lastDiagnostics)) {
      passedEl.hidden = true;
    }
    if (suppressSync) return;
    changePending = true;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(syncEditorChange, 350);
  });

  let goalSupported = true;
  let goalTimer: number | undefined;
  let suppressSync = false;

  /** 会话层等待启动、串行重开文档并收集诊断；这里只同步 Monaco 的内容。 */
  const run = (code: string) => {
    // 崩溃或启动失败后会话已释放，run 会立刻返回空数组；改成显式失败，课程页才能显示恢复按钮。
    if (recoveryPending) {
      return Promise.reject(new Error(lastCrashMessage || 'Lean process crashed'));
    }
    if (lastStartError) {
      return Promise.reject(new Error(lastStartError));
    }
    const crashAt = lastCrashAt;
    return session
      .run(code, () => {
        if (runStartedAt === 0) runStartedAt = performance.now();
        suppressSync = true;
        model.setValue(code);
        suppressSync = false;
        lastSyncedImports = extractImportLines(code);
      })
      .then((list) => {
        if (lastCrashAt !== crashAt) {
          throw new Error(lastCrashMessage || 'Lean process crashed');
        }
        return list;
      });
  };

  const requestGoal = async () => {
    if (!session.isReady || !goalSupported) return;
    flushChange();
    const position = editor.getPosition();
    if (!position) return;
    try {
      const result = await session.request<{ rendered?: string; goals?: string[] }>(
        '$/lean/plainGoal',
        positionParams(position),
      );
      const rendered = result?.rendered ? stripGoalFence(result.rendered) : '';
      const text = rendered || (result?.goals ?? []).join('\n\n').trim();
      if (text) {
        goalEl.textContent = text;
        return;
      }
      // 光标停在声明行时 Lean 还没有目标；如果证明体仍是 sorry，别显示成轻松的“没有 Goal”。
      const declaration = findDeclaration(model.getLinesContent(), position.lineNumber - 1);
      const atDeclarationHeader = declaration?.startLine === position.lineNumber - 1;
      goalEl.textContent =
        atDeclarationHeader && /\bsorry\b/.test(model.getValue()) ? t.goalHint : t.goalEmpty;
    } catch (error) {
      goalSupported = false;
      goalEl.textContent = t.goalUnsupported;
      log(t.logGoalFailed(error instanceof Error ? error.message : String(error)));
    }
  };

  editor.onDidChangeCursorPosition(() => {
    updateStatement();
    window.clearTimeout(goalTimer);
    goalTimer = window.setTimeout(requestGoal, 250);
  });

  /** 关闭引擎：终止 worker 并释放它占的内存，编辑器内容保留。 */
  const stop = () => {
    cancelAutoStart();
    cancelAutoRecover();
    memoryGuard.reset();
    window.clearTimeout(debounceTimer);
    window.clearTimeout(goalTimer);
    session.stop();
    engineEverReady = false;
    recoveryPending = false;
    fileProcessing = false;
    lastCrashedCode = null;
    lastStartError = null;
    lastAssetFallback = null;
    if (crashEl) crashEl.hidden = true;
    hideLoadFailure();
    goalSupported = true;
    runStartedAt = 0;
    firstDiagnosticsReported = false;
    barrierFallbackLogged = false;
    hasAssetProgress = false;
    resetRunOk();
    setStatus(memoryTier === 'low' ? t.statusLowMemory : t.statusIdle, 'idle');
    setProgress(0);
    goalEl.textContent = t.goalPlaceholder;
    statementEl.hidden = true;
    startEl.textContent = t.start;
    log(t.logStopped);
  };

  const runStart = async (): Promise<boolean> => {
    startEl.disabled = true;
    lastStartError = null;
    lastAssetFallback = null;
    hideLoadFailure();
    // 首次下载约 102 MB；在用户手势中申请持久存储，避免浏览器清理已校验的缓存。
    void navigator.storage?.persist?.().catch(() => {});
    setStatus(t.statusLoading, 'loading');
    setProgress(0);
    hasAssetProgress = false;
    fileProcessing = false;
    barrierFallbackLogged = false;
    resetRunOk();
    const startedAt = performance.now();
    runStartedAt = startedAt;
    firstDiagnosticsReported = false;
    assetTelemetry.started = false;
    assetTelemetry.completed = false;

    if ('serviceWorker' in navigator) {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
      ]);
    }

    // ?fresh 只在本次页面生命周期里清一次；自动重启时不能再清缓存重新下载 102MB。
    if (!freshHandled && new URLSearchParams(location.search).has('fresh')) {
      freshHandled = true;
      await clearRuntimeCache();
      log(t.logCacheCleared);
    }

    try {
      const startCode = model.getValue();
      lastSyncedImports = extractImportLines(startCode);
      await session.start(startCode);
      // 启动期间用户可能已经改过代码；didOpen 用的是启动那一刻的内容，这里补一次同步。
      flushChange();
      startEl.textContent = t.stop;
      engineEverReady = true;
      lastStartError = null;
      hideLoadFailure();
      lastEditAt = performance.now();
      setStatus(t.statusWaitingDiagnostics, 'ready');
      log(t.logInitialize(((performance.now() - startedAt) / 1000).toFixed(2)));
      if (recoveryPending) {
        recoveryPending = false;
        recoveryAttempt = 0;
        if (crashEl) crashEl.hidden = true;
        if (crashRestartEl) crashRestartEl.disabled = false;
        log(t.logRecovered);
      }
      window.setTimeout(requestGoal, 800);
      return true;
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      lastStartError = message;
      // 自动重启第一次失败很常见：旧连接的 pending 请求刚被 reject。保留恢复状态并重试一次，
      // 不要立刻把“自动重启失败”推给用户。
      if (!recoveryPending || recoveryAttempt >= 1) {
        setStatus(t.statusFailure(message), 'error');
      }
      log(t.logStartFailed(message));
      console.error(error);
      reportError('start', error);
      if (recoveryPending && recoveryAttempt >= 1 && crashEl && crashTitleEl && crashDetailEl) {
        crashTitleEl.textContent = t.crashRestartFailed;
        crashDetailEl.textContent = t.crashAutoDetail(message);
        crashEl.hidden = false;
        if (crashRestartEl) crashRestartEl.disabled = false;
      } else if (!recoveryPending) {
        showLoadFailure(message);
      }
      return false;
    } finally {
      startInflight = null;
      startEl.disabled = false;
    }
  };

  const start = (): Promise<boolean> => {
    cancelAutoRecover();
    if (startInflight) return startInflight;
    startInflight = runStart();
    return startInflight;
  };

  startEl.addEventListener('click', () => {
    if (session.isReady) stop();
    else void start();
  });

  /**
   * Lean worker 崩溃：释放旧会话、清掉过期诊断，并在 60 秒内首次崩溃时自动重启。
   * 连续崩溃不自动循环，避免把用户困在「崩溃—重启—再崩溃」里。
   */
  function handleRuntimeCrash(message: string) {
    const now = Date.now();
    const currentCode = model.getValue();
    const sameCodeAsLastCrash = lastCrashedCode !== null && currentCode === lastCrashedCode;
    // 同一次崩溃可能同时触发 onStatus 与 run 失败，2 秒内只处理第一条。
    // 栈溢出或同一份代码重复崩溃时不自动重启，避免陷入「通过 → 爆栈 → 重启」循环。
    const decision = decideCrashRecovery({
      variant,
      now,
      lastCrashAt,
      message,
      sameCodeAsLastCrash,
    });
    if (decision === 'ignore') return;
    const canAutoRestart = decision === 'auto';
    lastCrashAt = now;
    lastCrashMessage = message;
    lastCrashedCode = currentCode;
    fileProcessing = false;
    memoryGuard.reset();
    cancelAutoRecover();
    session.stop();
    engineEverReady = false;
    recoveryPending = true;
    recoveryAttempt = 0;
    runStartedAt = 0;
    firstDiagnosticsReported = false;
    lastStartError = null;
    lastAssetFallback = null;
    hideLoadFailure();
    startEl.textContent = t.start;
    setStatus(
      canAutoRestart ? t.statusRecovering : t.statusCrash,
      canAutoRestart ? 'loading' : 'error',
    );
    setProgress(0);
    hasAssetProgress = false;
    resetRunOk();
    goalEl.textContent = t.goalPlaceholder;
    statementEl.hidden = true;
    // 崩溃或爆栈前已经诊断出来的错误/警告应保留展示，方便用户直接定位问题代码。
    if (!shouldPreserveDiagnosticsOnCrash(lastDiagnostics)) {
      diagnosticsEl.replaceChildren();
      const item = document.createElement('li');
      item.className = mutedItemClass;
      item.textContent = t.crashDiagnostics;
      diagnosticsEl.append(item);
      diagCountEl.textContent = '0';
      lastDiagnostics = [];
    }

    if (crashEl && crashTitleEl && crashDetailEl) {
      crashEl.hidden = false;
      crashTitleEl.textContent = canAutoRestart ? t.crashAutoTitle : t.crashLoopTitle;
      crashDetailEl.textContent = canAutoRestart
        ? t.crashAutoDetail(message)
        : t.crashLoopDetail(message);
    }
    if (crashRestartEl) crashRestartEl.disabled = canAutoRestart;
    if (crashCopyEl) crashCopyEl.textContent = t.copyError;

    log(t.logRuntimeCrash(message));
    reportError('runtime-crash', message);

    if (canAutoRestart) {
      const scheduleAutoRecover = (attempt: number) => {
        const delay = nextAutoRestartDelayMs(attempt);
        if (delay === null) {
          if (crashRestartEl) crashRestartEl.disabled = false;
          return;
        }
        recoveryAttempt = attempt;
        log(t.logAutoRestart);
        cancelAutoRecover();
        // 第一次等旧连接的 pending 请求结算后再启动；失败则再试一次，避免把瞬时竞态丢给用户。
        autoRecoverTimer = window.setTimeout(() => {
          autoRecoverTimer = undefined;
          if (!recoveryPending) return;
          void start().then((ok) => {
            if (ok || !recoveryPending) return;
            if (attempt === 0) {
              scheduleAutoRecover(1);
            } else if (crashRestartEl) {
              crashRestartEl.disabled = false;
            }
          });
        }, delay);
      };
      scheduleAutoRecover(0);
    }
  }

  crashRestartEl?.addEventListener('click', () => {
    cancelAutoRecover();
    crashRestartEl.disabled = true;
    recoveryPending = true;
    recoveryAttempt = 1;
    setStatus(t.statusRecovering, 'loading');
    void start().finally(() => {
      if (recoveryPending && crashRestartEl) crashRestartEl.disabled = false;
    });
  });

  crashCopyEl?.addEventListener('click', () => {
    void navigator.clipboard
      ?.writeText(lastCrashMessage)
      .then(() => {
        crashCopyEl.textContent = t.copyErrorDone;
        window.setTimeout(() => {
          crashCopyEl.textContent = t.copyError;
        }, 1600);
      })
      .catch(() => {
        // 剪贴板被浏览器拦截时保持原文案，用户仍可从日志复制。
      });
  });

  const sourceLabel = (mode: AssetSourcePreference): string => {
    if (mode === 'cdn') return t.sourceCdn;
    if (mode === 'mirror') return t.sourceMirror;
    if (mode === 'github') return t.sourceGithub;
    return t.sourceAuto;
  };

  const switchSource = (mode: AssetSourcePreference) => {
    const label = sourceLabel(mode);
    cancelAutoStart();
    cancelAutoRecover();
    for (const button of sourceButtons) button.disabled = true;
    hideLoadFailure();
    setStatus(t.sourceSwitching(label), 'loading');
    log(mode === null ? t.logSourceAuto : t.logSourceSwitched(label));
    void setSourcePreference(mode).finally(() => {
      for (const button of sourceButtons) button.disabled = false;
      void start();
    });
  };

  for (const button of sourceButtons) {
    button.addEventListener('click', () => {
      const raw = button.dataset.source ?? 'auto';
      switchSource(raw === 'auto' ? null : (raw as AssetSourcePreference));
    });
  }

  retryLoadEl?.addEventListener('click', () => {
    hideLoadFailure();
    void start();
  });

  // 开发环境与 ?debug 下暴露编辑器实例，方便控制台调试和自动化检查。
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    Object.assign(window as unknown as Record<string, unknown>, {
      __monaco: monaco,
      __editor: editor,
      // 仅用于自动化验证崩溃恢复与成功提示时序，不对普通用户暴露。
      __leanCrash: handleRuntimeCrash,
      __renderDiagnostics: renderDiagnostics,
      __showLoadFailure: showLoadFailure,
      __hideLoadFailure: hideLoadFailure,
      __skipRunBarrier: () => {
        runBarrierDisabled = true;
      },
    });
  }

  if (startImmediately) {
    void start();
  } else if (autoStart && memoryTier !== 'low') {
    // 直接排一个短定时器：比 IntersectionObserver 更确定，也让下载尽早开始。
    autoStartTimer = window.setTimeout(() => {
      autoStartTimer = undefined;
      void start();
    }, 400);
  }

  window.addEventListener('pagehide', () => {
    cancelAutoStart();
    cancelAutoRecover();
    resetRunOk();
    window.clearTimeout(resetArmTimer);
    window.clearTimeout(draftTimer);
    window.clearTimeout(debounceTimer);
    window.clearTimeout(goalTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    memoryGuard.dispose();
    saveDraftNow();
    session.stop();
    stopThemeSync();
    wideQuery.removeEventListener('change', applySplit);
    model.dispose();
    editor.dispose();
  });

  return {
    setCode: (next: string, options?: { focus?: boolean }) => {
      model.setValue(next);
      editor.setPosition({ lineNumber: 1, column: 1 });
      editor.revealLine(1);
      if (options?.focus ?? true) editor.focus();
    },
    getCode: () => model.getValue(),
    focus: () => editor.focus(),
    run,
    getProgress: () => ({ label: progressLabel, kind: progressKind, ratio: progressRatio }),
    restart: async () => {
      cancelAutoStart();
      cancelAutoRecover();
      resetRunOk();
      session.stop();
      engineEverReady = false;
      recoveryPending = false;
      if (crashEl) crashEl.hidden = true;
      return start();
    },
  };
};
