/**
 * Service Worker 的分片下载器。
 *
 * 目标是「大分片保持吞吐，单分片变慢时不拖垮整个资产」：
 * - 每个分片共享一份时间预算（timeoutMs），预算内自动重试；
 * - 预算耗尽仍失败时，把分片二分后重新下载，最多拆 maxSplitDepth 层；
 * - 已下载完成的分片始终保留，不会因为一个慢片重下整个文件。
 * - 遇到 429/503（限流）时按 Retry-After 或指数退避 + 抖动等待，且禁止二分拆分：
 *   限流窗口内拆分会把一次失败放大成数十次请求，直接把压力交给上层换源。
 * - 所有资产的 Range 请求共享同一个全局并发池，多个资产同时预取时不会叠加尖峰。
 *
 * 抽成纯模块便于单测（注入 fetch），SW 只负责重试上游源与组装响应。
 */
import { buildRanges, type ByteRange } from './sw-ranges';

export type DownloadProgress = {
  loaded: number;
  total: number;
};

/** 429/503 等 HTTP 错误：保留状态码与 Retry-After，供上层快速换源而不是继续轰炸。 */
export class DownloadHttpError extends Error {
  readonly status: number;
  /** Retry-After 解析出的毫秒数；响应头缺失或非法时为 null。 */
  readonly retryAfterMs: number | null;

  constructor(status: number, retryAfterMs: number | null) {
    super(`unexpected HTTP ${status}`);
    this.name = 'DownloadHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** 限流类状态码：Retry-After 优先，且重试耗尽后禁止二分拆分。 */
const RATE_LIMIT_STATUSES = new Set([429, 503]);

export const isRateLimitError = (error: unknown): error is DownloadHttpError =>
  error instanceof DownloadHttpError && RATE_LIMIT_STATUSES.has(error.status);

const MAX_RETRY_AFTER_MS = 60_000;

/** 解析 Retry-After（秒数或 HTTP 日期），上限 60s，避免被异常响应头拖死。 */
export const parseRetryAfter = (value: string | null, now: number): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.round(seconds * 1000));
  }
  const at = Date.parse(trimmed);
  if (Number.isFinite(at)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, at - now));
  return null;
};

const httpErrorOf = (response: Response, now: number): DownloadHttpError =>
  new DownloadHttpError(response.status, parseRetryAfter(response.headers.get('retry-after'), now));

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

/** 限流时优先遵守 Retry-After，否则指数退避并对半抖动；其余错误保持短退避。 */
const retryDelay = (error: Error, attempt: number, random: () => number): number => {
  if (!isRateLimitError(error)) return 300 * (attempt + 1);
  if (error.retryAfterMs !== null) return error.retryAfterMs;
  const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.round(exponential * (0.5 + random() * 0.5));
};

export type ReleaseSlot = () => void;

/** 轻量信号量：限流的是在途请求数，而不是下载任务数。 */
export type DownloadLimiter = {
  acquire(signal: AbortSignal): Promise<ReleaseSlot>;
};

