// 在 Node 里给 wasm64 Lean 做一次 LSP 握手。
// 用法: node scripts/wasm64-lsp-handshake.ts <lean.mjs> <libDir>
// 只走 stderr 输出诊断，stdout 交给 Content-Length 帧。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expectPositionals, parseArgs, runCli } from './lib/cli.ts';
import { isMainModule } from './lib/entry.ts';
import { encodeFrame } from './lib/frames.ts';
import { requireDir, requireFile } from './lib/fs-guards.ts';
import { isLibraryAsset } from './lib/lean-assets.ts';

interface LeanModule {
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: Uint8Array): void;
    chdir(path: string): void;
    getStream(fd: number): { stream_ops: Record<string, unknown> };
  };
  callMain(args: string[]): number;
}

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (isLibraryAsset(entry.name)) out.push(path);
  }
  return out;
};

const main = async (): Promise<void> => {
  const parsed = parseArgs(process.argv.slice(2), {});
  const [leanPath, libPath] = expectPositionals(
    parsed,
    2,
    'node scripts/wasm64-lsp-handshake.ts <lean.mjs> <libDir>',
  );
  const leanMjs = requireFile(leanPath ?? '', 'lean.mjs');
  const libDir = requireDir(libPath ?? '', 'libDir');

  const { default: createLean } = (await import(pathToFileURL(leanMjs).href)) as {
    default: (options: Record<string, unknown>) => Promise<LeanModule>;
  };

  const request = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { processId: null, rootUri: 'file:///workspace', capabilities: {} },
  });
  const framed = encodeFrame(JSON.parse(request) as unknown);
  let pos = 0;
  // Emscripten 的 stdin 钩子逐字节返回字符码，EOF 返回 null。
  const nextByte = (): number | null => (pos < framed.length ? (framed[pos++] ?? null) : null);

  let captured = Buffer.alloc(0);
  const lean = await createLean({
    noInitialRun: true,
    stdin: nextByte,
    print: (line: string) => {
      captured = Buffer.concat([captured, Buffer.from(`${line}\n`, 'utf8')]);
    },
    printErr: (line: string) => process.stderr.write(`[stderr] ${line}\n`),
  });

  lean.FS.mkdirTree('/lean/bin');
  lean.FS.mkdirTree('/lean/lib/lean');
  lean.FS.mkdirTree('/workspace');

  for (const file of walk(libDir)) {
    const rel = file
      .slice(libDir.length + 1)
      .split('\\')
      .join('/');
    const target = `/lean/lib/lean/${rel}`;
    lean.FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
    lean.FS.writeFile(target, readFileSync(file));
  }

  // fd 1 是 LSP 协议通道，必须原样捕获。
  const fd1 = lean.FS.getStream(1);
  fd1.stream_ops = {
    ...fd1.stream_ops,
    write(_stream: unknown, buffer: Uint8Array, offset: number, length: number): number {
      captured = Buffer.concat([captured, Buffer.from(buffer.subarray(offset, offset + length))]);
      return length;
    },
  };

  lean.FS.chdir('/workspace');

  const exit = (async (): Promise<number> => {
    try {
      const code = lean.callMain(['-j2', '--server']);
      return typeof code === 'number' ? code : 0;
    } catch (error: unknown) {
      const status = error as { name?: string; status?: number };
      if (status.name === 'ExitStatus' && typeof status.status === 'number') return status.status;
      throw error;
    }
  })();

  const timeout = new Promise<'timeout'>((resolveTimeout) =>
    setTimeout(() => resolveTimeout('timeout'), 180_000),
  );
  const outcome = await Promise.race([exit, timeout]);
  const text = captured.toString('utf8');
  process.stderr.write(`[handshake] outcome=${String(outcome)} bytes=${captured.length}\n`);
  process.stdout.write(text.slice(0, 4000));
  if (!text.includes('"capabilities"')) {
    process.stderr.write('[handshake] no capabilities in response\n');
    process.exitCode = 1;
    return;
  }
  process.stderr.write('[handshake] ok\n');
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
