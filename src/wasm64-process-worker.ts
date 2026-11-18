/**
 * 实验性 wasm64：一个 Worker 承载一个 Lean 进程（--server 或 --worker）。
 * 在 Chrome 里直接由该 Worker 运行 PROXY_TO_PTHREAD 版 glue，pthread 由 Emscripten 自行派生。
 * 对应 spike/wasm64 的 scripts/wasm64-lsp-browser-worker.ts（已在 Chrome LSP 链路验证）。
 *
 * stdin 走 SharedArrayBuffer 环形缓冲（adapt-glue 已把 fd 0 改成读它）；
 * stdout 以 { stdout } 回传，真实退出码走 lspProcessExit。
 */

// V8 默认只保留 10 帧；wasm 爆栈需要完整调用环才能定位。
(Error as ErrorConstructor & { stackTraceLimit?: number }).stackTraceLimit = 200;

type FsApi = {
  mkdirTree: (path: string) => void;
  writeFile: (path: string, data: Uint8Array, options?: { canOwn?: boolean }) => void;
  chdir: (path: string) => void;
  getStream: (fd: number) => { stream_ops: Record<string, unknown> };
};

type LeanModule = {
  FS: FsApi;
  wasmMemory?: { readonly buffer: ArrayBufferLike };
  callMain: (args: string[]) => number;
};

type StartMessage = {
  readonly type: 'start';
  readonly glueUrl: string;
  readonly wasmModule: WebAssembly.Module;
  readonly library: Readonly<Record<string, Uint8Array>>;
  readonly stdin: { readonly buffer: SharedArrayBuffer; readonly capacity: number };
  readonly args: readonly string[];
};

type PollMessage = { readonly type: 'pollMemory' };

type PostScope = { postMessage: (message: unknown, transfer?: Transferable[]) => void };
const scope = self as unknown as PostScope;

// 最小的 UTC TZif 文件：Lean 的 IO 时间处理需要真实的 /etc/localtime。
const UTC_TZIF = Uint8Array.from([
  84, 90, 105, 102, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 85, 84, 67, 0, 84, 90, 105,
  102, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 85, 84, 67, 0, 10, 85, 84, 67, 48, 10,
]);

const LIBRARY_ROOT = '/lean/lib/lean';
const SAFE_LIBRARY_PATH = /^Init(\/[A-Za-z0-9_]+)*\.(olean(\.server|\.private)?|ilean)$/;

type PackIndex = {
  chunks: Array<{ path: string; offset: number; uncompressedBytes: number }>;
  files: Array<{ path: string; offset: number; bytes: number }>;
};

/** 把 pack 里的文件切回单个 olean；跨 chunk 的文件拼成连续副本。 */
const unpackLibrary = (
  library: Readonly<Record<string, Uint8Array>>,
): Array<{ path: string; bytes: Uint8Array }> => {
  const indexBytes = library['lean-init-64.index.json'];
  if (!indexBytes) throw new Error('wasm64 库索引缺失');
  const index = JSON.parse(new TextDecoder().decode(indexBytes)) as PackIndex;
  const chunks = index.chunks.map((chunk) => {
    const bytes = library[chunk.path.replace(/\.zst$/, '')];
    if (!bytes || bytes.byteLength !== chunk.uncompressedBytes) {
      throw new Error(`wasm64 库分片 ${chunk.path} 缺失或长度不符`);
    }
    return { ...chunk, bytes };
  });
  return index.files.map((file) => {
    if (!SAFE_LIBRARY_PATH.test(file.path)) throw new Error(`wasm64 库条目非法: ${file.path}`);
    const out = new Uint8Array(file.bytes);
    let written = 0;
    for (const chunk of chunks) {
      const start = Math.max(file.offset, chunk.offset);
      const end = Math.min(file.offset + file.bytes, chunk.offset + chunk.uncompressedBytes);
      if (start >= end) continue;
      out.set(chunk.bytes.subarray(start - chunk.offset, end - chunk.offset), written);
      written += end - start;
    }
    if (written !== file.bytes) throw new Error(`wasm64 库条目 ${file.path} 被截断`);
    return { path: file.path, bytes: out };
  });
};

