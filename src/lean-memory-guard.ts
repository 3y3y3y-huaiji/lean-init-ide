/**
 * 轻量混合内存守卫（事件驱动 + 活跃期条件轮询）：
 *
 * 1. 事件驱动：`growMemViews` / `updateMemoryViews` 在 Wasm 线性内存实际扩容时上推 `bytes`；
 *    超过软阈值时只打标记 `needsRecycle`，等 `fileProgress` 归零空闲后再优雅重建 Worker，
 *    避免直接打断用户正在进行的类型检查。
 * 2. 条件轮询：仅在 `fileProcessing === true` 期间低频采样（默认 4s），空闲零定时器开销；
 *    一旦逼近硬上限立即停止引擎，抢在浏览器标签页 OOM 崩溃前保全代码与现场。
 * 3. 后台卸载：页面切到后台且非空闲低于峰值阈值时释放堆，防止移动端或后台页被系统杀掉。
 */

export const DEFAULT_SOFT_THRESHOLD_RATIO = 0.72;
export const DEFAULT_HARD_THRESHOLD_RATIO = 0.9;
export const DEFAULT_MEMORY_POLL_MS = 4_000;

export type MemoryReportSource = 'event' | 'poll';

export type MemoryRecycleReason = 'soft-limit-idle' | 'background-hidden';

export interface MemoryThresholdEvent {
  readonly bytes: number;
  readonly maxBytes: number;
  readonly ratio: number;
  readonly source: MemoryReportSource;
}

export interface MemoryRecycleEvent {
  readonly bytes: number;
  readonly peakBytes: number;
  readonly maxBytes: number;
  readonly reason: MemoryRecycleReason;
}

export interface MemoryGuardSnapshot {
  readonly lastBytes: number;
  readonly peakBytes: number;
  readonly maxBytes: number;
  readonly softBytes: number;
  readonly hardBytes: number;
  readonly needsRecycle: boolean;
  readonly hardTriggered: boolean;
  readonly processing: boolean;
}

export interface MemoryGuardTimers {
  readonly setInterval: (
    handler: () => void,
    ms: number,
  ) => ReturnType<typeof globalThis.setInterval>;
  readonly clearInterval: (id: ReturnType<typeof globalThis.setInterval>) => void;
}

export interface LeanMemoryGuardOptions {
  readonly maxBytes: number;
  readonly softThresholdRatio?: number;
  readonly hardThresholdRatio?: number;
  readonly pollIntervalMs?: number;
  readonly sampleMemoryBytes?: () => Promise<number | null> | number | null;
  readonly onPollError?: (error: unknown) => void;
  readonly onSoftLimit?: (event: MemoryThresholdEvent) => void;
  readonly onRecycle?: (event: MemoryRecycleEvent) => void;
  readonly onHardLimit: (event: MemoryThresholdEvent) => void;
  readonly timers?: MemoryGuardTimers;
}

export interface LeanMemoryGuard {
  /** 上报一次观测到的线性内存或总堆字节数（来自事件或轮询）。 */
  reportBytes: (bytes: number, source?: MemoryReportSource) => void;
  /** 同步文件处理状态：活跃期开启条件轮询，空闲后兑现延迟回收。 */
  setProcessing: (active: boolean) => void;
  /** 同步页面可见性：切后台且峰值超过软阈值时立刻触发释放。 */
  setVisible: (visible: boolean) => void;
  /** 手动触发一次单步采样（供测试或主动检查使用）。 */
  pollOnce: () => Promise<void>;
  /** 引擎重启或停止后清空当前周期水位。 */
  reset: () => void;
  /** 面板卸载时永久关闭守卫并释放定时器。 */
  dispose: () => void;
  getSnapshot: () => MemoryGuardSnapshot;
}

type PerformanceWithUaMemory = Performance & {
  measureUserAgentSpecificMemory?: () => Promise<{ readonly bytes: number }>;
};

export interface BrowserMemoryScope {
  readonly crossOriginIsolated?: boolean;
  readonly performance?: PerformanceWithUaMemory;
}

/** 采样浏览器跨 Worker 总内存；仅在 crossOriginIsolated + 支持该 API 时返回字节数。 */
export const sampleBrowserMemoryBytes = async (
  scope: BrowserMemoryScope = {},
): Promise<number | null> => {
  const isolated =
    scope.crossOriginIsolated ??
    (typeof globalThis.crossOriginIsolated === 'boolean'
      ? globalThis.crossOriginIsolated
      : undefined);
  if (isolated !== true) return null;

  const perf =
    scope.performance ??
    (typeof performance === 'undefined' ? undefined : (performance as PerformanceWithUaMemory));
  if (typeof perf?.measureUserAgentSpecificMemory !== 'function') return null;

  const result = await perf.measureUserAgentSpecificMemory();
  return typeof result?.bytes === 'number' && Number.isFinite(result.bytes) ? result.bytes : null;
};

