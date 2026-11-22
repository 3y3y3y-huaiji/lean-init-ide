/**
 * Lean 在线编辑器面板主装配入口：
 * 将布局、SW 资产通道、扩展架构、诊断渲染、LSP/Goal、崩溃恢复与会话生命周期控制器拼装成 LeanPanel。
 */
import { createMessageConnection } from 'vscode-jsonrpc/browser';
import { currentMemoryTier } from '../device';
import { messagesFor, type Locale } from '../i18n';
import type { LspDiagnostic } from '../lean-session';
import type { RuntimeExtensionId } from '../runtime-extensions';
import { renderLeanMarkup, type LeanPanelVariant } from './lean-markup';
import {
  createCrashRecoveryController,
  type CrashRecoveryController,
} from './lean-panel/crash-recovery';
import { createDiagnosticsView } from './lean-panel/diagnostics-view';
import { createEditorBindings } from './lean-panel/editor-bindings';
import { createExtensionController } from './lean-panel/extension-controller';
import { createLayoutController } from './lean-panel/layout-controller';
import { createLspProvidersController } from './lean-panel/lsp-providers';
import { createSessionController } from './lean-panel/session-controller';
import { createSwBridge } from './lean-panel/sw-bridge';

export type { LeanPanelVariant, LspDiagnostic };

export type LeanPanelProgressKind = 'idle' | 'loading' | 'ready' | 'error';

export type LeanPanelProgress = {
  label: string;
  kind: LeanPanelProgressKind;
  ratio: number | null;
};

export type LeanPanelOptions = {
  variant: LeanPanelVariant;
  code: string;
  locale: Locale;
  autoStart?: boolean;
  startImmediately?: boolean;
  lessonSlug?: string;
  draftKey?: string;
  onProgress?: (progress: LeanPanelProgress) => void;
  onGoal?: (goalText: string) => void;
  onDiagnostics?: (diagnostics: LspDiagnostic[]) => void;
  requiredExtensions?: RuntimeExtensionId[];
};

export type LeanPanel = {
  setCode: (code: string, options?: { focus?: boolean }) => void;
  getCode: () => string;
  focus: () => void;
  insert: (text: string) => void;
  run: (code: string) => Promise<LspDiagnostic[]>;
  getProgress: () => LeanPanelProgress;
  restart: () => Promise<boolean>;
};

