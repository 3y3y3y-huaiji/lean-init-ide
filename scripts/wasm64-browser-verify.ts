/**
 * 在 runner 自带的 Google Chrome（Chrome 133+，memory64 默认开启）里启动 wasm64 Lean。
 *
 * 用法：tsx scripts/wasm64-browser-verify.ts <distDir>
 *
 * 不下载 Playwright 自带的浏览器：playwright-core + channel: 'chrome' 直接用系统 Chrome，
 * 省掉 `playwright install --with-deps` 的 apt 依赖与整包下载。
 * 页面逻辑放在 wasm64-browser-harness.ts，由 esbuild 打包成独立模块，避免函数序列化问题。
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const distDir = resolve(process.argv[2] ?? 'work/dist');

const MIME_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
};

const PAGE = '<!doctype html><meta charset="utf-8"><title>wasm64 lean probe</title><script type="module" src="/harness.mjs"></script>';

interface ProbeResult {
  ok: boolean;
  stage: string;
  code?: number;
  environment: Record<string, unknown>;
  log: string[];
  error?: Record<string, unknown>;
}

const send = (res: ServerResponse, status: number, headers: Record<string, string>, body?: string | Buffer): void => {
  res.writeHead(status, headers);
  res.end(body);
};

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // 跨源隔离是 SharedArrayBuffer（pthreads）可用的前提，与线上 _headers 保持一致。
  const headers = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  };
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    send(res, 200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }, PAGE);
    return;
  }
  if (url.pathname === '/favicon.ico') {
    send(res, 204, headers);
    return;
  }
  const filePath = resolve(distDir, `.${decodeURIComponent(url.pathname)}`);
  if (filePath !== distDir && !filePath.startsWith(distDir + sep)) {
    send(res, 403, headers);
    return;
  }
  try {
    const body = await readFile(filePath);
    const type = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
    send(res, 200, { ...headers, 'Content-Type': type }, body);
  } catch {
    // 404 的路径要打出来：pthread worker 或旁路资源缺失会直接表现为启动异常。
    console.log(`[404] ${url.pathname}`);
    send(res, 404, headers);
  }
});

await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (address === null || typeof address === 'string') throw new Error('无法获取本地服务端口');
const origin = `http://127.0.0.1:${address.port}`;
console.log(`serving ${distDir} at ${origin}`);

// channel: 'chrome' 使用系统 Chrome；headless 走新版无头模式。
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  page.on('console', (message) => console.log(`[page:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));
  await page.goto(origin, { waitUntil: 'load', timeout: 60_000 });

  console.log(`chrome: ${browser.version()}`);
  // 用字符串表达式轮询与取值，避免把 TS 编译后的函数序列化进页面。
  await page.waitForFunction('window.__probeResult !== undefined', undefined, { timeout: 900_000 });
  const result = (await page.evaluate('window.__probeResult')) as ProbeResult;

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}
