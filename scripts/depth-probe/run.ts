/**
 * 在目标 Chrome 的 Dedicated Worker 里测各配置的深递归上界。
 *
 * 用法:
 *   node scripts/depth-probe/run.ts --out work/depth-probe \
 *     --variants baseline,jspi,tailcall,asyncify,jspi-yield
 *   可选 --chrome <路径>（默认走系统 Chrome）、--js-flags <V8 flags>。
 *
 * 只加载 scripts/depth-probe/ 与构建目录，不碰 Lean 运行时。
 */
import { createServer, type ServerResponse } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type LaunchOptions } from 'playwright-core';
import { expectPositionals, optionalString, parseArgs, requireNumber, runCli } from '../lib/cli.ts';
import { isMainModule } from '../lib/entry.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.cpp': 'text/plain; charset=utf-8',
};

interface ProbeRow {
  readonly name: string;
  readonly status: string;
  readonly maxDepth?: number;
  readonly firstFail?: number;
  readonly capped?: boolean;
  readonly stats?: { readonly calls: number; readonly pending: number } | null;
  readonly samples?: readonly { n: number; ok: boolean; error: string | null }[];
  readonly error?: string;
}

interface ProbePayload {
  readonly done?: boolean;
  readonly fatal?: string;
  readonly features?: {
    readonly userAgent: string;
    readonly jspi: { readonly suspending: boolean; readonly promising: boolean };
    readonly memory64: boolean;
  };
  readonly results?: readonly ProbeRow[];
}

const send = (res: ServerResponse, status: number, type: string, body: string | Buffer) => {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  });
  res.end(body);
};

const createStaticServer = (outDir: string) => {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    let root = SCRIPT_DIR;
    let filePath = join(SCRIPT_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (pathname.startsWith('/out/')) {
      root = outDir;
      filePath = join(outDir, pathname.slice('/out/'.length));
    }
    if (!resolve(filePath).startsWith(`${resolve(root)}${sep}`)) {
      send(res, 403, 'text/plain; charset=utf-8', 'forbidden');
      return;
    }
    try {
      const body = await readFile(filePath);
      send(res, 200, MIME[extname(filePath)] ?? 'application/octet-stream', body);
    } catch {
      process.stderr.write(`[404] ${filePath}\n`);
      send(res, 404, 'text/plain; charset=utf-8', 'not found');
    }
  });
};

const formatRow = (row: ProbeRow): string => {
  if (row.samples) {
    const samples = row.samples.map((s) => `${s.n}:${s.ok ? 'ok' : 'fail'}`).join(' ');
    return `${row.name.padEnd(18)} ${samples}`;
  }
  const depth = row.capped ? `>=${row.maxDepth}` : `${row.maxDepth}`;
  const error = row.error ? `  ${row.error.split('\n')[0]}` : '';
  const stats = row.stats ? `  suspend=${row.stats.pending}/${row.stats.calls}` : '';
  return `${row.name.padEnd(18)} maxDepth=${depth}${stats}${error}`;
};

const main = async (): Promise<void> => {
  const parsed = parseArgs(process.argv.slice(2), {
    out: { kind: 'string', valueName: 'dir' },
    variants: { kind: 'string', valueName: 'list' },
    chrome: { kind: 'string', valueName: 'path' },
    'js-flags': { kind: 'string', valueName: 'flags' },
    timeout: { kind: 'number', valueName: 'ms' },
  });
  expectPositionals(parsed, 0, 'node scripts/depth-probe/run.ts [--out dir]');
  const outDir = resolve(optionalString(parsed, 'out') ?? join(REPO_ROOT, 'work/depth-probe'));
  const variants =
    optionalString(parsed, 'variants') ??
    'baseline,jspi,tailcall,asyncify,jspi-yield,jspi-resolved,jspi-pending,heapstack';
  const chromePath = optionalString(parsed, 'chrome');
  const jsFlags = optionalString(parsed, 'js-flags');
  const timeout = parsed.flags.timeout === undefined ? 600_000 : requireNumber(parsed, 'timeout');

  const server = createStaticServer(outDir);
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('静态服务器没有拿到端口');
  const url = `http://127.0.0.1:${address.port}/?variants=${encodeURIComponent(variants)}`;

  const args = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--enable-experimental-webassembly-features',
  ];
  if (jsFlags) args.push(`--js-flags=${jsFlags}`);
  const launchOptions: LaunchOptions = { headless: true, args };
  if (chromePath) launchOptions.executablePath = chromePath;
  else launchOptions.channel = 'chrome';

  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') process.stderr.write(`[page] ${message.text()}\n`);
    });
    page.on('pageerror', (error) => process.stderr.write(`[pageerror] ${error.message}\n`));

    await page.goto(url, { waitUntil: 'load', timeout });
    const handle = await page.waitForFunction(
      () => Reflect.get(globalThis, '__depthResults') ?? null,
      undefined,
      { timeout },
    );
    const payload = (await handle.jsonValue()) as ProbePayload;
    if (payload.fatal) throw new Error(`worker 崩溃: ${payload.fatal}`);

    const rows = payload.results ?? [];
    for (const row of rows) process.stdout.write(`${formatRow(row)}\n`);
    const report = {
      generatedAt: new Date().toISOString(),
      variants,
      jsFlags: jsFlags ?? null,
      features: payload.features ?? null,
      results: rows,
    };
    const reportPath = join(outDir, 'browser-results.json');
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`结果: ${reportPath}\n`);
  } finally {
    await browser.close();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
