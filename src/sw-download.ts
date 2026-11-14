/**
 * Service Worker 的分片下载器。
 *
 * 目标是「大分片保持吞吐，单分片变慢时不拖垮整个资产」：
 * - 每个分片共享一份时间预算（timeoutMs），预算内自动重试；
 * - 预算耗尽仍失败时，把分片二分后重新下载，最多拆 maxSplitDepth 层；
 * - 已下载完成的分片始终保留，不会因为一个慢片重下整个文件。
 *
 * 抽成纯模块便于单测（注入 fetch），SW 只负责重试上游源与组装响应。
 */
import { buildRanges, type ByteRange } from './sw-ranges';

export type DownloadProgress = {
  loaded: number;
  total: number;
};

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
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const errorOf = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

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
  } = options;

  if (signal.aborted) throw signal.reason ?? new Error('Download aborted.');
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error('chunkBytes must be a positive safe integer');
  }

  const ranges = buildRanges(total, chunkBytes);
  const parts = new Array<ArrayBuffer>(ranges.length);
  let loaded = 0;
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
    onProgress({ loaded: loaded + partial, total });
  };

  const fetchOnce = async (start: number, end: number, budgetMs: number): Promise<ArrayBuffer> => {
    const key = nextKey++;
    const response = await fetchImpl(url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, budgetMs))]),
      cache: 'no-store',
    });
    if (response.status !== 206) {
      throw new Error(`unexpected HTTP ${response.status}`);
    }
    const expected = end - start + 1;
    const reader = response.body?.getReader();
    if (!reader) {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== expected) {
        throw new Error(`range ${start}-${end} returned ${bytes.byteLength} bytes`);
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
          throw new Error(`range ${start}-${end} returned more than ${expected} bytes`);
        }
        bytes.set(value, received);
        received += value.byteLength;
        inflight.set(key, received);
        report();
      }
    } catch (error) {
      inflight.delete(key);
      report(true);
      throw error;
    }
    inflight.delete(key);
    if (received !== expected) {
      throw new Error(`range ${start}-${end} returned ${received} bytes`);
    }
    return bytes.buffer;
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
        if (attempt < retries) await sleep(300 * (attempt + 1));
      }
    }

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
      const part = await fetchRange(start, end, 0);
      parts[index] = part;
      loaded += part.byteLength;
      report(true);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, parallel), ranges.length) }, () => worker()),
  );
  return parts;
};
