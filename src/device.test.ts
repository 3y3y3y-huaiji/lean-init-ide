import { describe, expect, it } from 'vitest';
import {
  CACHE_BUDGET_BYTES,
  cacheBudgetBytes,
  detectMemoryTier,
  readMemorySignals,
  shouldAutoStart,
} from './device';

describe('detectMemoryTier', () => {
  it('把 4GiB 及以下的设备判为 low', () => {
    expect(detectMemoryTier({ deviceMemory: 1 })).toBe('low');
    expect(detectMemoryTier({ deviceMemory: 2 })).toBe('low');
    expect(detectMemoryTier({ deviceMemory: 4 })).toBe('low');
  });

  it('把 8GiB 及以上判为 standard', () => {
    expect(detectMemoryTier({ deviceMemory: 6 })).toBe('standard');
    expect(detectMemoryTier({ deviceMemory: 8 })).toBe('standard');
  });

  it('deviceMemory 缺失时，只有核心少且是触屏才降档', () => {
    expect(detectMemoryTier({ hardwareConcurrency: 4, coarsePointer: true })).toBe('low');
    expect(detectMemoryTier({ hardwareConcurrency: 4, coarsePointer: false })).toBe('standard');
    expect(detectMemoryTier({ hardwareConcurrency: 16, coarsePointer: true })).toBe('standard');
    expect(detectMemoryTier({})).toBe('standard');
  });

  it('忽略非法 deviceMemory 值，退回核心数判断', () => {
    expect(detectMemoryTier({ deviceMemory: 0, hardwareConcurrency: 2, coarsePointer: true })).toBe(
      'low',
    );
    expect(detectMemoryTier({ deviceMemory: Number.NaN })).toBe('standard');
  });
});

describe('cacheBudgetBytes', () => {
  it('低内存档位把缓存压到 128MiB，标准档位保持 512MiB', () => {
    expect(cacheBudgetBytes('low')).toBe(128 * 1024 * 1024);
    expect(cacheBudgetBytes('standard')).toBe(512 * 1024 * 1024);
    expect(CACHE_BUDGET_BYTES.low).toBeLessThan(CACHE_BUDGET_BYTES.standard);
  });
});

describe('shouldAutoStart', () => {
  it('低内存或省流模式都不自动启动', () => {
    expect(shouldAutoStart('low', false)).toBe(false);
    expect(shouldAutoStart('standard', true)).toBe(false);
    expect(shouldAutoStart('standard', false)).toBe(true);
  });
});

describe('readMemorySignals', () => {
  it('从注入的 scope 读取信号', () => {
    expect(
      readMemorySignals({
        navigator: { deviceMemory: 2, hardwareConcurrency: 8 },
        matchMedia: () => ({ matches: true }),
      }),
    ).toEqual({ deviceMemory: 2, hardwareConcurrency: 8, coarsePointer: true });
  });

  it('缺少设备信号时只回填能读到的字段', () => {
    expect(readMemorySignals({ navigator: {}, matchMedia: () => ({ matches: false }) })).toEqual({
      deviceMemory: undefined,
      hardwareConcurrency: undefined,
      coarsePointer: false,
    });
  });

  it('生产路径不带 scope 时也能正常返回', () => {
    expect(readMemorySignals()).toHaveProperty('coarsePointer');
  });

  it('matchMedia 抛错时不影响其它信号', () => {
    const signals = readMemorySignals({
      navigator: { deviceMemory: 8 },
      matchMedia: () => {
        throw new Error('unsupported');
      },
    });
    expect(signals.deviceMemory).toBe(8);
    expect(signals.coarsePointer).toBeUndefined();
  });
});
