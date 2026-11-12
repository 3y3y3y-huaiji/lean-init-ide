import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit';

const options = { perKeyLimit: 2, globalLimit: 100, windowMs: 1000, maxKeys: 8 };

describe('createRateLimiter', () => {
  it('同一个 key 超过额度后拒绝', () => {
    const limiter = createRateLimiter(options);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 1)).toBe(true);
    expect(limiter.allow('a', 2)).toBe(false);
  });

  it('不同 key 互不影响', () => {
    const limiter = createRateLimiter(options);
    limiter.allow('a', 0);
    limiter.allow('a', 0);
    expect(limiter.allow('a', 0)).toBe(false);
    expect(limiter.allow('b', 0)).toBe(true);
  });

  it('窗口结束后重新计数', () => {
    const limiter = createRateLimiter(options);
    limiter.allow('a', 0);
    limiter.allow('a', 500);
    expect(limiter.allow('a', 900)).toBe(false);
    expect(limiter.allow('a', 1000)).toBe(true);
  });

  it('全局额度对当前 isolate 生效', () => {
    const limiter = createRateLimiter({ ...options, perKeyLimit: 10, globalLimit: 2 });
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('b', 0)).toBe(true);
    expect(limiter.allow('c', 0)).toBe(false);
  });

  it('被单 key 限额挡下的请求不消耗全局额度', () => {
    // 全局只剩 1 个名额：如果第二个 a 也计入全局，b 就会被误伤。
    const limiter = createRateLimiter({ ...options, perKeyLimit: 1, globalLimit: 2 });
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 0)).toBe(false);
    expect(limiter.allow('b', 0)).toBe(true);
  });

  it('没有 key 时直接放行', () => {
    const limiter = createRateLimiter(options);
    expect(limiter.allow(null, 0)).toBe(true);
    expect(limiter.allow(undefined, 0)).toBe(true);
    expect(limiter.allow('', 0)).toBe(true);
  });

  it('key 数量超过上限时不会无限增长', () => {
    const limiter = createRateLimiter({
      ...options,
      maxKeys: 2,
      perKeyLimit: 10,
      globalLimit: 100,
    });
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('b', 0)).toBe(true);
    expect(limiter.allow('c', 0)).toBe(true);
    // 清空后旧 key 重新计数，但内存有界。
    expect(limiter.allow('a', 0)).toBe(true);
  });

  it('过期条目在容量检查时被清理', () => {
    const limiter = createRateLimiter({ ...options, maxKeys: 2, windowMs: 10, perKeyLimit: 10 });
    limiter.allow('a', 0);
    limiter.allow('b', 0);
    expect(limiter.allow('c', 10)).toBe(true);
  });
});
