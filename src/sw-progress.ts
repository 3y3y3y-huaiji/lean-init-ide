/**
 * Service Worker 的跨资产下载进度。
 *
 * 浏览器按资产发请求，单资产完成时它的百分比就是 100%；把已下载字节累计到
 * 清单总字节上，页面才能看到连续的总进度。
 */
export type OverallProgress = {
  loaded: number;
  total: number;
};

export const createProgressTracker = (totalBytes: number) => {
  const loadedByName = new Map<string, number>();

  return {
    record(name: string, loaded: number): OverallProgress {
      loadedByName.set(name, Math.max(0, loaded));
      let sum = 0;
      for (const bytes of loadedByName.values()) sum += bytes;
      return { loaded: sum, total: totalBytes };
    },
  };
};

/** 按资产各自节流：多个并发下载的大文件互不抢占通知窗口。 */
export const createAssetNotifyGate = (intervalMs = 100) => {
  const lastAtByName = new Map<string, number>();

  return (name: string, now: number, done: boolean): boolean => {
    if (done) {
      lastAtByName.set(name, now);
      return true;
    }
    const previous = lastAtByName.get(name);
    if (previous !== undefined && now - previous < intervalMs) {
      return false;
    }
    lastAtByName.set(name, now);
    return true;
  };
};
