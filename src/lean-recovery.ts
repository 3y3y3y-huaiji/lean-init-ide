import type { LeanPanelVariant } from './components/lean-markup';

export const CRASH_DEDUP_MS = 2_000;
export const AUTO_RESTART_COOLDOWN_MS = 60_000;

const AUTO_RESTART_DELAYS_MS = [800, 1600] as const;

const ASSET_ERROR_RE =
  /asset|fetch|network|timeout|aborted|runtime|http\s*\d{3}|status\s*\d{3}|range|csp|content security policy|worker|wasm|zstd|cache|decode|chunk/i;

const STACK_OVERFLOW_RE =
  /maximum call stack|call stack size exceeded|stack overflow|runtimeerror:\s*unreachable/i;

const OOM_ERROR_RE =
  /out of memory|cannot enlarge memory|could not allocate memory|memory access out of bounds|memory limit reached|failed to allocate/i;

export type CrashRecoveryDecision = 'ignore' | 'auto' | 'manual';

export const isAssetRelatedError = (message: string): boolean => ASSET_ERROR_RE.test(message);

export const isStackOverflowError = (message: string): boolean => STACK_OVERFLOW_RE.test(message);

export const isOutOfMemoryError = (message: string): boolean => OOM_ERROR_RE.test(message);

/**
 * Lean LSP 依赖 COOP/COEP 带来的 cross-origin isolation 与 SharedArrayBuffer。
 * 注入环境对象便于单测；默认读 globalThis。
 */
export const supportsLeanRuntime = (
  env: { crossOriginIsolated?: boolean; SharedArrayBuffer?: unknown } = globalThis,
): boolean => env.crossOriginIsolated === true && typeof env.SharedArrayBuffer === 'function';

export const shouldPreserveDiagnosticsOnCrash = (diagnostics: ReadonlyArray<unknown>): boolean =>
  diagnostics.length > 0;

export const decideCrashRecovery = (options: {
  variant: LeanPanelVariant;
  now: number;
  lastCrashAt: number;
  message?: string;
  sameCodeAsLastCrash?: boolean;
}): CrashRecoveryDecision => {
  const { variant, now, lastCrashAt, message, sameCodeAsLastCrash = false } = options;
  if (lastCrashAt > 0 && now - lastCrashAt < CRASH_DEDUP_MS) {
    return 'ignore';
  }
  if (variant !== 'full') {
    return 'manual';
  }
  if (
    sameCodeAsLastCrash ||
    (message ? isStackOverflowError(message) || isOutOfMemoryError(message) : false)
  ) {
    return 'manual';
  }
  if (lastCrashAt === 0 || now - lastCrashAt > AUTO_RESTART_COOLDOWN_MS) {
    return 'auto';
  }
  return 'manual';
};

export const shouldShowRunPassed = (options: {
  variant: LeanPanelVariant;
  barrierOk: boolean;
  fileProcessing: boolean;
  diagnostics: ReadonlyArray<{ severity?: number }>;
}): boolean => {
  const { variant, barrierOk, fileProcessing, diagnostics } = options;
  if (variant !== 'full' || !barrierOk || fileProcessing) return false;
  return !diagnostics.some((item) => item.severity === 1 || item.severity === undefined);
};

export const nextAutoRestartDelayMs = (attempt: number): number | null =>
  AUTO_RESTART_DELAYS_MS[attempt] ?? null;

export const computeDiagnosticsLatencyMs = (lastEditAt: number, receivedAt: number): number =>
  lastEditAt > 0 ? Math.max(0, Math.round(receivedAt - lastEditAt)) : 0;
