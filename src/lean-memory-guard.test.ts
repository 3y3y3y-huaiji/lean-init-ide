import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLeanMemoryGuard,
  sampleBrowserMemoryBytes,
  type MemoryRecycleEvent,
  type MemoryThresholdEvent,
} from './lean-memory-guard';

const MIB = 1024 * 1024;

describe('createLeanMemoryGuard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('校验非法阈值参数', () => {
    expect(() => createLeanMemoryGuard({ maxBytes: 0, onHardLimit: () => {} })).toThrow(RangeError);
    expect(() =>
      createLeanMemoryGuard({
        maxBytes: 100 * MIB,
        softThresholdRatio: 0.95,
        hardThresholdRatio: 0.9,
        onHardLimit: () => {},
      }),
    ).toThrow(RangeError);
  });

  it('超过软阈值仅标记 needsRecycle，等 fileProgress 归零空闲后再优雅回收', () => {
    const softEvents: MemoryThresholdEvent[] = [];
    const recycles: MemoryRecycleEvent[] = [];
    const hardEvents: MemoryThresholdEvent[] = [];

    const guard = createLeanMemoryGuard({
      maxBytes: 1000 * MIB,
      onSoftLimit: (event) => softEvents.push(event),
      onRecycle: (event) => recycles.push(event),
      onHardLimit: (event) => hardEvents.push(event),
    });

    guard.setProcessing(true);
    guard.reportBytes(720 * MIB, 'event');
    expect(softEvents).toHaveLength(1);
    expect(recycles).toHaveLength(0);
    expect(guard.getSnapshot().needsRecycle).toBe(true);

    // 同一周期内再次上报仍在软区间，不重复触发 onSoftLimit。
    guard.reportBytes(780 * MIB, 'event');
    expect(softEvents).toHaveLength(1);

    // 处理结束进入空闲后触发回收并清标志。
    guard.setProcessing(false);
    expect(recycles).toEqual([
      {
        bytes: 780 * MIB,
        peakBytes: 780 * MIB,
        maxBytes: 1000 * MIB,
        reason: 'soft-limit-idle',
      },
    ]);
    expect(hardEvents).toHaveLength(0);
    expect(guard.getSnapshot().needsRecycle).toBe(false);
  });

  it('到达硬阈值立刻中止并停掉轮询', async () => {
    vi.useFakeTimers();
    const hardEvents: MemoryThresholdEvent[] = [];
    const recycles: MemoryRecycleEvent[] = [];
    let currentBytes = 500 * MIB;

    const guard = createLeanMemoryGuard({
      maxBytes: 1000 * MIB,
      pollIntervalMs: 4000,
      sampleMemoryBytes: () => currentBytes,
      onRecycle: (event) => recycles.push(event),
      onHardLimit: (event) => hardEvents.push(event),
    });

    guard.setProcessing(true);
    currentBytes = 900 * MIB;
    await vi.advanceTimersByTimeAsync(4000);

    expect(hardEvents).toEqual([
      { bytes: 900 * MIB, maxBytes: 1000 * MIB, ratio: 0.9, source: 'poll' },
    ]);
    expect(guard.getSnapshot().hardTriggered).toBe(true);

    // 硬停触发后不再发额外硬限回调或空闲回收。
    guard.setProcessing(false);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(hardEvents).toHaveLength(1);
    expect(recycles).toHaveLength(0);
  });

  it('仅在 processing=true 期间按间隔轮询，空闲即停定时器', async () => {
    vi.useFakeTimers();
    const sampleMemoryBytes = vi.fn(async () => 400 * MIB);

    const guard = createLeanMemoryGuard({
      maxBytes: 1000 * MIB,
      pollIntervalMs: 4000,
      sampleMemoryBytes,
      onHardLimit: () => {},
    });

    vi.advanceTimersByTime(12_000);
    expect(sampleMemoryBytes).not.toHaveBeenCalled();

    guard.setProcessing(true);
    await vi.advanceTimersByTimeAsync(8500);
    expect(sampleMemoryBytes).toHaveBeenCalledTimes(2);

    guard.setProcessing(false);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(sampleMemoryBytes).toHaveBeenCalledTimes(2);
    guard.dispose();
  });

  it('页面切到后台且处于高水位空闲态时触发 background-hidden 释放', () => {
    const recycles: MemoryRecycleEvent[] = [];
    const guard = createLeanMemoryGuard({
      maxBytes: 1000 * MIB,
      onRecycle: (event) => recycles.push(event),
      onHardLimit: () => {},
    });

    guard.setProcessing(true);
    guard.reportBytes(750 * MIB, 'event');
    // 仍在计算时不因切后台强行中断。
    guard.setVisible(false);
    expect(recycles).toHaveLength(0);

    guard.setProcessing(false);
    expect(recycles).toHaveLength(1);
    expect(recycles[0]?.reason).toBe('soft-limit-idle');

    // 重新进入高水位并处于空闲时切后台，应直接触发 background-hidden。
    guard.reportBytes(760 * MIB, 'event');
    guard.setVisible(false);
    expect(recycles).toHaveLength(2);
    expect(recycles[1]?.reason).toBe('background-hidden');
  });

  it('采样抛错通过 onPollError 上报而不吞异常，reset 后丢弃过期在途采样', async () => {
    let resolveSample: ((value: number | null) => void) | undefined;
    const errors: unknown[] = [];
    const guard = createLeanMemoryGuard({
      maxBytes: 1000 * MIB,
      sampleMemoryBytes: () =>
        new Promise<number | null>((resolve) => {
          resolveSample = resolve;
        }),
      onPollError: (err) => errors.push(err),
      onHardLimit: () => {},
    });

    const pending = guard.pollOnce();
    guard.reset();
    resolveSample?.(950 * MIB);
    await pending;
    expect(guard.getSnapshot().hardTriggered).toBe(false);
    expect(guard.getSnapshot().peakBytes).toBe(0);

    const failingGuard = createLeanMemoryGuard({
      maxBytes: 1000 * MIB,
      sampleMemoryBytes: async () => {
        throw new Error('probe failed');
      },
      onPollError: (err) => errors.push(err),
      onHardLimit: () => {},
    });
    await failingGuard.pollOnce();
    expect(errors).toHaveLength(1);
  });
});

describe('sampleBrowserMemoryBytes', () => {
  it('未跨源隔离或缺少 API 时返回 null；可用时返回字节数', async () => {
    expect(await sampleBrowserMemoryBytes({ crossOriginIsolated: false })).toBeNull();
    expect(await sampleBrowserMemoryBytes({ crossOriginIsolated: true })).toBeNull();
    expect(
      await sampleBrowserMemoryBytes({
        crossOriginIsolated: true,
        performance: {
          measureUserAgentSpecificMemory: async () => ({ bytes: 512 * MIB }),
        } as Performance & { measureUserAgentSpecificMemory: () => Promise<{ bytes: number }> },
      }),
    ).toBe(512 * MIB);
  });
});
