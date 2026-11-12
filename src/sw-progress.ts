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