/** 创建带事件驱动、空闲回收与活跃期条件轮询的混合内存守卫。 */
export const createLeanMemoryGuard = (options: LeanMemoryGuardOptions): LeanMemoryGuard => {
  const {
    maxBytes,
    softThresholdRatio = DEFAULT_SOFT_THRESHOLD_RATIO,
    hardThresholdRatio = DEFAULT_HARD_THRESHOLD_RATIO,
    pollIntervalMs = DEFAULT_MEMORY_POLL_MS,
    sampleMemoryBytes,
    onPollError,
    onSoftLimit,
    onRecycle,
    onHardLimit,
    timers = {
      setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
      clearInterval: (id) => globalThis.clearInterval(id),
    },
  } = options;

  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new RangeError(`maxBytes 必须为正有限数，收到 ${maxBytes}`);
  }
  if (
    softThresholdRatio <= 0 ||
    softThresholdRatio >= hardThresholdRatio ||
    hardThresholdRatio > 1
  ) {
    throw new RangeError(
      `非法内存阈值比例：soft=${softThresholdRatio}, hard=${hardThresholdRatio}`,
    );
  }

  const softBytes = Math.round(maxBytes * softThresholdRatio);
  const hardBytes = Math.round(maxBytes * hardThresholdRatio);

  let lastBytes = 0;
  let peakBytes = 0;
  let needsRecycle = false;
  let hardTriggered = false;
  let processing = false;
  let disposed = false;
  let pollTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  let pollInflight = false;
  let epoch = 0;

  const stopPolling = (): void => {
    if (pollTimer === null) return;
    timers.clearInterval(pollTimer);
    pollTimer = null;
  };

  const triggerRecycle = (reason: MemoryRecycleReason): void => {
    needsRecycle = false;
    onRecycle?.({ bytes: lastBytes, peakBytes, maxBytes, reason });
  };

  const reportBytes = (bytes: number, source: MemoryReportSource = 'event'): void => {
    if (disposed || hardTriggered || !Number.isFinite(bytes) || bytes <= 0) return;
    lastBytes = bytes;
    if (bytes > peakBytes) peakBytes = bytes;
    const ratio = bytes / maxBytes;

    if (bytes >= hardBytes) {
      hardTriggered = true;
      needsRecycle = false;
      processing = false;
      stopPolling();
      onHardLimit({ bytes, maxBytes, ratio, source });
      return;
    }

    if (bytes >= softBytes && !needsRecycle) {
      needsRecycle = true;
      onSoftLimit?.({ bytes, maxBytes, ratio, source });
    }
  };

  const pollOnce = async (): Promise<void> => {
    if (disposed || hardTriggered || !sampleMemoryBytes || pollInflight) return;
    const currentEpoch = epoch;
    pollInflight = true;
    try {
      const sampled = await sampleMemoryBytes();
      if (disposed || epoch !== currentEpoch || sampled === null) return;
      reportBytes(sampled, 'poll');
    } catch (error: unknown) {
      onPollError?.(error);
    } finally {
      pollInflight = false;
    }
  };

  const setProcessing = (active: boolean): void => {
    if (disposed || active === processing) return;
    processing = active;
    if (active) {
      if (sampleMemoryBytes && pollTimer === null && !hardTriggered) {
        pollTimer = timers.setInterval(() => {
          void pollOnce();
        }, pollIntervalMs);
      }
      return;
    }
    stopPolling();
    if (needsRecycle && !hardTriggered) {
      triggerRecycle('soft-limit-idle');
    }
  };

  const setVisible = (visible: boolean): void => {
    if (disposed || visible || processing || hardTriggered) return;
    if (needsRecycle || peakBytes >= softBytes) {
      triggerRecycle('background-hidden');
    }
  };

  const reset = (): void => {
    epoch += 1;
    lastBytes = 0;
    peakBytes = 0;
    needsRecycle = false;
    hardTriggered = false;
    processing = false;
    stopPolling();
  };

  const dispose = (): void => {
    if (disposed) return;
    reset();
    disposed = true;
  };

  const getSnapshot = (): MemoryGuardSnapshot => ({
    lastBytes,
    peakBytes,
    maxBytes,
    softBytes,
    hardBytes,
    needsRecycle,
    hardTriggered,
    processing,
  });

  return {
    reportBytes,
    setProcessing,
    setVisible,
    pollOnce,
    reset,
    dispose,
    getSnapshot,
  };
};
