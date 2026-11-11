import { afterEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../config/lean4-runtime.json';
import { onRequest } from './[[path]]';

type Asset = { key: string; bytes: number; contentType: string };
type Ctx = Parameters<typeof onRequest>[0];

const assets = manifest.assets as Asset[];
const sample = assets[0]!;

const bodyStream = (length: number) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(length));
      controller.close();
    },
  });

const hit = (size: number, extra: { httpEtag?: string; etag?: string } = {}) => ({
  size,
  body: bodyStream(size),
  ...extra,
});

const createEnv = (
  get: (key: string, options?: { range?: { offset: number; length: number } }) => unknown,
) => ({ LEAN_ASSETS: { get: vi.fn(get) } }) as unknown as Ctx['env'];

const call = (
  env: Ctx['env'],
  init: { method?: string; range?: string; path?: string | string[] } = {},
): Promise<Response> =>
  onRequest({
    request: new Request('https://example.test/cdn/asset', {
      method: init.method ?? 'GET',
      headers: init.range === undefined ? {} : { Range: init.range },
    }),
    env,
    params: { path: init.path ?? sample.key },
  });

describe('同源 /cdn 网关', () => {
  it('拒绝 GET/HEAD 以外的方法并给出 Allow', async () => {
    const response = await call(
      createEnv(() => hit(sample.bytes)),
      { method: 'POST' },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
  });

  it('白名单外的 key 返回 404 且不触碰 R2', async () => {
    const get = vi.fn(() => hit(1));
    const response = await call(createEnv(get), { path: '../package.json' });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Unknown runtime asset');
    expect(get).not.toHaveBeenCalled();
  });

  it('完整请求返回 200 并带上长缓存与并发头', async () => {
    const response = await call(createEnv(() => hit(sample.bytes)));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe(String(sample.bytes));
    expect(response.headers.get('Content-Type')).toBe(sample.contentType);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Cache-Control')).toBe('public,max-age=31536000,immutable');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Content-Range')).toBeNull();
  });

  it('HEAD 返回同样的头但不带 body', async () => {
    const response = await call(
      createEnv(() => hit(sample.bytes)),
      { method: 'HEAD' },
    );

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get('Content-Length')).toBe(String(sample.bytes));
  });

  it('合法 Range 返回 206 与正确的 Content-Range', async () => {
    const get = vi.fn(() => hit(100));
    const response = await call(createEnv(get), { range: 'bytes=0-99' });

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(`bytes 0-99/${sample.bytes}`);
    expect(response.headers.get('Content-Length')).toBe('100');
    expect(get).toHaveBeenCalledWith(sample.key, { range: { offset: 0, length: 100 } });
  });

  it('末尾分片的 end 被夹到 size-1', async () => {
    const start = sample.bytes - 10;
    const get = vi.fn(() => hit(10));
    const response = await call(createEnv(get), { range: `bytes=${start}-` });

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(
      `bytes ${start}-${sample.bytes - 1}/${sample.bytes}`,
    );
    expect(get).toHaveBeenCalledWith(sample.key, { range: { offset: start, length: 10 } });
  });

  it('越界或格式非法的 Range 返回 416 且不触碰 R2', async () => {
    for (const range of [`bytes=${sample.bytes}-`, 'bytes=abc', 'bytes=-5', 'items=0-1']) {
      const get = vi.fn(() => hit(1));
      const response = await call(createEnv(get), { range });

      expect(response.status, range).toBe(416);
      expect(response.headers.get('Content-Range'), range).toBe(`bytes */${sample.bytes}`);
      expect(response.headers.get('Accept-Ranges'), range).toBe('bytes');
      expect(get, range).not.toHaveBeenCalled();
    }
  });

  it('清单内但 R2 缺对象时返回 404', async () => {
    const response = await call(createEnv(() => null));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Runtime asset missing');
  });

  it('params.path 为数组时按路径拼接', async () => {
    const nested = assets.find((asset) => asset.key.includes('/'));
    const target = nested ?? sample;
    const get = vi.fn(() => hit(target.bytes));

    const response = await call(createEnv(get), {
      path: nested ? target.key.split('/') : [target.key],
    });

    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledWith(target.key);
  });

  it('优先透传 R2 的 httpEtag', async () => {
    const response = await call(createEnv(() => hit(sample.bytes, { httpEtag: '"abc123"' })));

    expect(response.headers.get('ETag')).toBe('"abc123"');
  });

  it('缺少 httpEtag 时用 etag 补引号', async () => {
    const response = await call(createEnv(() => hit(sample.bytes, { etag: 'def456' })));

    expect(response.headers.get('ETag')).toBe('"def456"');
  });

  it('两个 ETag 都没有时不写 ETag 头', async () => {
    const response = await call(createEnv(() => hit(sample.bytes)));

    expect(response.headers.get('ETag')).toBeNull();
  });
});

describe('边缘缓存', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('未命中时回源、标 MISS 并写入缓存', async () => {
    const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) };
    vi.stubGlobal('caches', { default: cache });
    const get = vi.fn(() => hit(sample.bytes));

    const response = await call(createEnv(get));

    expect(response.headers.get('X-Cdn-Cache')).toBe('MISS');
    expect(cache.match).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('命中时直接返回，不再触碰 R2', async () => {
    const cached = new Response(null, { status: 206 });
    const cache = { match: vi.fn(async () => cached), put: vi.fn(async () => undefined) };
    vi.stubGlobal('caches', { default: cache });
    const get = vi.fn(() => hit(sample.bytes));

    const response = await call(createEnv(get), { range: 'bytes=0-99' });

    expect(response.status).toBe(206);
    expect(response.headers.get('X-Cdn-Cache')).toBe('HIT');
    expect(get).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('Range 编进 cache key，不同分片不会互相覆盖', async () => {
    const cache = {
      match: vi.fn<(request: Request) => Promise<Response | undefined>>(async () => undefined),
      put: vi.fn<(request: Request, response: Response) => Promise<undefined>>(
        async () => undefined,
      ),
    };
    vi.stubGlobal('caches', { default: cache });

    await call(
      createEnv(() => hit(100)),
      { range: 'bytes=0-99' },
    );
    await call(
      createEnv(() => hit(100)),
      { range: 'bytes=100-199' },
    );

    const keys = cache.match.mock.calls.map(([request]) => request.url);
    expect(keys[0]).toContain('range=0-99');
    expect(keys[1]).toContain('range=100-199');
    expect(new Set(keys).size).toBe(2);
  });

  it('HEAD 请求既不查缓存也不写缓存', async () => {
    const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) };
    vi.stubGlobal('caches', { default: cache });

    const response = await call(
      createEnv(() => hit(sample.bytes)),
      { method: 'HEAD' },
    );

    expect(response.status).toBe(200);
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('没有 Cache API 时退化为直读，不影响响应', async () => {
    vi.stubGlobal('caches', undefined);
    const get = vi.fn(() => hit(sample.bytes));

    const response = await call(createEnv(get));

    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('写缓存失败不改变响应结果', async () => {
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => {
        throw new Error('cache quota exceeded');
      }),
    };
    vi.stubGlobal('caches', { default: cache });

    const response = await call(createEnv(() => hit(sample.bytes)));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe(String(sample.bytes));
  });
});
