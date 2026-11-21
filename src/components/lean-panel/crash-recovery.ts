/**
 * 运行时崩溃恢复、启动失败退避与下载源切换控制器：
 * 管理 60s 单次自动重启阈值、崩溃提示横幅，以及源切换重试逻辑。
 */
import { setSourcePreference, type AssetSourcePreference } from '../../asset-source';
import type { Messages } from '../../i18n/types';
import { decideCrashRecovery, nextAutoRestartDelayMs } from '../../lean-recovery';
import { reportError } from '../../telemetry';
import type { LeanPanelVariant } from '../lean-markup';

type StatusKind = 'idle' | 'loading' | 'ready' | 'error';

export type CrashRecoveryOptions = {
  readonly host: HTMLElement;
  readonly t: Messages['playground'];
  readonly variant: LeanPanelVariant;
  readonly getCode: () => string;
  readonly log: (message: string) => void;
  readonly setStatus: (text: string, kind: StatusKind) => void;
  readonly setProgress: (ratio: number | null) => void;
  readonly onCrashTeardown: (currentCode: string, canAutoRestart: boolean, message: string) => void;
  readonly onStartSession: () => Promise<boolean>;
  readonly cancelAutoStart: () => void;
  readonly showLoadFailure: (message: string, compatibility?: boolean) => void;
  readonly hideLoadFailure: () => void;
};

export type CrashRecoveryController = {
  readonly isRecoveryPending: () => boolean;
  readonly getLastCrashAt: () => number;
  readonly getLastCrashMessage: () => string;
  readonly clearCrashedCode: () => void;
  readonly handleCrash: (message: string) => void;
  readonly onStartSucceeded: () => void;
  readonly onStartFailed: (message: string, error: unknown) => void;
  readonly cancelAutoRecover: () => void;
  readonly reset: () => void;
  readonly prepareManualRestart: () => void;
  readonly dispose: () => void;
};

export const createCrashRecoveryController = (
  options: CrashRecoveryOptions,
): CrashRecoveryController => {
  const {
    host,
    t,
    variant,
    getCode,
    log,
    setStatus,
    setProgress,
    onCrashTeardown,
    onStartSession,
    cancelAutoStart,
    showLoadFailure,
    hideLoadFailure,
  } = options;

  const crashEl = host.querySelector<HTMLElement>('[data-role="crash"]');
  const crashTitleEl = host.querySelector<HTMLElement>('[data-role="crash-title"]');
  const crashDetailEl = host.querySelector<HTMLElement>('[data-role="crash-detail"]');
  const crashRestartEl = host.querySelector<HTMLButtonElement>('[data-role="crash-restart"]');
  const crashCopyEl = host.querySelector<HTMLButtonElement>('[data-role="crash-copy"]');
  const sourceButtons = [...host.querySelectorAll<HTMLButtonElement>('[data-source]')];
  const retryLoadEl = host.querySelector<HTMLButtonElement>('[data-role="retry-load"]');

  let recoveryPending = false;
  let recoveryAttempt = 0;
  let autoRecoverTimer: number | undefined;
  let copyResetTimer: number | undefined;
  let lastCrashAt = 0;
  let lastCrashMessage = '';
  let lastCrashedCode: string | null = null;

  const cancelAutoRecover = () => {
    window.clearTimeout(autoRecoverTimer);
    autoRecoverTimer = undefined;
  };

  const reset = () => {
    cancelAutoRecover();
    recoveryPending = false;
    recoveryAttempt = 0;
    lastCrashedCode = null;
    if (crashEl) crashEl.hidden = true;
  };

  const handleCrash = (message: string) => {
    const now = Date.now();
    const currentCode = getCode();
    const sameCodeAsLastCrash = lastCrashedCode !== null && currentCode === lastCrashedCode;
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
    cancelAutoRecover();
    recoveryPending = true;
    recoveryAttempt = 0;

    onCrashTeardown(currentCode, canAutoRestart, message);

    setStatus(
      canAutoRestart ? t.statusRecovering : t.statusCrash,
      canAutoRestart ? 'loading' : 'error',
    );
    setProgress(0);
    hideLoadFailure();

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
        autoRecoverTimer = window.setTimeout(() => {
          autoRecoverTimer = undefined;
          if (!recoveryPending) return;
          void onStartSession().then((ok) => {
            if (ok || !recoveryPending) return;
            if (attempt === 0) scheduleAutoRecover(1);
            else if (crashRestartEl) crashRestartEl.disabled = false;
          });
        }, delay);
      };
      scheduleAutoRecover(0);
    }
  };

  crashRestartEl?.addEventListener('click', () => {
    cancelAutoRecover();
    crashRestartEl.disabled = true;
    recoveryPending = true;
    recoveryAttempt = 1;
    setStatus(t.statusRecovering, 'loading');
    void onStartSession().finally(() => {
      if (recoveryPending && crashRestartEl) crashRestartEl.disabled = false;
    });
  });

  crashCopyEl?.addEventListener('click', () => {
    void navigator.clipboard
      ?.writeText(lastCrashMessage)
      .then(() => {
        crashCopyEl.textContent = t.copyErrorDone;
        window.clearTimeout(copyResetTimer);
        copyResetTimer = window.setTimeout(() => {
          crashCopyEl.textContent = t.copyError;
        }, 1600);
      })
      .catch(() => {
        // 剪贴板不可用时保持原文案，用户可从日志复制。
      });
  });

  const sourceLabel = (mode: AssetSourcePreference): string => {
    if (mode === 'cdn') return t.sourceCdn;
    if (mode === 'mirror') return t.sourceMirror;
    if (mode === 'github') return t.sourceGithub;
    return t.sourceAuto;
  };

  for (const button of sourceButtons) {
    button.addEventListener('click', () => {
      const raw = button.dataset.source ?? 'auto';
      const mode: AssetSourcePreference = raw === 'auto' ? null : (raw as AssetSourcePreference);
      const label = sourceLabel(mode);
      cancelAutoStart();
      cancelAutoRecover();
      for (const item of sourceButtons) item.disabled = true;
      hideLoadFailure();
      setStatus(t.sourceSwitching(label), 'loading');
      log(mode === null ? t.logSourceAuto : t.logSourceSwitched(label));
      void setSourcePreference(mode).finally(() => {
        for (const item of sourceButtons) item.disabled = false;
        void onStartSession();
      });
    });
  }

  retryLoadEl?.addEventListener('click', () => {
    hideLoadFailure();
    void onStartSession();
  });

  return {
    isRecoveryPending: () => recoveryPending,
    getLastCrashAt: () => lastCrashAt,
    getLastCrashMessage: () => lastCrashMessage,
    clearCrashedCode: () => {
      lastCrashedCode = null;
    },
    handleCrash,
    onStartSucceeded: () => {
      if (!recoveryPending) return;
      recoveryPending = false;
      recoveryAttempt = 0;
      if (crashEl) crashEl.hidden = true;
      if (crashRestartEl) crashRestartEl.disabled = false;
      log(t.logRecovered);
    },
    onStartFailed: (message, error) => {
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
    },
    cancelAutoRecover,
    reset,
    prepareManualRestart: () => {
      cancelAutoRecover();
      recoveryPending = false;
      if (crashEl) crashEl.hidden = true;
    },
    dispose: () => {
      cancelAutoRecover();
      window.clearTimeout(copyResetTimer);
    },
  };
};
