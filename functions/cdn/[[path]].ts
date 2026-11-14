import manifest from '../../config/lean4-runtime.json';
import { parseRangeHeader, type ByteRange } from '../../src/cdn-range';

type RuntimeAsset = { key: string; bytes: number; contentType: string };
type R2ObjectMeta = {
  size: number;
  etag?: string;
  httpEtag?: string;
};
type R2ObjectBody = R2ObjectMeta & {
  body: ReadableStream;
};
type R2Bucket = {
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2ObjectBody | null>;
  head?(key: string): Promise<R2ObjectMeta | null>;
};
type Env = { LEAN_ASSETS: R2Bucket };
type Context = {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
  waitUntil?: (promise: Promise<unknown>) => void;
};

const assets = new Map<string, RuntimeAsset>(
  (manifest.assets as unknown as RuntimeAsset[]).map((asset) => [asset.key, asset]),
);

const CACHE_CONTROL = 'public,max-age=31536000,immutable';

/** 命中情况写进响应头，冒烟脚本和排查时不用靠猜。 */
const CACHE_STATUS_HEADER = 'X-Cdn-Cache';

/**
 * Pages Function 的响应默认是 `cf-cache-status: DYNAMIC`，不进边缘缓存，
 * 每个分片请求都要走一次 Functions 与 R2。用 Cache API 显式缓存，
 * 让同一数据中心的后续请求直接命中，避免被重复拉取放大成本。
 * 本地测试与不支持的运行时返回 null，自动退化为直读。
 */
const getEdgeCache = (): Cache | null => {
  const store = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return store?.default ?? null;
};

/** Range 在请求头里而不是 URL 上，必须编进 cache key，否则不同分片会互相覆盖。 */
const buildCacheKey = (request: Request, range: ByteRange | null): Request => {
  const url = new URL(request.url);
  if (range) url.searchParams.set('range', `${range.start}-${range.end}`);
  return new Request(url.toString(), { method: 'GET' });
};

const ignore = () => undefined;

const withCacheStatus = (response: Response, head: boolean): Response => {
  const copy = new Response(head ? null : response.body, response);
  copy.headers.set(CACHE_STATUS_HEADER, 'HIT');
  return copy;
};

/**
 * 同源 Lean 运行时网关：/cdn/<key> 直接从 R2 binding 读取。
 * 浏览器只请求站点自己的域名，因此不需要跨源 CORS / COEP 例外，
 * 也不依赖任何公网 R2 自定义域。Range 请求返回 206 供 Service Worker 分片。
 */
export const onRequest = async ({
  request,
  env,
  params,
  waitUntil,
}: Context): Promise<Response> => {
  const isHead = request.method === 'HEAD';
  if (request.method !== 'GET' && !isHead) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const parts = params.path;
  const key = Array.isArray(parts) ? parts.join('/') : (parts ?? '');
  const asset = assets.get(key);
  if (!asset) return new Response('Unknown runtime asset', { status: 404 });

  const header = request.headers.get('Range');
  const range = parseRangeHeader(header, asset.bytes);
  if (header !== null && range === null) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${asset.bytes}`, 'Accept-Ranges': 'bytes' },
    });
  }

  // HEAD 可以命中已有的 GET 缓存，但绝不写入缓存（空 body 会污染后续 GET）。
  const cache = getEdgeCache();
  const cacheKey = cache ? buildCacheKey(request, range) : null;

  if (cache && cacheKey) {
    const cached = await cache.match(cacheKey);
    if (cached) return withCacheStatus(cached, isHead);
  }

  let object: R2ObjectMeta | null;
  let body: ReadableStream | null = null;
  if (isHead && !range && typeof env.LEAN_ASSETS.head === 'function') {
    object = await env.LEAN_ASSETS.head(asset.key);
  } else {
    const fetched = range
      ? await env.LEAN_ASSETS.get(asset.key, {
          range: { offset: range.start, length: range.end - range.start + 1 },
        })
      : await env.LEAN_ASSETS.get(asset.key);
    object = fetched;
    if (fetched) {
      if (isHead) {
        // HEAD 不下发响应体：显式释放底层流，避免 Workers 运行时挂起流句柄。
        void fetched.body.cancel().catch(ignore);
      } else {
        body = fetched.body;
      }
    }
  }
  if (!object) return new Response('Runtime asset missing', { status: 404 });

  const length = range ? range.end - range.start + 1 : asset.bytes;
  const headers = new Headers({
    'Content-Type': asset.contentType,
    'Content-Length': String(length),
    'Accept-Ranges': 'bytes',
    'Cache-Control': CACHE_CONTROL,
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  });
  if (range) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${asset.bytes}`);
  }
  // 暴露对象 ETag：上传脚本据此与本地 MD5 比对，确认远端对象未损坏。
  const etag = object.httpEtag ?? (object.etag ? `"${object.etag}"` : undefined);
  if (etag) headers.set('ETag', etag);
  headers.set(CACHE_STATUS_HEADER, 'MISS');

  const response = new Response(body, {
    status: range ? 206 : 200,
    headers,
  });

  if (!isHead && cache && cacheKey) {
    // 写缓存失败不影响响应：R2 已经读到了，最坏情况只是下次再回源。
    const pending = cache.put(cacheKey, response.clone()).catch(ignore);
    if (waitUntil) waitUntil(pending);
    else await pending;
  }

  return response;
};
