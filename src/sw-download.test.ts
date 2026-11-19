import { describe, expect, it, vi } from 'vitest';
import { downloadRanges, downloadStream, type DownloadOptions } from './sw-download';

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

  it('大分片下载途中就汇报进度，而不是等整片完成', async () => {
    const body = bytes(8);
    let tick = 0;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const [start, end] = rangeOf(init);
      const slice = body.slice(start, end + 1);
      const stream = {
        getReader() {
          let step = 0;
          return {
            read: async () => {
              if (step === 0) {
                step += 1;
                return { done: false, value: slice.slice(0, 4) };
              }
              if (step === 1) {
                step += 1;
                return { done: false, value: slice.slice(4) };
              }
              return { done: true, value: undefined };
            },
          };
        },
      };
      return { status: 206, body: stream } as unknown as Response;
    });
    const progress: number[] = [];

    const parts = await downloadRanges(
      base({
        fetchImpl,
        total: 8,
        chunkBytes: 8,
        parallel: 1,
        timeoutMs: 10_000,
        now: () => (tick += 200),
        onProgress: ({ loaded }) => progress.push(loaded),
      }),
    );

    expect(new Uint8Array(parts[0]!)).toEqual(body);
    expect(progress).toContain(4);
    expect(progress.at(-1)).toBe(8);
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

  it('分片二分重试与并发交错时进度单调不减', async () => {
    const body = bytes(16);
    const seen: number[] = [];
    let tick = 1000;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const [start, end] = rangeOf(init);
      if (start === 0 && end === 7) {
        let step = 0;
        const cancel = vi.fn().mockResolvedValue(undefined);
        return {
          status: 206,
          body: {
            getReader: () => ({
              cancel,
              read: () => {
                if (step === 0) {
                  step += 1;
                  tick += 200;
                  return Promise.resolve({ done: false, value: body.slice(0, 3) });
                }
                return new Promise((_resolve, reject) => {
                  init?.signal?.addEventListener(
                    'abort',
                    () => reject(init.signal?.reason ?? new Error('aborted')),
                    { once: true },
                  );
                });
              },
            }),
          },
        } as unknown as Response;
      }
      const slice = body.slice(start, end + 1);
      const mid = Math.ceil(slice.length / 2);
      let step = 0;
      return {
        status: 206,
        body: {
          getReader: () => ({
            cancel: vi.fn().mockResolvedValue(undefined),
            read: async () => {
              tick += 200;
              if (step === 0) {
                step += 1;
                return { done: false, value: slice.slice(0, mid) };
              }
              if (step === 1) {
                step += 1;
                return { done: false, value: slice.slice(mid) };
              }
              return { done: true, value: undefined };
            },
          }),
        },
      } as unknown as Response;
    });

    const parts = await downloadRanges(
      base({
        fetchImpl,
        total: 16,
        chunkBytes: 8,
        parallel: 2,
        retries: 0,
        timeoutMs: 30,
        now: () => tick,
        onProgress: ({ loaded }) => seen.push(loaded),
      }),
    );

    expect(new Uint8Array(parts.flatMap((part) => [...new Uint8Array(part)]))).toEqual(body);
    expect(seen.length).toBeGreaterThan(2);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
    expect(seen.at(-1)).toBe(16);
  });

  it('流式读取超出预期字节时取消 reader 并抛错', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    let step = 0;
    const fakeResponse = {
      status: 206,
      body: {
        getReader: () => ({
          read: vi.fn(async () => {
            if (step === 0) {
              step += 1;
              return { done: false, value: new Uint8Array([1, 2, 3, 4, 5]) };
            }
            return { done: true, value: undefined };
          }),
          cancel,
        }),
      },
    } as unknown as Response;

    await expect(
      downloadRanges(
        base({
          total: 4,
          chunkBytes: 4,
          retries: 0,
          maxSplitDepth: 0,
          fetchImpl: vi.fn(async () => fakeResponse),
        }),
      ),
    ).rejects.toThrow('returned more than 4 bytes');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('响应体缺少流式 reader 时仍正常触发完成进度', async () => {
    const body = bytes(4);
    const seen: number[] = [];
    const fakeResponse = {
      status: 206,
      body: null,
      arrayBuffer: async () => body.slice().buffer,
    } as unknown as Response;

    const parts = await downloadRanges(
      base({
        total: 4,
        chunkBytes: 4,
        fetchImpl: vi.fn(async () => fakeResponse),
        onProgress: ({ loaded }) => seen.push(loaded),
      }),
    );

    expect(new Uint8Array(parts[0]!)).toEqual(body);
    expect(seen).toEqual([4]);
  });

  it('响应体缺少流式 reader 且字节数不符时抛错', async () => {
    const fakeResponse = {
      status: 206,
      body: null,
      arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
    } as unknown as Response;

    await expect(
      downloadRanges(
        base({
          total: 4,
          chunkBytes: 4,
          retries: 0,
          maxSplitDepth: 0,
          fetchImpl: vi.fn(async () => fakeResponse),
        }),
      ),
    ).rejects.toThrow('returned 2 bytes');
  });
});