const errorStack = (error: unknown): string => {
  const candidate = error as { stack?: unknown } | null;
  return typeof candidate?.stack === 'string' ? candidate.stack : String(error);
};

let activeLean: LeanModule | null = null;

// pthread 的未捕获异常会冒泡到本 Worker；回传后由监督器统一报错。
self.addEventListener('error', (event: ErrorEvent) => {
  event.preventDefault();
  scope.postMessage({ failure: errorStack(event.error ?? event.message) });
});

const start = async (data: StartMessage): Promise<void> => {
  const { default: createLean } = (await import(/* @vite-ignore */ data.glueUrl)) as {
    default: (options: Record<string, unknown>) => Promise<LeanModule>;
  };
  const lean = await createLean({
    noInitialRun: true,
    mainScriptUrlOrBlob: data.glueUrl,
    lspStdin: data.stdin,
    lspProcessExit: (code: number) => scope.postMessage({ exit: code }),
    onMemoryResize: (memoryBytes: number) => scope.postMessage({ memoryBytes }),
    instantiateWasm(
      imports: WebAssembly.Imports,
      receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ) {
      void WebAssembly.instantiate(data.wasmModule, imports).then(
        (instance) => receive(instance, data.wasmModule),
        (error: unknown) => scope.postMessage({ failure: errorStack(error) }),
      );
      return {};
    },
    locateFile: (name: string) => {
      throw new Error(`Unexpected unverified Lean file: ${name}`);
    },
    print: (text: string) => scope.postMessage({ stderr: `${text}\n` }),
    printErr: (text: string) => scope.postMessage({ stderr: `${text}\n` }),
  });
  activeLean = lean;

  for (const dir of ['/lean/bin', LIBRARY_ROOT, '/workspace', '/etc']) lean.FS.mkdirTree(dir);
  lean.FS.writeFile('/etc/localtime', UTC_TZIF);
  for (const file of unpackLibrary(data.library)) {
    const target = `${LIBRARY_ROOT}/${file.path}`;
    lean.FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
    lean.FS.writeFile(target, file.bytes, { canOwn: true });
  }

  const stderrDecoder = new TextDecoder();
  for (const fd of [1, 2] as const) {
    const stream = lean.FS.getStream(fd);
    stream.stream_ops = {
      ...stream.stream_ops,
      write(_stream: unknown, buffer: Uint8Array, offset: number, length: number): number {
        const chunk = Uint8Array.from(buffer.subarray(offset, offset + length));
        if (fd === 1) scope.postMessage({ stdout: chunk }, [chunk.buffer]);
        else if (length > 0) scope.postMessage({ stderr: stderrDecoder.decode(chunk) });
        return length;
      },
    };
  }

  lean.FS.chdir('/workspace');
  const initialMemoryBytes = lean.wasmMemory?.buffer.byteLength;
  scope.postMessage({
    ready: true,
    ...(typeof initialMemoryBytes === 'number' ? { memoryBytes: initialMemoryBytes } : {}),
  });

  // PROXY_TO_PTHREAD 下 callMain 只负责派发，返回不代表进程结束；真实退出码走 lspProcessExit。
  let code: number;
  try {
    code = lean.callMain([...data.args]);
  } catch (error: unknown) {
    const exit = error as { name?: string; status?: number };
    if (exit?.name === 'ExitStatus' && typeof exit.status === 'number') code = exit.status;
    else throw error;
  }
  if (code !== 0) scope.postMessage({ failure: `callMain 返回 ${code}` });
};

self.onmessage = (event: MessageEvent<StartMessage | PollMessage>) => {
  const data = event.data;
  if (data.type === 'pollMemory') {
    const memoryBytes = activeLean?.wasmMemory?.buffer.byteLength;
    if (typeof memoryBytes === 'number') scope.postMessage({ memoryBytes });
    return;
  }
  start(data).catch((error: unknown) => scope.postMessage({ failure: errorStack(error) }));
};
