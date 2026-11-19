// 在 worker 线程里跑 wasm64 Lean，stdin 走共享环形缓冲（glue 已被 adapt-glue.ts 打过补丁）。
//
// 为什么不再用 Module.stdin 钩子：Emscripten 的 TTY 读循环会一直 get_char 到读满 length，
// 阻塞式钩子拿到半帧就卡死；fd_read 还会把 pthread 的读代理回主线程。
// 共享环形缓冲把 fd 0 直接接在 wasm 内部，主线程与 pthread 都能安全阻塞等待。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { walkLibrary } from './lib/lean-assets.ts';

export interface WorkerStdin {
  readonly buffer: SharedArrayBuffer;
  readonly capacity: number;
}

export interface LeanWorkerData {
  readonly leanMjs: string;
  readonly libDir: string;
  readonly files: Record<string, string>;
  readonly args: string[];
  readonly timezone: Uint8Array | null;
  readonly proxy: boolean;
  readonly stdin: WorkerStdin;
}

interface LeanModule {
  ENV?: Record<string, string>;
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: Uint8Array): void;
    chdir(path: string): void;
    getStream(fd: number): { stream_ops: Record<string, unknown> };
  };
  callMain(args: string[]): number;
}

const port = parentPort;
if (!port) throw new Error('wasm64-lsp-worker 必须在 worker 线程里运行');

const data = workerData as LeanWorkerData;
const debug = (...items: unknown[]): void => {
  if (process.env.LEAN_WASM_DIAG_DEBUG) port.postMessage({ debug: items.join(' ') });
};
debug('worker start', data.leanMjs);

const resolvedLeanMjs = resolve(data.leanMjs);
const moduleUrl = pathToFileURL(resolvedLeanMjs).href;
const { default: createLean } = (await import(moduleUrl)) as {
  default: (options: Record<string, unknown>) => Promise<LeanModule>;
};

const lean = await createLean({
  noInitialRun: true,
  // Emscripten 硬编码了 `new URL("lean-lsp.mjs", import.meta.url)`；不传 mainScriptUrlOrBlob
  // 时 Node 里的 48 个 pthread 会加载未适配的 lean-lsp.mjs，把 fd0 读代理回主 JS 线程并
  // 阻塞事件循环。必须显式指向适配后的路径（与浏览器 worker 一致）。
  mainScriptUrlOrBlob: resolvedLeanMjs,
  lspStdin: data.stdin,
  lspProcessExit: (code: number) => port.postMessage({ exit: code }),
  print: (text: string) => port.postMessage({ stderr: `${text}\n` }),
  printErr: (text: string) => port.postMessage({ stderr: `${text}\n` }),
});

lean.FS.mkdirTree('/lean/bin');
lean.FS.mkdirTree('/lean/lib/lean');
lean.FS.mkdirTree('/workspace');
lean.FS.mkdirTree('/etc');
// watchdogMain 解析 /etc/localtime，合成数据会被 forceExit，必须放真实 TZif。
if (data.timezone) lean.FS.writeFile('/etc/localtime', data.timezone);

for (const file of walkLibrary(data.libDir)) {
  const rel = file
    .slice(data.libDir.length + 1)
    .split('\\')
    .join('/');
  const target = `/lean/lib/lean/${rel}`;
  lean.FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
  lean.FS.writeFile(target, readFileSync(file));
}

for (const [path, text] of Object.entries(data.files)) {
  lean.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
  lean.FS.writeFile(path, new TextEncoder().encode(text));
}

// fd 1 是 LSP 协议通道，fd 2 转发 stderr（避免 pthread 写入在 proxy 模式下丢输出）。
const stderrDecoder = new TextDecoder();
for (const fd of [1, 2] as const) {
  const stream = lean.FS.getStream(fd);
  stream.stream_ops = {
    ...stream.stream_ops,
    write(_stream: unknown, buffer: Uint8Array, offset: number, length: number): number {
      const chunk = Uint8Array.from(buffer.subarray(offset, offset + length));
      if (fd === 1) {
        if (process.env.LEAN_WASM_DIAG_DEBUG) port.postMessage({ debug: `fd1 write ${length}` });
        port.postMessage({ stdout: chunk }, [chunk.buffer]);
      } else if (length > 0) {
        port.postMessage({ stderr: stderrDecoder.decode(chunk) });
      }
      return length;
    },
  };
}

if (lean.ENV) {
  for (const key of ['LEAN_WASM_TRACE', 'LEAN_STACK_SIZE_KB', 'LEAN_MAIN_USE_THREAD']) {
    const val = process.env[key];
    if (val !== undefined) lean.ENV[key] = val;
  }
}

lean.FS.chdir('/workspace');
port.postMessage({ ready: true });
debug('calling main', data.args.join(' '));

let code = 0;
try {
  code = lean.callMain(data.args);
} catch (error: unknown) {
  const exit = error as { name?: string; status?: number };
  if (exit && exit.name === 'ExitStatus' && typeof exit.status === 'number') code = exit.status;
  else port.postMessage({ failure: String((error as Error)?.stack ?? error) });
}
// PROXY_TO_PTHREAD 下 callMain 只负责派发，返回不代表进程结束；退出码统一走 lspProcessExit。
debug(data.proxy ? 'main dispatched (proxy mode)' : 'main returned', code);