describe('downloadStream', () => {
  it('使用不带 Range 的简单 GET 流式读取并单调汇报进度', async () => {
    const body = bytes(10);
    let tick = 0;
    const progress: number[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toBeUndefined();
      return {
        ok: true,
        status: 200,
        body: {
          getReader() {
            let step = 0;
            return {
              read: async () => {
                tick += 200;
                if (step === 0) {
                  step += 1;
                  return { done: false, value: body.slice(0, 4) };
                }
                if (step === 1) {
                  step += 1;
                  return { done: false, value: body.slice(4) };
                }
                return { done: true, value: undefined };
              },
              cancel: vi.fn(),
            };
          },
        },
      } as unknown as Response;
    });

    const parts = await downloadStream({
      url: 'https://modelscope.cn/datasets/example/lean4-assets/resolve/master/wasm-lean4/lean.mjs',
      total: 10,
      timeoutMs: 10_000,
      retries: 1,
      signal: new AbortController().signal,
      fetchImpl,
      now: () => tick,
      onProgress: ({ loaded }) => progress.push(loaded),
    });

    expect(new Uint8Array(parts[0]!)).toEqual(body);
    expect(progress).toEqual([4, 10]);
  });

  it('瞬时 HTTP 异常后会重试，超限则取消流并抛错', async () => {
    const body = bytes(4);
    let calls = 0;
    const parts = await downloadStream({
      url: 'https://modelscope.cn/asset',
      total: 4,
      timeoutMs: 10_000,
      retries: 1,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      fetchImpl: vi.fn(async () => {
        calls += 1;
        if (calls === 1) return new Response(null, { status: 502 });
        return new Response(body, { status: 200 });
      }),
    });
    expect(calls).toBe(2);
    expect(new Uint8Array(parts[0]!)).toEqual(body);

    const cancel = vi.fn().mockResolvedValue(undefined);
    await expect(
      downloadStream({
        url: 'https://modelscope.cn/bad',
        total: 4,
        timeoutMs: 10_000,
        retries: 0,
        signal: new AbortController().signal,
        fetchImpl: vi.fn(
          async () =>
            ({
              ok: true,
              status: 200,
              body: {
                getReader: () => ({
                  read: async () => ({ done: false, value: new Uint8Array([1, 2, 3, 4, 5]) }),
                  cancel,
                }),
              },
            }) as unknown as Response,
        ),
      }),
    ).rejects.toThrow('returned more than 4 bytes');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('chunkBytes 非正整数或外部已取消时立即拒绝', async () => {
    const fetchImpl = vi.fn();
    await expect(downloadRanges(base({ fetchImpl, chunkBytes: 0 }))).rejects.toThrow(
      'chunkBytes must be a positive safe integer',
    );
    await expect(downloadRanges(base({ fetchImpl, chunkBytes: -4 }))).rejects.toThrow(
      'chunkBytes must be a positive safe integer',
    );

    const controller = new AbortController();
    controller.abort(new Error('cancelled early'));
    await expect(
      downloadStream({
        url: 'https://modelscope.cn/aborted',
        total: 4,
        timeoutMs: 10_000,
        retries: 0,
        signal: controller.signal,
        fetchImpl,
      }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('downloadStream 遇到提前截断的流或非流式大小不匹配时会抛错', async () => {
    await expect(
      downloadStream({
        url: 'https://modelscope.cn/short-stream',
        total: 5,
        timeoutMs: 10_000,
        retries: 0,
        signal: new AbortController().signal,
        fetchImpl: vi.fn(
          async () =>
            ({
              ok: true,
              status: 200,
              body: {
                getReader: () => {
                  let sent = false;
                  return {
                    read: async () => {
                      if (!sent) {
                        sent = true;
                        return { done: false, value: new Uint8Array([1, 2]) };
                      }
                      return { done: true, value: undefined };
                    },
                    cancel: vi.fn(),
                  };
                },
              },
            }) as unknown as Response,
        ),
      }),
    ).rejects.toThrow('returned 2 bytes');

    await expect(
      downloadStream({
        url: 'https://modelscope.cn/short-buffer',
        total: 5,
        timeoutMs: 10_000,
        retries: 0,
        signal: new AbortController().signal,
        fetchImpl: vi.fn(async () => new Response(new Uint8Array([1, 2]), { status: 200 })),
      }),
    ).rejects.toThrow('returned 2 bytes');
  });
});
