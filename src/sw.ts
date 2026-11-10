/**
 * Lean 运行时资产下载器（Service Worker）。
 *
 * Cloudflare Pages 不处理 Range 请求，所以 143MB 的 Lean 运行时改从固定 revision
 * 的 GitHub raw 拉取。GitHub raw 支持 Range 与 CORS：每个大文件切成 4MB 分片并行
 * 下载，按预期字节数校验后再作为一个同源响应交还给 Lean 加载器。
 *
 * 构建期由 `npm run build:sw` 编译为 public/sw.js，仓库里不保留手写 JS。
 */
const GITHUB_RAW =
  'https://raw.githubusercontent.com/seo-rii/wasm-llvm/14ea5ecbc514b0c87338aebf8f2b567020be5750/artifacts/lean-browser/';

type RangeAsset = {
  source: string;
  bytes: number;
};

const RANGE_ASSETS = new Map<string, RangeAsset>([
  ['lean.wasm.gz.bin', { source: 'lean.wasm.gz', bytes: 20239874 }],
  ['lean-init-00.pack.gz.bin', { source: 'lean-init-00.pack.gz', bytes: 22626621 }],
  ['lean-init-01.pack.gz.bin', { source: 'lean-init-01.pack.gz', bytes: 22633878 }],
  ['lean-init-02.pack.gz.bin', { source: 'lean-init-02.pack.gz', bytes: 23039094 }],
  ['lean-init-03.pack.gz.bin', { source: 'lean-init-03.pack.gz', bytes: 22382973 }],
  ['lean-init-04.pack.gz.bin', { source: 'lean-init-04.pack.gz', bytes: 21886461 }],
  ['lean-init-05.pack.gz.bin', { source: 'lean-init-05.pack.gz', bytes: 9812693 }],
]);

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

async function loadRangedAsset(request: Request, name: string, asset: RangeAsset): Promise<Response> {
  try {
    const remoteUrl = GITHUB_RAW + asset.source;
    const total = asset.bytes;
    const parts = await fetchRanges(remoteUrl, total, request.signal, name);
    const body = new Blob(parts, { type: 'application/octet-stream' });
    if (body.size !== total) {
      throw new Error(`assembled ${body.size} bytes, expected ${total}`);
    }

    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });

    // @wasm-idle/lsp 会校验 response.url === request.url。合成响应的 url 默认为空，
    // 这里固定回同源请求地址；若运行时不支持改写，则退回同源 Pages 全量请求。
    try {
      Object.defineProperty(response, 'url', { value: request.url });
      Object.defineProperty(response, 'redirected', { value: false });
      Object.defineProperty(response, 'type', { value: 'basic' });
    } catch {
      return fetch(request);
    }

    return response;
  } catch (error) {
    if (request.signal.aborted) throw error;
    notifyFallback(name, error);
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
): Promise<ArrayBuffer[]> {
  const ranges: Array<[number, number]> = [];
  for (let start = 0; start < total; start += CHUNK_BYTES) {
    ranges.push([start, Math.min(start + CHUNK_BYTES - 1, total - 1)]);
  }

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
      notify(name, loaded, total);
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

async function notify(name: string, loaded: number, total: number): Promise<void> {
  const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    (client as WindowClient).postMessage({ type: 'lean-asset-progress', name, loaded, total });
  }
}

async function notifyFallback(name: string, error: unknown): Promise<void> {
  const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const message = error instanceof Error ? error.message : String(error);
  for (const client of clients) {
    (client as WindowClient).postMessage({ type: 'lean-asset-fallback', name, message });
  }
}