const WORKSPACE_URI = 'file:///workspace/Main.lean';

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
    onGoal,
    onDiagnostics,
    requiredExtensions = [],
  } = options;

  const t = messagesFor(locale).playground;
  const memoryTier = currentMemoryTier();
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
  const goalEl = host.querySelector<HTMLPreElement>('[data-role="goal"]')!;
  const statementEl = host.querySelector<HTMLElement>('[data-role="goal-statement"]')!;

  const log = (message: string) => {
    logEl.textContent += `[${new Date().toLocaleTimeString()}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  };
  const setGoalText = (text: string) => {
    goalEl.textContent = text;
    onGoal?.(text);
  };

  let progressLabel = t.statusIdle;
  let progressKind: LeanPanelProgressKind = 'idle';
  let progressRatio: number | null = null;
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

  const layout = createLayoutController(host, variant);

  let onModelContentChange = () => {};
  const editorBindings = createEditorBindings({
    host,
    uri: WORKSPACE_URI,
    starterCode: code,
    lessonSlug,
    draftKey,
    t,
    log,
    onContentChange: () => onModelContentChange(),
  });
  if (editorBindings.hadRestoredDraft) log(t.logDraftRestored);

  const extensions = createExtensionController({
    host,
    t,
    requiredExtensions,
    log,
    setStatus,
    closeMenus: layout.closeMenus,
    isSessionActive: () => sessionCtrl.isActive(),
    restartSession: async () => {
      sessionCtrl.stop();
      await sessionCtrl.start();
    },
    onArchChanged: (arch) => sessionCtrl.setArchCeiling(arch),
  });
  if (extensions.wasAutoSwitchedFromWasm64()) log(t.logRuntimeAutoStable);

  const swBridge = createSwBridge({
    t,
    getSelectedArch: extensions.getSelectedArch,
    log,
    setStatus,
    setProgress,
  });

  const diagnosticsView = createDiagnosticsView({
    host,
    uri: WORKSPACE_URI,
    variant,
    starterCode: code,
    lessonSlug,
    t,
    getCode: editorBindings.getCode,
    setModelMarkers: editorBindings.setModelMarkers,
    revealLocation: editorBindings.revealLocation,
    isSessionReady: () => sessionCtrl.isReady(),
    requestDocumentSymbol: () =>
      sessionCtrl.request('textDocument/documentSymbol', { textDocument: { uri: WORKSPACE_URI } }),
    getSelectedArch: extensions.getSelectedArch,
    getRunStartedAt: () => sessionCtrl.getRunStartedAt(),
    getLastEditAt: () => sessionCtrl.getLastEditAt(),
    log,
    setStatus,
    onProcessingChange: (active) => sessionCtrl.setProcessing(active),
    onRunPassed: () => crashRecovery.clearCrashedCode(),
    onQuickFixLibrary: extensions.enableFromQuickFix,
    getLastAssetFallback: swBridge.getLastAssetFallback,
    onDiagnostics,
  });

  const crashRecoveryRef: { current?: CrashRecoveryController } = {};
  const sessionCtrl = createSessionController({
    t,
    memoryTier,
    startEl,
    statementEl,
    getCode: editorBindings.getCode,
    setCodeSilently: (nextCode) => editorBindings.model.setValue(nextCode),
    log,
    setStatus,
    setProgress,
    setGoalText,
    getSelectedArch: extensions.getSelectedArch,
    getActiveExtensions: extensions.getActiveExtensions,
    getExtensionPacks: extensions.getExtensionPacks,
    persistSession: (active) => extensions.persistSession(active),
    restoreSavedExtensions: extensions.restoreSavedExtensions,
    drainExtensionSelections: extensions.drainExtensionSelections,
    swBridge,
    diagnosticsView,
    getCrashRecovery: () => crashRecoveryRef.current!,
    onBumpGoalSeq: () => lspProviders.bumpGoalSeq(),
    onResetGoalSupport: () => lspProviders.resetGoalSupport(),
    onScheduleGoal: (delayMs) => lspProviders.scheduleGoal(delayMs),
    onUpdateStatement: () => lspProviders.updateStatement(),
    createConnection: (server) =>
      createMessageConnection(server.transport.reader, server.transport.writer),
  });

  const lspProviders = createLspProvidersController({
    uri: WORKSPACE_URI,
    t,
    monacoApi: editorBindings.monacoApi,
    model: editorBindings.model,
    editor: editorBindings.editor,
    statementEl,
    setGoalText,
    isSessionReady: sessionCtrl.isReady,
    whenSessionReady: sessionCtrl.whenReady,
    flushChange: sessionCtrl.flushChange,
    sessionRequest: sessionCtrl.request,
    log,
  });
  onModelContentChange = sessionCtrl.onContentChange;

  const crashRecovery = createCrashRecoveryController({
    host,
    t,
    variant,
    getCode: editorBindings.getCode,
    log,
    setStatus,
    setProgress,
    onCrashTeardown: sessionCtrl.onCrashTeardown,
    onStartSession: sessionCtrl.start,
    cancelAutoStart: sessionCtrl.cancelAutoStart,
    showLoadFailure: (msg) => diagnosticsView.showLoadFailure(msg),
    hideLoadFailure: diagnosticsView.hideLoadFailure,
  });
  crashRecoveryRef.current = crashRecovery;

  if (memoryTier === 'low') {
    setStatus(t.statusLowMemory, 'idle');
    startEl.title = t.lowMemoryHint;
    log(t.logLowMemory);
  }
  startEl.addEventListener('click', () => {
    if (sessionCtrl.isReady()) sessionCtrl.stop();
    else void sessionCtrl.start();
  });

  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    Object.assign(window as unknown as Record<string, unknown>, {
      __monaco: editorBindings.monacoApi,
      __editor: editorBindings.editor,
      __leanCrash: crashRecovery.handleCrash,
      __renderDiagnostics: diagnosticsView.renderDiagnostics,
      __showLoadFailure: diagnosticsView.showLoadFailure,
      __hideLoadFailure: diagnosticsView.hideLoadFailure,
      __skipRunBarrier: diagnosticsView.skipRunBarrier,
    });
  }

  if (startImmediately || extensions.shouldResumeRuntime()) {
    void sessionCtrl.start();
  } else if (autoStart && memoryTier !== 'low') {
    sessionCtrl.scheduleAutoStart();
  }

  window.addEventListener('pagehide', () => {
    sessionCtrl.dispose();
    crashRecovery.dispose();
    diagnosticsView.dispose();
    lspProviders.dispose();
    swBridge.dispose();
    layout.dispose();
    editorBindings.dispose();
  });

  return {
    setCode: editorBindings.setCode,
    getCode: editorBindings.getCode,
    focus: editorBindings.focus,
    insert: editorBindings.insert,
    run: sessionCtrl.run,
    getProgress: () => ({ label: progressLabel, kind: progressKind, ratio: progressRatio }),
    restart: sessionCtrl.restart,
  };
};