export const createDownloadLimiter = (limit: number): DownloadLimiter => {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('limiter limit must be a positive safe integer');
  }
  let active = 0;
  type Waiter = {
    signal: AbortSignal;
    settle: (release: ReleaseSlot) => void;
    fail: (error: unknown) => void;
    onAbort: () => void;
  };
  const waiters: Waiter[] = [];

  const release: ReleaseSlot = () => {
    active -= 1;
    const next = waiters.shift();
    if (!next) return;
    next.signal.removeEventListener('abort', next.onAbort);
    active += 1;
    next.settle(release);
  };

  return {
    acquire: (signal) => {
      if (signal.aborted) {
        return Promise.reject(signal.reason ?? new Error('Download aborted.'));
      }
      if (active < limit) {
        active += 1;
        return Promise.resolve(release);
      }
      return new Promise<ReleaseSlot>((settle, fail) => {
        const onAbort = () => {
          const index = waiters.findIndex((waiter) => waiter.onAbort === onAbort);
          if (index >= 0) waiters.splice(index, 1);
          fail(signal.reason ?? new Error('Download aborted.'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        waiters.push({ signal, settle, fail, onAbort });
      });
    },
  };
};

/**
 * 跨资产共享的同源在途请求上限。单个资产仍可按 4 片并发下载，
 * 但多个 `.pack.gz.bin` 同时预取时全局最多 6 条 Range 请求，避免瞬时尖峰触发平台限流。
 */
export const GLOBAL_DOWNLOAD_CONCURRENCY = 6;
export const sharedDownloadLimiter = createDownloadLimiter(GLOBAL_DOWNLOAD_CONCURRENCY);

export type DownloadOptions = {
  url: string;
  total: number;
  chunkBytes: number;
  parallel: number;
  /** 单个分片的总时间预算（含重试）。 */
  timeoutMs: number;
  retries: number;
  /** 拆分下限：小于该字节数不再拆分，直接失败。 */
  minSplitBytes: number;
  maxSplitDepth: number;
  signal: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** 在途请求信号量；默认使用跨资产共享的全局池。 */
  limiter?: DownloadLimiter;
  /** 退避抖动来源；测试可注入确定值。 */
  random?: () => number;
};

export type StreamDownloadOptions = {
  url: string;
  total: number;
  /** 整文件流式下载的时间预算（含重试）。 */
  timeoutMs: number;
  retries: number;
  signal: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const errorOf = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const readExactResponseBytes = async (
  response: Response,
  expected: number,
  label: string,
  onChunk: (received: number) => void,
  onAbort: () => void,
): Promise<ArrayBuffer> => {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== expected) {
      throw new Error(`${label} returned ${bytes.byteLength} bytes`);
    }
    return bytes;
  }

  const bytes = new Uint8Array(expected);
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.byteLength > expected) {
        throw new Error(`${label} returned more than ${expected} bytes`);
      }
      bytes.set(value, received);
      received += value.byteLength;
      onChunk(received);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    onAbort();
    throw error;
  }
  if (received !== expected) {
    onAbort();
    throw new Error(`${label} returned ${received} bytes`);
  }
  return bytes.buffer;
};

