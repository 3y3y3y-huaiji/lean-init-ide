/**
 * 在无头 Chromium 里启动 wasm64 Lean，验证真实浏览器环境中的 memory64 + pthreads。
 *
 * 用法：npx tsx scripts/wasm64-browser-verify.ts <distDir>
 *
 * 只使用 Emscripten 公开运行时 API（FS / callMain），不直接读写 wasm 指针；
 * 指针宽度相关的行为全部交给 Emscripten 胶水层，避免手写 32/64 位偏移。
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const distDir = resolve(process.argv[2] ?? 'work/dist');

const MIME_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
};

const PAGE = '<!doctype html><meta charset="utf-8"><title>wasm64 lean probe</title><body>probe</body>';

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
    send(res, 404, headers);
  }
});

await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (address === null || typeof address === 'string') throw new Error('无法获取本地服务端口');
const origin = `http://127.0.0.1:${address.port}`;
console.log(`serving ${distDir} at ${origin}`);

const browser = await chromium.launch({
  headless: true,
  // memory64 在 Chrome 133+ 默认开启；不再传旧的 V8 实验开关（新版会当成非法参数）。
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  page.on('console', (message) => console.log(`[page:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));
  await page.goto(origin, { waitUntil: 'load', timeout: 60_000 });

  const result = (await page.evaluate(async () => {
    const log: string[] = [];
    const probeMemory = (descriptor: Record<string, unknown>): string => {
      try {
        new WebAssembly.Memory(descriptor as unknown as WebAssembly.MemoryDescriptor);
        return 'ok';
      } catch (error) {
        const failure = error as Error;
        return `${failure?.name}: ${failure?.message}`;
      }
    };
    const describe = (error: unknown): Record<string, unknown> => {
      const candidate = error as { name?: string; message?: string; stack?: string; constructor?: { name?: string } };
      const info: Record<string, unknown> = {
        ctor: candidate?.constructor?.name,
        name: candidate?.name,
        message: candidate?.message,
        stack: candidate?.stack,
      };
      if (typeof WebAssembly !== 'undefined' && error instanceof WebAssembly.Exception) {
        info.isWasmException = true;
        try {
          info.arg0 = error.getArg(error.tag, 0);
        } catch {
          // tag 未导出时无法解码，忽略。
        }
      }
      return info;
    };

    const environment = {
      browser: navigator.userAgent,
      sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
      // memory64 与 shared memory64（pthreads 前提）分开探测，失败原因才能定位。
      memory64: probeMemory({ initial: 1, index: 'i64' }),
      memory64Shared: probeMemory({ initial: 1, maximum: 4096, shared: true, index: 'i64' }),
    };
    log.push(`env ${JSON.stringify(environment)}`);

    try {
      const module = (await import('/lean.mjs')) as unknown as {
        default?: (options: Record<string, unknown>) => Promise<{ callMain: (args: string[]) => number }>;
        createLean?: (options: Record<string, unknown>) => Promise<{ callMain: (args: string[]) => number }>;
      };
      const createLean = module.default ?? module.createLean;
      if (typeof createLean !== 'function') throw new Error('lean.mjs 未导出 createLean');
      const lean = await createLean({
        noInitialRun: true,
        print: (line: string) => log.push(`OUT ${line}`),
        printErr: (line: string) => log.push(`ERR ${line}`),
      });
      log.push('createLean ok');
      const code = lean.callMain(['--version']);
      log.push(`callMain code=${code}`);
      return { ok: code === 0, stage: 'callMain', code, environment, log };
    } catch (error) {
      return { ok: false, stage: 'exception', error: describe(error), environment, log };
    }
  })) as ProbeResult;

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}
