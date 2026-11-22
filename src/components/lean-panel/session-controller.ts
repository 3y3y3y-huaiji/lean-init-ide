/**
 * Lean 会话生命周期与混合内存守卫 v2 控制器：
 * 管理 LeanSession 启动/重启/停止、编辑器内容防抖同步、import 变更回收、
 * 以及 wasm32/wasm64 统一运行时接入与 L1/L2/L3 渐进内存保护。
 */
import type { MessageConnection } from 'vscode-jsonrpc/browser';
import { resolveRuntimeMemoryCeiling, type LeanRuntimeArch, type MemoryTier } from '../../device';
import type { Messages } from '../../i18n/types';
import { createLeanMemoryGuard, sampleBrowserMemoryBytes } from '../../lean-memory-guard';
import { supportsLeanRuntime } from '../../lean-recovery';
import { createLeanRuntime, type LeanRuntimeHandle } from '../../lean-runtime-adapter';
import {
  extractImportLines,
  LeanSession,
  type LeanSessionServer,
  type LspDiagnostic,
} from '../../lean-session';
import { clearRuntimeCache } from '../../runtime-cache';
import type { ExtensionPacks, RuntimeExtensionId } from '../../runtime-extensions';
import { reportError, track } from '../../telemetry';
import { formatWorkerError } from '../../wasm64-error';
import type { CrashRecoveryController } from './crash-recovery';
import type { DiagnosticsView } from './diagnostics-view';
import type { SwBridge } from './sw-bridge';

type StatusKind = 'idle' | 'loading' | 'ready' | 'error';

export type SessionControllerOptions = {
  readonly t: Messages['playground'];
  readonly memoryTier: MemoryTier;
  readonly startEl: HTMLButtonElement;
  readonly statementEl: HTMLElement;
  readonly getCode: () => string;
  readonly setCodeSilently: (code: string) => void;
  readonly log: (message: string) => void;
  readonly setStatus: (text: string, kind: StatusKind) => void;
  readonly setProgress: (ratio: number | null) => void;
  readonly setGoalText: (text: string) => void;
  readonly getSelectedArch: () => LeanRuntimeArch;
  readonly getActiveExtensions: () => RuntimeExtensionId[];
  readonly getExtensionPacks: () => ExtensionPacks;
  readonly persistSession: (active: boolean) => void;
  readonly restoreSavedExtensions: () => Promise<void>;
  readonly drainExtensionSelections: () => Promise<void>;
  readonly swBridge: SwBridge;
  readonly diagnosticsView: DiagnosticsView;
  readonly getCrashRecovery: () => CrashRecoveryController;
  readonly onBumpGoalSeq: () => void;
  readonly onResetGoalSupport: () => void;
  readonly onScheduleGoal: (delayMs?: number) => void;
  readonly onUpdateStatement: () => void;
  readonly createRuntime?: typeof createLeanRuntime;
  readonly createConnection: (server: LeanSessionServer) => MessageConnection;
};

const formatMb = (bytes: number): string => Math.round(bytes / (1024 * 1024)).toString();

