/**
 * Lean 运行时资产下载器（Service Worker）。
 *
 * Cloudflare Pages 的静态资源不处理 Range，所以 143MB 的 Lean 运行时优先从
 * 站点同源的 /cdn/ 网关（Pages Function → R2 binding）分片并行下载；网关失败时
 * 回退到固定 revision 的 GitHub raw，最后才回退到同源全量请求。每个大文件切成
 * 4MB 分片，按预期字节数校验后合成一个同源响应交还给 Lean 加载器。
 *
 * 资产清单与分发源来自 config/lean4-runtime.json + src/asset-sources.mjs，
 * 与 Pages Functions、构建脚本 scripts/fetch-assets.mjs 共用同一份定义。
 *
 * 构建期由 `npm run build:sw` 编译为 public/sw.js，仓库里不保留手写 JS。
 */
import manifestJson from '../config/lean4-runtime.json';
import { assetSources, rangedAssets, type AssetSource, type RuntimeManifest } from './asset-sources.mjs';
import { buildRanges } from './sw-ranges';

const manifest = manifestJson as unknown as RuntimeManifest;

type RangeAsset = {
  bytes: number;
  sources: AssetSource[];
};

const RANGE_ASSETS = new Map<string, RangeAsset>(
  rangedAssets(manifest).map((asset) => [
    asset.name,
    { bytes: asset.bytes, sources: assetSources(manifest, asset) },
  ]),
);

const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_PARALLEL = 6;
const RETRIES = 3;
const CHUNK_TIMEOUT_MS = 45_000;

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => {
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;
  if (!url.pathname.startsWith('/wasm-lean4/')) return;

  const name = url.pathname.slice('/wasm-lean4/'.length);
  const asset = RANGE_ASSETS.get(name);
  if (!asset) return;

  event.respondWith(loadRangedAsset(request, name, asset));
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function loadRangedAsset(request: Request, name: string, asset: RangeAsset): Promise<Response> {
  let lastError: unknown;

  for (const source of asset.sources) {
    try {
      // 主源是同源相对路径；显式补上 origin，避免 SW 里相对 URL 的解析差异。
      const remoteUrl = source.url.startsWith('/')
        ? new URL(source.url, sw.location.origin).href
        : source.url;
      const parts = await fetchRanges(remoteUrl, asset.bytes, request.signal, name, source.label);
      const body = new Blob(parts, { type: 'application/octet-stream' });
      if (body.size !== asset.bytes) {
        throw new Error(`assembled ${body.size} bytes, expected ${asset.bytes}`);
      }
      return await assembleResponse(request, body);
    } catch (error) {
      if (request.signal.aborted) throw error;
      lastError = error;
      notifyFallback(name, `${source.label} 不可用：${errorMessage(error)}`);
    }
  }

  notifyFallback(name, `远端源均失败，回退同源：${errorMessage(lastError)}`);
  return fetch(request);
}

/** @wasm-idle/lsp 会校验 response.url === request.url，合成响应需要固定回同源地址。 */
async function assembleResponse(request: Request, body: Blob): Promise<Response> {
  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.size),
      'Accept-Ranges': 'bytes',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });

  try {
    Object.defineProperty(response, 'url', { value: request.url });
    Object.defineProperty(response, 'redirected', { value: false });
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  } catch {
    return fetch(request);
  }
}

/**
 * 并行下载所有分片并按顺序返回。分片数量直接来自固定的字节数，因此不需要额外的
 * HEAD 往返；数据不匹配会由这里的总长度校验和运行时的 SHA-256 校验兜住。
 */
async function fetchRanges(
  url: string,
  total: number,
  signal: AbortSignal,
  name: string,
  sourceLabel: string,
): Promise<ArrayBuffer[]> {
  const ranges = buildRanges(total, CHUNK_BYTES);

  const parts: ArrayBuffer[] = new Array(ranges.length);
  let next = 0;
  let loaded = 0;

  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= ranges.length) return;

      const [start, end] = ranges[index]!;
      const part = await fetchRange(url, start, end, signal);
      parts[index] = part;
      loaded += part.byteLength;
      notify(name, loaded, total, sourceLabel);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MAX_PARALLEL, ranges.length) }, () => worker()),
  );
  return parts;
}

async function fetchRange(url: string, start: number, end: number, signal: AbortSignal): Promise<ArrayBuffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      // 单个分片超过 45s 没响应就重试，避免整次下载被一个挂起的请求卡死。
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(CHUNK_TIMEOUT_MS)]),
        cache: 'no-store',
      });
      if (response.status !== 206) {
        throw new Error(`unexpected HTTP ${response.status}`);
      }
      const bytes = await response.arrayBuffer();
      const expected = end - start + 1;
      if (bytes.byteLength !== expected) {
        throw new Error(`range ${start}-${end} returned ${bytes.byteLength} bytes`);
      }
      return bytes;
    } catch (error) {
      lastError = error;
      if (signal.aborted) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function notify(name: string, loaded: number, total: number, source: string): Promise<void> {
  const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    (client as WindowClient).postMessage({ type: 'lean-asset-progress', name, loaded, total, source });
  }
}

function notifyFallback(name: string, message: string): void {
  void (async () => {
    const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      (client as WindowClient).postMessage({ type: 'lean-asset-fallback', name, message });
    }
  })();
}
