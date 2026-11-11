import { describe, expect, it, vi } from 'vitest';
import { downloadRanges, type DownloadOptions } from './sw-download';

const bytes = (length: number) => Uint8Array.from({ length }, (_, index) => index % 251);

const rangeOf = (init?: RequestInit): [number, number] => {
  const header = new Headers(init?.headers).get('Range') ?? '';
  const match = /^bytes=(\d+)-(\d+)$/.exec(header);
  if (!match) throw new Error(`unexpected Range header: ${header}`);
  return [Number(match[1]), Number(match[2])];
};

const partial = (body: Uint8Array, [start, end]: [number, number]) =>
  new Response(body.slice(start, end + 1), { status: 206 });

const hanging = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  });

const base = (overrides: Partial<DownloadOptions>): DownloadOptions => ({
  url: 'https://example.test/cdn/asset',
  total: 10,
  chunkBytes: 4,
  parallel: 2,
  timeoutMs: 30,
  retries: 1,
  minSplitBytes: 1,
  maxSplitDepth: 2,
  signal: new AbortController().signal,
  ...overrides,
});

describe('downloadRanges', () => {
  it('按顺序拼出全部分片并汇报进度', async () => {
    const body = bytes(10);
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      partial(body, rangeOf(init)),
    );
    const progress: number[] = [];

    const parts = await downloadRanges(
      base({ fetchImpl, onProgress: ({ loaded }) => progress.push(loaded) }),
    );

    expect(parts.map((part) => part.byteLength)).toEqual([4, 4, 2]);
    expect(new Uint8Array(parts.flatMap((part) => [...new Uint8Array(part)]))).toEqual(body);
    expect(progress.at(-1)).toBe(10);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('单个分片瞬时失败后重试成功，不重下已完成的分片', async () => {
    const body = bytes(10);
    let failed = false;
    const calls: [number, number][] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const range = rangeOf(init);
      calls.push(range);
      if (range[0] === 4 && range[1] === 7 && !failed) {
        failed = true;
        return new Response('boom', { status: 503 });
      }
      return partial(body, range);
    });

    const parts = await downloadRanges(base({ fetchImpl }));

    expect(new Uint8Array(parts.flatMap((part) => [...new Uint8Array(part)]))).toEqual(body);
    expect(calls.filter(([start, end]) => start === 0 && end === 3)).toHaveLength(1);
    expect(calls.filter(([start, end]) => start === 8 && end === 9)).toHaveLength(1);
    expect(calls.filter(([start, end]) => start === 4 && end === 7).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('分片超时后二分重试，已完成的字节不丢失', async () => {
    const body = bytes(8);
    const calls: [number, number][] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const range = rangeOf(init);
      calls.push(range);
      if (range[0] === 0 && range[1] === 7) return hanging(init);
      return partial(body, range);
    });

    const parts = await downloadRanges(
      base({ fetchImpl, total: 8, chunkBytes: 8, retries: 0, timeoutMs: 25 }),
    );

    expect(new Uint8Array(parts[0]!)).toEqual(body);
    expect(calls).toEqual([
      [0, 7],
      [0, 3],
      [4, 7],
    ]);
  });

  it('达到拆分深度仍失败时抛错', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => hanging(init));

    await expect(
      downloadRanges(
        base({ fetchImpl, total: 8, chunkBytes: 8, retries: 0, timeoutMs: 20, maxSplitDepth: 0 }),
      ),
    ).rejects.toThrow();
  });

  it('外部取消会立刻终止下载', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();

    await expect(downloadRanges(base({ fetchImpl, signal: controller.signal }))).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('并发不超过 parallel', async () => {
    const body = bytes(10);
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return partial(body, rangeOf(init));
    });

    await downloadRanges(base({ fetchImpl, parallel: 2, retries: 0 }));

    expect(peak).toBe(2);
  });
});
