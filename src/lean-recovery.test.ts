import { describe, expect, it } from 'vitest';
import {
  AUTO_RESTART_COOLDOWN_MS,
  CRASH_DEDUP_MS,
  computeDiagnosticsLatencyMs,
  decideCrashRecovery,
  isAssetRelatedError,
  nextAutoRestartDelayMs,
} from './lean-recovery';

describe('isAssetRelatedError', () => {
  it('识别各类运行时资产下载、HTTP、Range、CSP 与 Worker 异常', () => {
    expect(isAssetRelatedError('Failed to load runtime asset lean-init-00.pack.gz.bin')).toBe(true);
    expect(isAssetRelatedError('unexpected HTTP 500')).toBe(true);
    expect(isAssetRelatedError('unexpected HTTP 404')).toBe(true);
    expect(isAssetRelatedError('Response status 502 from upstream')).toBe(true);
    expect(isAssetRelatedError('Range request unsupported (200 OK instead of 206)')).toBe(true);
    expect(isAssetRelatedError('Refused to load script due to Content Security Policy')).toBe(true);
    expect(isAssetRelatedError('CSP blocked worker script')).toBe(true);
    expect(isAssetRelatedError('Worker script failed to load')).toBe(true);
    expect(isAssetRelatedError('WebAssembly.instantiate failed: invalid wasm magic')).toBe(true);
    expect(isAssetRelatedError('Failed to fetch')).toBe(true);
    expect(isAssetRelatedError('Request timeout after 15000ms')).toBe(true);
  });

  it('不把纯 LSP 或用户代码级错误误判成资产下载失败', () => {
    expect(isAssetRelatedError('Invalid params')).toBe(false);
    expect(isAssetRelatedError('LSP initialize returned null')).toBe(false);
    expect(isAssetRelatedError('Type mismatch')).toBe(false);
  });
});

describe('decideCrashRecovery', () => {
  it('忽略 2 秒内重复上报的同一次崩溃，且对首次崩溃不误拦截', () => {
    expect(decideCrashRecovery({ variant: 'full', now: 1000, lastCrashAt: 0 })).toBe('auto');
    expect(
      decideCrashRecovery({
        variant: 'full',
        now: 1000 + CRASH_DEDUP_MS - 1,
        lastCrashAt: 1000,
      }),
    ).toBe('ignore');
  });

  it('完整面板 60 秒内连续崩溃转手动，超过冷却期再允许自动重启', () => {
    const first = 10_000;
    expect(
      decideCrashRecovery({ variant: 'full', now: first + CRASH_DEDUP_MS + 1, lastCrashAt: first }),
    ).toBe('manual');
    expect(
      decideCrashRecovery({
        variant: 'full',
        now: first + AUTO_RESTART_COOLDOWN_MS,
        lastCrashAt: first,
      }),
    ).toBe('manual');
    expect(
      decideCrashRecovery({
        variant: 'full',
        now: first + AUTO_RESTART_COOLDOWN_MS + 1,
        lastCrashAt: first,
      }),
    ).toBe('auto');
  });

  it('课程页 compact 面板永不自动重启，统一走手动分支', () => {
    expect(decideCrashRecovery({ variant: 'compact', now: 100_000, lastCrashAt: 0 })).toBe(
      'manual',
    );
  });
});

describe('nextAutoRestartDelayMs', () => {
  it('最多允许两次退避重试，超出后返回 null', () => {
    expect(nextAutoRestartDelayMs(0)).toBe(800);
    expect(nextAutoRestartDelayMs(1)).toBe(1600);
    expect(nextAutoRestartDelayMs(2)).toBeNull();
  });
});

describe('computeDiagnosticsLatencyMs', () => {
  it('仅基于诊断抵达时刻计算耗时，不把后续屏障等待算入延迟', () => {
    expect(computeDiagnosticsLatencyMs(0, 5000)).toBe(0);
    expect(computeDiagnosticsLatencyMs(1000, 1420.6)).toBe(421);
    expect(computeDiagnosticsLatencyMs(2000, 1900)).toBe(0);
  });
});