export const downloadRanges = async (options: DownloadOptions): Promise<ArrayBuffer[]> => {
  const {
    url,
    total,
    chunkBytes,
    parallel,
    timeoutMs,
    retries,
    minSplitBytes,
    maxSplitDepth,
    signal,
    onProgress,
    fetchImpl = fetch,
    now = Date.now,
    sleep = defaultSleep,
    limiter = sharedDownloadLimiter,
    random = Math.random,
  } = options;

  if (signal.aborted) throw signal.reason ?? new Error('Download aborted.');
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error('chunkBytes must be a positive safe integer');
  }

  const ranges = buildRanges(total, chunkBytes);
  const parts = new Array<ArrayBuffer>(ranges.length);
  let committed = 0;
  let maxReported = 0;
  let next = 0;
  // 正在下载的分片按 key 记录已收到的字节：4MB 分片在慢网络下要几十秒，
  // 只在分片完成时汇报会让进度条长时间停在原地，看起来像“没了”。
  const inflight = new Map<number, number>();
  let nextKey = 0;
  let lastReportAt = 0;

  const report = (force = false) => {
    if (!onProgress) return;
    const at = now();
    if (!force && at - lastReportAt < 120) return;
    lastReportAt = at;
    let partial = 0;
    for (const bytes of inflight.values()) partial += bytes;
    // 分片完成时先将字节并入 committed 再删除 inflight，并用单调上界兜底：
    // 即便遇到瞬时分片重试清零 inflight，进度条也不会回退。
    maxReported = Math.max(maxReported, Math.min(total, committed + partial));
    onProgress({ loaded: maxReported, total });
  };

  const fetchOnce = async (start: number, end: number, budgetMs: number): Promise<ArrayBuffer> => {
    const key = nextKey++;
    // 全局信号量只限制在途请求（含读流阶段），下载任务本身仍可排队等待。
    const release = await limiter.acquire(signal);
    try {
      const response = await fetchImpl(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, budgetMs))]),
        cache: 'no-store',
      });
      if (response.status !== 206) {
        throw httpErrorOf(response, now());
      }
      const expected = end - start + 1;
      const buffer = await readExactResponseBytes(
        response,
        expected,
        `range ${start}-${end}`,
        (received) => {
          inflight.set(key, received);
          report();
        },
        () => {
          inflight.delete(key);
          report(true);
        },
      );
      committed += expected;
      inflight.delete(key);
      report(true);
      return buffer;
    } finally {
      release();
    }
  };

  const fetchRange = async (start: number, end: number, depth: number): Promise<ArrayBuffer> => {
    const deadline = now() + timeoutMs;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (signal.aborted) throw signal.reason ?? new Error('Download aborted.');
      const remaining = deadline - now();
      if (remaining <= 0) break;
      try {
        return await fetchOnce(start, end, remaining);
      } catch (error) {
        lastError = errorOf(error);
        if (signal.aborted) throw lastError;
        if (attempt < retries) {
          const delay = retryDelay(lastError, attempt, random);
          // 等待时间超出预算时直接失败并交给上层换源，不把线程拖到超时。
          if (delay >= deadline - now()) break;
          await sleep(delay);
        }
      }
    }

    // 429/503 说明源已被限流：再二分只会放大请求，直接失败让上层切到备用源。
    if (isRateLimitError(lastError)) throw lastError;

    const length = end - start + 1;
    if (depth < maxSplitDepth && length > minSplitBytes) {
      const middle = start + Math.floor(length / 2);
      const [left, right] = await Promise.all([
        fetchRange(start, middle - 1, depth + 1),
        fetchRange(middle, end, depth + 1),
      ]);
      const combined = new Uint8Array(length);
      combined.set(new Uint8Array(left), 0);
      combined.set(new Uint8Array(right), left.byteLength);
      return combined.buffer;
    }

    throw lastError ?? new Error(`range ${start}-${end} failed`);
  };

  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= ranges.length) return;
      const [start, end] = ranges[index]! satisfies ByteRange;
      parts[index] = await fetchRange(start, end, 0);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, parallel), ranges.length) }, () => worker()),
  );
  return parts;
};

/**
 * 跨域简单 GET 流式下载：不附带 Range 等非简单请求头，避免魔搭 LFS（cdn-lfs）
 * 在 OPTIONS 预检返回 403 导致浏览器整段失败并回退慢速通道。
 */
export const downloadStream = async (options: StreamDownloadOptions): Promise<ArrayBuffer[]> => {
  const {
    url,
    total,
    timeoutMs,
    retries,
    signal,
    onProgress,
    fetchImpl = fetch,
    now = Date.now,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  if (signal.aborted) throw signal.reason ?? new Error('Download aborted.');
  let maxReported = 0;
  let lastReportAt = 0;
  const emit = (loaded: number, force = false) => {
    if (!onProgress) return;
    const at = now();
    if (!force && at - lastReportAt < 120) return;
    const next = Math.max(maxReported, Math.min(total, loaded));
    if (next === maxReported && maxReported > 0) return;
    lastReportAt = at;
    maxReported = next;
    onProgress({ loaded: maxReported, total });
  };

  let lastError: Error | undefined;
  const deadline = now() + timeoutMs;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal.aborted) throw signal.reason ?? new Error('Download aborted.');
    const remaining = deadline - now();
    if (remaining <= 0) break;
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, remaining))]),
        cache: 'no-store',
      });
      if (!response.ok) {
        throw httpErrorOf(response, now());
      }
      const buffer = await readExactResponseBytes(
        response,
        total,
        `stream ${url}`,
        (received) => emit(received),
        () => emit(maxReported, true),
      );
      emit(total, true);
      return [buffer];
    } catch (error) {
      lastError = errorOf(error);
      if (signal.aborted) throw lastError;
      if (attempt < retries) {
        const delay = retryDelay(lastError, attempt, random);
        if (delay >= deadline - now()) break;
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error(`stream ${url} failed`);
};
