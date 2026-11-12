/**
 * 固定窗口限流器：给没有 WAF 规则的端点做兜底。
 *
 * 状态只存在当前 isolate 的内存里，跨 isolate / 跨数据中心不共享，也随实例回收清零。
 * 它能挡住单 IP 的持续灌水，但对分布式来源只是降低而非消除风险——定位是「尽力而为」，
 * 真正的边界仍应放在 Cloudflare 规则上。
 */

export type RateLimiterOptions = {
  /** 单个 key（通常是客户端 IP）在窗口内允许的请求数。 */
  perKeyLimit: number;
  /** 当前 isolate 在窗口内允许的总请求数，防止大量来源同时打满。 */
  globalLimit: number;
  windowMs: number;
  /** 最多记忆多少个 key；超过后先清过期项，仍满则整体清空。 */
  maxKeys: number;
};

export type RateLimiter = {
  /** key 为空时直接放行：本地预览拿不到 CF-Connecting-IP，不能误伤开发环境。 */
  allow(key: string | null | undefined, now?: number): boolean;
};

export const createRateLimiter = (options: RateLimiterOptions): RateLimiter => {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let global = { count: 0, resetAt: 0 };

  const prune = (now: number): void => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    // 仍然满说明都是活跃 key：放弃精确计数，优先保证内存不无限增长。
    if (buckets.size >= options.maxKeys) buckets.clear();
  };

  return {
    allow(key, now = Date.now()) {
      if (!key) return true;

      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        if (buckets.size >= options.maxKeys) prune(now);
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      } else {
        bucket.count += 1;
        if (bucket.count > options.perKeyLimit) return false;
      }

      // 被单 key 限额挡下的请求不消耗全局额度，避免一个来源拖垮同一 isolate 的其他用户。
      if (global.resetAt <= now) global = { count: 0, resetAt: now + options.windowMs };
      global.count += 1;
      return global.count <= options.globalLimit;
    },
  };
};
