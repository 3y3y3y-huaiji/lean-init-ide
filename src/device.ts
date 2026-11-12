/**
 * 设备能力分档：只影响持久缓存预算与是否自动启动 Lean。
 *
 * wasm 内存上限固定 1GiB（Init 导入峰值需要），这里不碰它。
 * 低端设备的问题不是堆上限不够，而是「下载 143MB + 写入缓存」会和解压、wasm 堆抢内存，
 * 所以只在低内存档位下调缓存预算，并把自动启动交还给用户。
 */

export type MemoryTier = 'low' | 'standard';

const MIB = 1024 * 1024;

export const CACHE_BUDGET_BYTES: Record<MemoryTier, number> = {
  /** 低内存：只留常用资产，给解压与 wasm 堆腾空间。 */
  low: 128 * MIB,
  /** 默认：沿用 @wasm-idle/core 的 512MiB LRU。 */
  standard: 512 * MIB,
};

export type MemorySignals = {
  /** navigator.deviceMemory，单位 GiB；Safari / Firefox 不提供。 */
  deviceMemory?: number;
  hardwareConcurrency?: number;
  /** 粗指针近似触屏设备；触屏笔记本也可能命中，所以只作辅助信号。 */
  coarsePointer?: boolean;
};

export const detectMemoryTier = (signals: MemorySignals): MemoryTier => {
  const memory = signals.deviceMemory;
  if (typeof memory === 'number' && memory > 0) {
    return memory <= 4 ? 'low' : 'standard';
  }
  // deviceMemory 缺失时只对「核数少 + 触屏」降档，避免桌面浏览器被误判。
  const cores = signals.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0 && cores <= 4 && signals.coarsePointer === true) {
    return 'low';
  }
  return 'standard';
};

export const cacheBudgetBytes = (tier: MemoryTier): number => CACHE_BUDGET_BYTES[tier];

/** 低内存或用户开了省流模式时都不自动下载，交由用户确认。 */
export const shouldAutoStart = (tier: MemoryTier, saveData: boolean): boolean =>
  tier !== 'low' && !saveData;

type NavigatorSignals = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
};

type SignalScope = {
  navigator?: NavigatorSignals;
  matchMedia?: (query: string) => { matches: boolean };
};

/** 读宿主环境的信号；注入 scope 只为单测，生产走全局 navigator / matchMedia。 */
export const readMemorySignals = (scope: SignalScope = {}): MemorySignals => {
  const nav: NavigatorSignals | undefined =
    scope.navigator ??
    (typeof navigator === 'undefined' ? undefined : (navigator as NavigatorSignals));
  const media =
    scope.matchMedia ??
    (typeof window === 'undefined' ? undefined : window.matchMedia?.bind(window));

  let coarsePointer: boolean | undefined;
  try {
    coarsePointer = media ? media('(pointer: coarse)').matches : undefined;
  } catch {
    coarsePointer = undefined;
  }

  return {
    deviceMemory: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    hardwareConcurrency:
      typeof nav?.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    coarsePointer,
  };
};

export const currentMemoryTier = (): MemoryTier => detectMemoryTier(readMemorySignals());
