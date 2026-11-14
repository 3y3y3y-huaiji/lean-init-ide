/**
 * 本地等价网关：给 browser E2E 提供与生产同语义的 /cdn 分片接口。
 *
 * - /cdn/<key> 从 public/wasm-lean4/<asset.name> 读取，支持 Range/206/416/HEAD/ETag；
 * - 其余路径按 dist 静态资源返回，未知路径回落到 index.html；
 * - 带上 COOP/COEP，保证 SharedArrayBuffer 与真实 Service Worker 可用。
 *
 * 仅供 CI 与本地验证，不参与生产部署。
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const assets = path.join(root, 'public', 'wasm-lean4');
const manifest = JSON.parse(readFileSync(path.join(root, 'config', 'lean4-runtime.json'), 'utf8'));
const port = Number(process.env.LEAN_GATEWAY_PORT ?? 4174);
const verbose = process.env.LEAN_GATEWAY_VERBOSE === '1';

const assetsByKey = new Map(manifest.assets.map((asset) => [asset.key, asset]));
const etagCache = new Map();

const etagOf = (file) => {
  if (!etagCache.has(file)) {
    etagCache.set(file, createHash('md5').update(readFileSync(file)).digest('hex'));
  }
  return etagCache.get(file);
};

const baseHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'X-Content-Type-Options': 'nosniff',
};

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};

/**
 * 读取 public/_headers 的 /* 段，让本地 e2e 也在生产同款 CSP / Referrer-Policy 下运行。
 * 只解析根段；其它路径的缓存头由网关自己决定。
 */
const readPageHeaders = () => {
  const file = path.join(root, 'public', '_headers');
  if (!existsSync(file)) return {};
  const headers = {};
  let inRoot = false;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      inRoot = line.trim() === '/*';
      continue;
    }
    if (!inRoot) continue;
    const separator = line.indexOf(':');
    if (separator > 0) {
      headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  return headers;
};
const pageHeaders = readPageHeaders();

const parseRange = (header, size) => {
  if (header === null) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid';
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return 'invalid';
  }
  return { start, end: Math.min(end, size - 1) };
};

const serveCdn = (request, response) => {
  const key = decodeURIComponent(
    new URL(request.url, 'http://localhost').pathname.slice('/cdn/'.length),
  );
  const asset = assetsByKey.get(key);
  if (!asset) {
    response.writeHead(404, { ...baseHeaders, 'Content-Type': 'text/plain' });
    response.end('Unknown runtime asset');
    return;
  }
  const file = path.join(assets, asset.name);
  if (!existsSync(file)) {
    response.writeHead(404, { ...baseHeaders, 'Content-Type': 'text/plain' });
    response.end('Local asset missing');
    return;
  }
  const size = statSync(file).size;
  const range = parseRange(request.headers.range ?? null, size);
  if (range === 'invalid') {
    response.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${size}` });
    response.end();
    return;
  }
  const length = range ? range.end - range.start + 1 : size;
  const headers = {
    ...baseHeaders,
    'Content-Type': asset.contentType,
    'Content-Length': String(length),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public,max-age=31536000,immutable',
    'Access-Control-Allow-Origin': '*',
    ETag: `"${etagOf(file)}"`,
  };
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
  response.writeHead(range ? 206 : 200, headers);
  if (verbose) {
    console.log(
      `[cdn] ${key} ${range ? `${range.start}-${range.end}` : 'full'} ${range ? 206 : 200}`,
    );
  }
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = range
    ? createReadStream(file, { start: range.start, end: range.end })
    : createReadStream(file);
  stream.pipe(response);
};

const serveStatic = (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  let file = path.join(dist, decodeURIComponent(pathname));
  if (!file.startsWith(dist)) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const candidate = path.join(dist, `${pathname.replace(/^\//, '')}.html`);
    file = existsSync(candidate) ? candidate : path.join(dist, 'index.html');
  }
  const headers = {
    ...pageHeaders,
    ...baseHeaders,
    'Content-Type': mime[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': file.endsWith('sw.js') ? 'no-cache' : 'no-cache',
    'Content-Length': String(statSync(file).size),
  };
  response.writeHead(200, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
};

const serveTelemetry = (request, response) => {
  if (request.method !== 'POST') {
    response.writeHead(405, { ...baseHeaders, Allow: 'POST', 'Content-Type': 'text/plain' });
    response.end('Method not allowed');
    return;
  }
  const contentType = request.headers['content-type'] ?? '';
  if (!String(contentType).includes('application/json')) {
    response.writeHead(415, { ...baseHeaders, 'Content-Type': 'text/plain' });
    response.end('Unsupported media type');
    return;
  }
  const chunks = [];
  let total = 0;
  let aborted = false;
  request.on('data', (chunk) => {
    if (aborted) return;
    total += chunk.length;
    if (total > 8192) {
      aborted = true;
      response.writeHead(413, { ...baseHeaders, 'Content-Type': 'text/plain' });
      response.end('Payload too large');
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (aborted) return;
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(payload?.events) || payload.events.length === 0) {
        response.writeHead(400, { ...baseHeaders, 'Content-Type': 'text/plain' });
        response.end('No valid events');
        return;
      }
      if (verbose) console.log(`[telemetry] ${payload.events.length} events`);
      response.writeHead(204, { ...baseHeaders, 'Cache-Control': 'no-store' });
      response.end();
    } catch {
      response.writeHead(400, { ...baseHeaders, 'Content-Type': 'text/plain' });
      response.end('Invalid JSON');
    }
  });
};

const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/__health') {
    response.writeHead(200, { ...baseHeaders, 'Content-Type': 'text/plain' });
    response.end('ok');
    return;
  }
  if (pathname === '/api/telemetry') {
    serveTelemetry(request, response);
    return;
  }
  if (pathname.startsWith('/cdn/')) {
    serveCdn(request, response);
    return;
  }
  serveStatic(request, response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`local gateway: http://127.0.0.1:${port} (assets: ${assetsByKey.size})`);
});