export const createSessionController = (options: SessionControllerOptions) => {
  const { t, memoryTier, startEl, statementEl, swBridge, diagnosticsView } = options;
  const createRuntime = options.createRuntime ?? createLeanRuntime;

  let activeRuntime: LeanRuntimeHandle | null = null;
  let lastEditAt = 0;
  let runStartedAt = 0;
  let changePending = false;
  let debounceTimer: number | undefined;
  let autoStartTimer: number | undefined;
  let startInflight: Promise<boolean> | null = null;
  let engineEverReady = false;
  let suppressSync = false;
  let freshHandled = false;
  let lastStartError: string | null = null;
  let lastSyncedImports = extractImportLines(options.getCode());

  const cancelAutoStart = () => {
    window.clearTimeout(autoStartTimer);
    autoStartTimer = undefined;
  };

  const memoryGuard = createLeanMemoryGuard({
    maxBytes: resolveRuntimeMemoryCeiling(options.getSelectedArch(), memoryTier),
    sampleMemoryBytes: async () =>
      (await activeRuntime?.sampleMemoryBytes()) ?? sampleBrowserMemoryBytes(),
    onPollError: (error) => {
      options.log(t.logRuntimeError(error instanceof Error ? error.message : String(error)));
    },
    onWarning: ({ bytes, maxBytes }) => {
      options.log(t.logMemoryWarning(formatMb(bytes), formatMb(maxBytes)));
      track('memory_warning', {
        mb: Math.round(bytes / (1024 * 1024)),
        limit_mb: Math.round(maxBytes / (1024 * 1024)),
        arch: options.getSelectedArch(),
      });
    },
    onRecycle: ({ peakBytes, reason }) => {
      const mb = formatMb(peakBytes);
      if (reason === 'background-hidden') {
        if (!session.isReady) return;
        options.log(t.logMemoryBackgroundRelease(mb));
        stop();
        return;
      }
      if (!session.isReady || diagnosticsView.isFileProcessing() || startInflight) return;
      options.log(t.logMemorySoftRecycle(mb));
      stop();
      void start();
    },
    onHardLimit: ({ bytes, maxBytes }) => {
      options.log(t.logMemoryHardLimit(formatMb(bytes), formatMb(maxBytes)));
      reportError('memory-limit', `${formatMb(bytes)}/${formatMb(maxBytes)} MB`);
      stop();
      options.setStatus(t.statusMemoryLimit, 'error');
    },
  });

  const onVisibilityChange = () => {
    memoryGuard.setVisible(document.visibilityState !== 'hidden');
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const handleEngineStatus = (status: { state: string; message?: string }) => {
    const arch = options.getSelectedArch();
    if (status.state === 'loading') {
      if (!swBridge.hasAssetProgress()) options.setProgress(null);
    } else if (status.state === 'ready') {
      engineEverReady = true;
      options.setProgress(1);
      options.setStatus(t.statusLspReady, 'ready');
      options.log(t.logRuntimeReady);
      track('lsp_ready', { ms: runStartedAt ? performance.now() - runStartedAt : 0, arch });
    } else if (status.state === 'error') {
      const message = status.message ?? 'unknown error';
      options.log(t.logRuntimeError(message));
      reportError('runtime', message, { arch });
      if (engineEverReady) options.getCrashRecovery().handleCrash(message);
      else options.setStatus(t.statusError(message), 'error');
    }
  };

  const session: LeanSession = new LeanSession({
    createServer: async () => {
      const handle = await createRuntime({
        arch: options.getSelectedArch(),
        memoryTier,
        extensionPacks: options.getExtensionPacks(),
        activeExtensions: options.getActiveExtensions(),
        onStatus: handleEngineStatus,
        onMemoryBytes: (bytes) => memoryGuard.reportBytes(bytes, 'event'),
        onWasm64FallbackLog: () => options.log(t.runtimeWasm64NotPublished),
        onWasm64LoadingLog: () => options.log(t.logWasm64Loading),
        onWasm64Stage: (stage) => options.log(t.logWasm64Stage(stage)),
      });
      activeRuntime = handle;
      return handle.server;
    },
    createConnection: options.createConnection,
    onDiagnostics: diagnosticsView.renderDiagnostics,
    onFileProgress: diagnosticsView.handleFileProgress,
    onLog: options.log,
    diagnosticSettleMs: 300,
  });

  const syncEditorChange = () => {
    if (!session.isReady) return;
    changePending = false;
    const nextCode = options.getCode();
    const nextImports = extractImportLines(nextCode);
    if (nextImports !== lastSyncedImports) {
      lastSyncedImports = nextImports;
      if (memoryGuard.shouldRecycleOnImportChange()) {
        options.log(t.logMemoryImportRecycle(formatMb(memoryGuard.getSnapshot().peakBytes)));
        stop();
        void start();
        return;
      }
    }
    lastEditAt = performance.now();
    session.change(nextCode);
    memoryGuard.recordEdit();
  };

  const flushChange = () => {
    if (!session.isReady || !changePending) return;
    window.clearTimeout(debounceTimer);
    syncEditorChange();
  };

  const stop = () => {
    cancelAutoStart();
    options.getCrashRecovery().reset();
    memoryGuard.reset();
    window.clearTimeout(debounceTimer);
    activeRuntime = null;
    session.stop();
    engineEverReady = false;
    lastStartError = null;
    options.onResetGoalSupport();
    diagnosticsView.resetForStop();
    swBridge.resetProgressState();
    swBridge.clearLastAssetFallback();
    runStartedAt = 0;
    options.setStatus(memoryTier === 'low' ? t.statusLowMemory : t.statusIdle, 'idle');
    options.setProgress(0);
    options.setGoalText(t.goalPlaceholder);
    statementEl.hidden = true;
    startEl.textContent = t.start;
    options.persistSession(false);
    options.log(t.logStopped);
  };

  const runStart = async (): Promise<boolean> => {
    startEl.disabled = true;
    lastStartError = null;
    swBridge.clearLastAssetFallback();
    swBridge.resetProgressState();
    diagnosticsView.resetForStart();
    void navigator.storage?.persist?.().catch(() => {});
    options.setStatus(t.statusLoading, 'loading');
    options.setProgress(0);
    options.onBumpGoalSeq();
    const startedAt = performance.now();
    runStartedAt = startedAt;
    if ('serviceWorker' in navigator) {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
      ]);
    }
    if (!freshHandled && new URLSearchParams(location.search).has('fresh')) {
      freshHandled = true;
      await clearRuntimeCache();
      options.log(t.logCacheCleared);
    }
    try {
      const startCode = options.getCode();
      lastSyncedImports = extractImportLines(startCode);
      await session.start(startCode);
      flushChange();
      startEl.textContent = t.stop;
      engineEverReady = true;
      diagnosticsView.hideLoadFailure();
      lastEditAt = performance.now();
      options.setStatus(t.statusWaitingDiagnostics, 'ready');
      options.persistSession(true);
      options.log(t.logInitialize(((performance.now() - startedAt) / 1000).toFixed(2)));
      options.getCrashRecovery().onStartSucceeded();
      options.onScheduleGoal(800);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? `${error.name}: ${error.message}` : formatWorkerError(error);
      lastStartError = message;
      options.persistSession(false);
      options.getCrashRecovery().onStartFailed(message, error);
      return false;
    } finally {
      startInflight = null;
      startEl.disabled = false;
    }
  };

  const start = (): Promise<boolean> => {
    options.getCrashRecovery().cancelAutoRecover();
    if (startInflight) return startInflight;
    if (!supportsLeanRuntime()) {
      const message = t.compatibilityError;
      lastStartError = message;
      options.setStatus(t.statusFailure(message), 'error');
      diagnosticsView.showLoadFailure(message, true);
      return Promise.resolve(false);
    }
    startInflight = (async () => {
      await options.restoreSavedExtensions();
      const started = await runStart();
      void options.drainExtensionSelections();
      return started;
    })();
    return startInflight;
  };

  const run = (nextCode: string): Promise<LspDiagnostic[]> => {
    const recovery = options.getCrashRecovery();
    if (recovery.isRecoveryPending()) {
      return Promise.reject(new Error(recovery.getLastCrashMessage() || 'Lean process crashed'));
    }
    if (lastStartError) return Promise.reject(new Error(lastStartError));
    const crashAt = recovery.getLastCrashAt();
    return session
      .run(nextCode, () => {
        if (runStartedAt === 0) runStartedAt = performance.now();
        suppressSync = true;
        options.setCodeSilently(nextCode);
        suppressSync = false;
        lastSyncedImports = extractImportLines(nextCode);
      })
      .then((list) => {
        if (recovery.getLastCrashAt() !== crashAt) {
          throw new Error(recovery.getLastCrashMessage() || 'Lean process crashed');
        }
        return list;
      });
  };

  return {
    getLastEditAt: () => lastEditAt,
    getRunStartedAt: () => runStartedAt,
    isReady: () => session.isReady,
    isActive: () => session.isReady || startInflight !== null,
    isReadyOrStarting: () => session.isReady || session.state === 'starting',
    whenReady: () => session.whenReady(),
    request: <T>(method: string, params: unknown) => session.request<T>(method, params),
    setProcessing: (active: boolean) => memoryGuard.setProcessing(active),
    setArchCeiling: (arch: LeanRuntimeArch) =>
      memoryGuard.setMaxBytes(resolveRuntimeMemoryCeiling(arch, memoryTier)),
    scheduleAutoStart: () => {
      autoStartTimer = window.setTimeout(() => {
        autoStartTimer = undefined;
        void start();
      }, 400);
    },
    cancelAutoStart,
    flushChange,
    onContentChange: () => {
      options.getCrashRecovery().clearCrashedCode();
      options.onUpdateStatement();
      diagnosticsView.onContentChanged(options.getCode());
      if (suppressSync) return;
      changePending = true;
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(syncEditorChange, 350);
    },
    onCrashTeardown: () => {
      options.onBumpGoalSeq();
      memoryGuard.reset();
      activeRuntime = null;
      session.stop();
      engineEverReady = false;
      lastStartError = null;
      runStartedAt = 0;
      startEl.textContent = t.start;
      options.setGoalText(t.goalPlaceholder);
      statementEl.hidden = true;
      diagnosticsView.handleCrashDiagnostics();
    },
    start,
    stop,
    run,
    restart: async () => {
      cancelAutoStart();
      options.getCrashRecovery().prepareManualRestart();
      diagnosticsView.resetRunOk();
      activeRuntime = null;
      session.stop();
      engineEverReady = false;
      return start();
    },
    dispose: () => {
      cancelAutoStart();
      window.clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      options.persistSession(session.isReady || session.state === 'starting');
      activeRuntime = null;
      session.stop();
      memoryGuard.dispose();
    },
  };
};
