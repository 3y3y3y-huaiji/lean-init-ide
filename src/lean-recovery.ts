import type { LeanPanelVariant } from './components/lean-markup';

export const CRASH_DEDUP_MS = 2_000;
export const AUTO_RESTART_COOLDOWN_MS = 60_000;

const AUTO_RESTART_DELAYS_MS = [800, 1600] as const;

const ASSET_ERROR_RE =
  /asset|fetch|network|timeout|aborted|runtime|http\s*\d{3}|status\s*\d{3}|range|csp|content security policy|worker|wasm|zstd|cache|decode|chunk/i;

export type CrashRecoveryDecision = 'ignore' | 'auto' | 'manual';

export const isAssetRelatedError = (message: string): boolean => ASSET_ERROR_RE.test(message);

export const decideCrashRecovery = (options: {
  variant: LeanPanelVariant;
  now: number;
  lastCrashAt: number;
}): CrashRecoveryDecision => {
  const { variant, now, lastCrashAt } = options;
  if (lastCrashAt > 0 && now - lastCrashAt < CRASH_DEDUP_MS) {
    return 'ignore';
  }
  if (variant === 'full' && (lastCrashAt === 0 || now - lastCrashAt > AUTO_RESTART_COOLDOWN_MS)) {
    return 'auto';
  }
  return 'manual';
};

export const nextAutoRestartDelayMs = (attempt: number): number | null =>
  AUTO_RESTART_DELAYS_MS[attempt] ?? null;

export const computeDiagnosticsLatencyMs = (lastEditAt: number, receivedAt: number): number =>
  lastEditAt > 0 ? Math.max(0, Math.round(receivedAt - lastEditAt)) : 0;
