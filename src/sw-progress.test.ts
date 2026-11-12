import { describe, expect, it } from 'vitest';
import { createProgressTracker } from './sw-progress';

describe('跨资产下载进度', () => {
  it('累计多个资产的已下载字节，总字节固定为清单大小', () => {
    const tracker = createProgressTracker(1000);

    expect(tracker.record('a', 100)).toEqual({ loaded: 100, total: 1000 });
    expect(tracker.record('b', 250)).toEqual({ loaded: 350, total: 1000 });
    expect(tracker.record('a', 400)).toEqual({ loaded: 650, total: 1000 });
  });

  it('同一资产重试时用新进度覆盖旧值', () => {
    const tracker = createProgressTracker(1000);

    tracker.record('a', 300);
    const next = tracker.record('a', 120);

    expect(next.loaded).toBe(120);
  });

  it('负数按 0 处理', () => {
    const tracker = createProgressTracker(500);

    expect(tracker.record('a', -10)).toEqual({ loaded: 0, total: 500 });
  });
});
