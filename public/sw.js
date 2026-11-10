/**
 * Cloudflare Pages ignores Range requests for static assets, so the 143 MB Lean
 * runtime is fetched from the pinned GitHub raw artifacts instead. GitHub raw
 * supports Range and CORS; each large asset is split into 4 MB ranges fetched
 * in parallel, then returned as one same-origin response to the Lean loader.
 *
 * If GitHub is unreachable, fall back to the same-origin Pages copy.
 */
const GITHUB_RAW =
  'https://raw.githubusercontent.com/seo-rii/wasm-llvm/14ea5ecbc514b0c87338aebf8f2b567020be5750/artifacts/lean-browser/';

const RANGE_ASSETS = new Map([
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
const RETRIES = 2;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/wasm-lean4/')) return;

  const name = url.pathname.slice('/wasm-lean4/'.length);
  const asset = RANGE_ASSETS.get(name);
  if (!asset) return;

  event.respondWith(loadRangedAsset(request, name, asset));
});

async function loadRangedAsset(request, name, asset) {
  try {
    const remoteUrl = GITHUB_RAW + asset.source;
    const total = await contentLength(remoteUrl, request.signal, asset.bytes);
    const parts = await fetchRanges(remoteUrl, total, request.signal, name);
    const body = new Blob(parts, { type: 'application/octet-stream' });
    if (body.size !== asset.bytes) {
      throw new Error(`assembled ${body.size} bytes, expected ${asset.bytes}`);
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

    // @wasm-idle/lsp verifies response.url === request.url. Synthetic responses
    // normally have an empty url, so pin it to the same-origin request.
    try {
      Object.defineProperty(response, 'url', { value: request.url });
      Object.defineProperty(response, 'redirected', { value: false });
      Object.defineProperty(response, 'type', { value: 'basic' });
    } catch {
      // If the runtime disallows the override, the fallback is a full local fetch.
      return fetch(request);
    }

    return response;
  } catch (error) {
    if (request.signal.aborted) throw error;
    notifyFallback(name, error);
    return fetch(request);
  }
}

async function contentLength(url, signal, expected) {
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const head = await fetch(url, { method: 'HEAD', signal, cache: 'no-store' });
      const length = Number(head.headers.get('content-length'));
      if (head.ok && length === expected) return length;
      lastError = new Error(`HEAD returned ${head.status}, ${length || 'unknown'} bytes`);
    } catch (error) {
      lastError = error;
      if (signal.aborted) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw lastError;
}

async function fetchRanges(url, total, signal, name) {
  const ranges = [];
  for (let start = 0; start < total; start += CHUNK_BYTES) {
    ranges.push([start, Math.min(start + CHUNK_BYTES - 1, total - 1)]);
  }

  const parts = new Array(ranges.length);
  let next = 0;
  let loaded = 0;

  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= ranges.length) return;

      const [start, end] = ranges[index];
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

async function fetchRange(url, start, end, signal) {
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
        cache: 'no-store',
      });
      if (response.status !== 206) {
        throw new Error(`unexpected HTTP ${response.status}`);
      }
      return await response.arrayBuffer();
    } catch (error) {
      lastError = error;
      if (signal.aborted) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function notify(name, loaded, total) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'lean-asset-progress', name, loaded, total });
  }
}

async function notifyFallback(name, error) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const message = error instanceof Error ? error.message : String(error);
  for (const client of clients) {
    client.postMessage({ type: 'lean-asset-fallback', name, message });
  }
}
