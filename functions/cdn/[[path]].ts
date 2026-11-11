import manifest from '../../config/lean4-runtime.json';
import { parseRangeHeader } from '../../src/cdn-range';

type RuntimeAsset = { key: string; bytes: number; contentType: string };
type R2ObjectBody = {
  size: number;
  body: ReadableStream;
  etag?: string;
  httpEtag?: string;
};
type R2Bucket = {
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2ObjectBody | null>;
};
type Env = { LEAN_ASSETS: R2Bucket };
type Context = {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
};

const assets = new Map<string, RuntimeAsset>(
  (manifest.assets as unknown as RuntimeAsset[]).map((asset) => [asset.key, asset]),
);

const CACHE_CONTROL = 'public,max-age=31536000,immutable';

/**
 * 同源 Lean 运行时网关：/cdn/<key> 直接从 R2 binding 读取。
 * 浏览器只请求站点自己的域名，因此不需要跨源 CORS / COEP 例外，
 * 也不依赖任何公网 R2 自定义域。Range 请求返回 206 供 Service Worker 分片。
 */
export const onRequest = async ({ request, env, params }: Context): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
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

  const object = range
    ? await env.LEAN_ASSETS.get(asset.key, {
        range: { offset: range.start, length: range.end - range.start + 1 },
      })
    : await env.LEAN_ASSETS.get(asset.key);
  if (!object) return new Response('Runtime asset missing', { status: 404 });

  const length = range ? range.end - range.start + 1 : asset.bytes;
  const headers = new Headers({
    'Content-Type': asset.contentType,
    'Content-Length': String(length),
    'Accept-Ranges': 'bytes',
    'Cache-Control': CACHE_CONTROL,
    'Access-Control-Allow-Origin': '*',
  });
  if (range) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${asset.bytes}`);
  }
  // 暴露对象 ETag：上传脚本据此与本地 MD5 比对，确认远端对象未损坏。
  const etag = object.httpEtag ?? (object.etag ? `"${object.etag}"` : undefined);
  if (etag) headers.set('ETag', etag);

  return new Response(request.method === 'HEAD' ? null : object.body, {
    status: range ? 206 : 200,
    headers,
  });
};
