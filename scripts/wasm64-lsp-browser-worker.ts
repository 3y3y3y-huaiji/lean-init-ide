/**
 * Chrome Web Worker 内运行 wasm64 Lean LSP（--worker）。
 * 由 esbuild 打包为 work/dist/lsp-worker.mjs，供 wasm64-browser-harness.ts 启动。
 */

// V8 默认 Error.stackTraceLimit=10，wasm 爆栈只会留下最顶上 10 帧。
// depth 探针需要看 whnfCoreStep 下面的完整递归环，200 帧足够覆盖 1MB 栈。
Error.stackTraceLimit = 200;

interface StreamOps {
  write: (stream: unknown, buffer: Uint8Array, offset: number, length: number) => number;
}

interface EmscriptenStream {
  stream_ops: StreamOps;
}

interface LeanModule {
  FS: {
    mkdirTree: (path: string) => void;
    writeFile: (path: string, data: Uint8Array) => void;
    chdir: (path: string) => void;
    getStream: (fd: number) => EmscriptenStream;
  };
  ENV?: Record<string, string>;
  callMain: (args: string[]) => number;
}

interface WorkerStartMessage {
  readonly leanMjsUrl: string;
  readonly manifestUrl: string;
  readonly libBaseUrl: string;
  readonly stdin: { readonly buffer: SharedArrayBuffer; readonly capacity: number };
  readonly files: Readonly<Record<string, string>>;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly timezone: Uint8Array;
}

const CONCURRENCY = 16;

interface WorkerScope {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}

const workerSelf = self as unknown as WorkerScope;

// Chrome 会把 pthread 的未捕获错误再包一层 ErrorEvent；直接读 event.error.stack
// 只会得到 "Uncaught [object ErrorEvent]"。逐层剥到真正带 stack 的 Error。
const errorStack = (error: unknown): string | undefined => {
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const candidate = current as { stack?: unknown; error?: unknown };
    if (typeof candidate.stack === 'string') return candidate.stack;
    current = candidate.error;
  }
  return undefined;
};

// 捕获子 pthread 冒泡到 worker 全局的硬异常（如 RangeError: Maximum call stack size exceeded），
// 回传给 harness 记录完整调用栈，避免直接触发页面 pageerror 导致后续探针样本中断。
self.addEventListener('error', (event: ErrorEvent) => {
  event.preventDefault();
  const detail = errorStack(event.error) ?? event.message ?? 'worker error';
  workerSelf.postMessage({ failure: detail });
});

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`加载失败 ${url}: ${response.status}`);
  return (await response.json()) as T;
};

const fetchLibraryAssets = async (
  manifestUrl: string,
  libBaseUrl: string,
): Promise<Array<{ rel: string; bytes: Uint8Array }>> => {
  const files = await fetchJson<string[]>(manifestUrl);
  const results = new Array<{ rel: string; bytes: Uint8Array }>(files.length);
  let cursor = 0;
  const workerCount = Math.min(CONCURRENCY, Math.max(1, files.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const rel = files[index];
      if (!rel) continue;
      const response = await fetch(`${libBaseUrl}/${rel}`);
      if (!response.ok) throw new Error(`olean 加载失败 ${rel}: ${response.status}`);
      results[index] = { rel, bytes: new Uint8Array(await response.arrayBuffer()) };
    }
  });
  await Promise.all(workers);
  return results;
};

self.onmessage = async (event: MessageEvent<WorkerStartMessage>) => {
  const data = event.data;
  try {
    const leanMjsUrl = new URL(data.leanMjsUrl, self.location.href).href;
    const [{ default: createLean }, assets] = await Promise.all([
      import(/* @vite-ignore */ leanMjsUrl) as Promise<{
        default: (options: Record<string, unknown>) => Promise<LeanModule>;
      }>,
      fetchLibraryAssets(data.manifestUrl, data.libBaseUrl),
    ]);

    const lean = await createLean({
      noInitialRun: true,
      mainScriptUrlOrBlob: leanMjsUrl,
      locateFile: (name: string) => new URL(`/${name}`, self.location.href).href,
      lspStdin: data.stdin,
      lspProcessExit: (code: number) => workerSelf.postMessage({ exit: code }),
      print: (text: string) => workerSelf.postMessage({ stderr: `${text}\n` }),
      printErr: (text: string) => workerSelf.postMessage({ stderr: `${text}\n` }),
    });

    lean.FS.mkdirTree('/lean/bin');
    lean.FS.mkdirTree('/lean/lib/lean');
    lean.FS.mkdirTree('/workspace');
    lean.FS.mkdirTree('/etc');
    lean.FS.writeFile('/etc/localtime', data.timezone);

    for (const asset of assets) {
      const target = `/lean/lib/lean/${asset.rel}`;
      lean.FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
      lean.FS.writeFile(target, asset.bytes);
    }

    const encoder = new TextEncoder();
    for (const [path, text] of Object.entries(data.files)) {
      lean.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
      lean.FS.writeFile(path, encoder.encode(text));
    }

    const stderrDecoder = new TextDecoder();
    for (const fd of [1, 2] as const) {
      const stream = lean.FS.getStream(fd);
      stream.stream_ops = {
        ...stream.stream_ops,
        write(_stream: unknown, buffer: Uint8Array, offset: number, length: number): number {
          const chunk = Uint8Array.from(buffer.subarray(offset, offset + length));
          if (fd === 1) {
            workerSelf.postMessage({ stdout: chunk }, [chunk.buffer]);
          } else if (length > 0) {
            workerSelf.postMessage({ stderr: stderrDecoder.decode(chunk) });
          }
          return length;
        },
      };
    }

    if (lean.ENV && data.env) {
      for (const [key, value] of Object.entries(data.env)) {
        lean.ENV[key] = value;
      }
    }

    lean.FS.chdir('/workspace');
    workerSelf.postMessage({ ready: true, assets: assets.length });

    let code = 0;
    try {
      code = lean.callMain([...data.args]);
    } catch (error: unknown) {
      const exit = error as { name?: string; status?: number };
      if (exit && exit.name === 'ExitStatus' && typeof exit.status === 'number') {
        code = exit.status;
      } else {
        workerSelf.postMessage({ failure: errorStack(error) ?? String(error) });
        return;
      }
    }
    // PROXY_TO_PTHREAD 下 callMain 只负责派发，返回不代表进程结束；真实退出码统一走
    // lspProcessExit。若在这里发 exit:0，宿主会把它当成「进程已死」，
    // 把还在代理队列里的 publishDiagnostics 一起判死。
    if (code !== 0) workerSelf.postMessage({ failure: `callMain 返回 ${code}` });
  } catch (error: unknown) {
    workerSelf.postMessage({ failure: errorStack(error) ?? String(error) });
  }
};
