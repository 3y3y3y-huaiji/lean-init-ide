/**
 * 页面内探针：在真实 Chromium 中加载 wasm64 Lean 产物并执行 --version / compile / LSP (--worker)。
 *
 * 由 esbuild 单独打包成 ESM 模块给页面加载，不经过 page.evaluate 的函数序列化，
 * 否则 tsx/esbuild 注入的 __name helper 在页面里不存在。
 * 只调用 Emscripten 公开 API（callMain），不直接读写 wasm 指针。
 */
import { FrameDecoder, RING_CONTROL_BYTES, RingWriter, encodeFrame } from './lib/frames.ts';

interface EmscriptenFS {
  mkdirTree(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
}

interface LeanInstance {
  FS: EmscriptenFS;
  callMain(args: string[]): number;
  getExceptionMessage?: (error: unknown) => unknown;
}

type LeanFactory = (options: Record<string, unknown>) => Promise<LeanInstance>;

interface EnvironmentReport {
  browser: string;
  sharedArrayBuffer: boolean;
  memory64: string;
  memory64Shared: string;
}

interface ProbeReport {
  ok: boolean;
  stage: string;
  code?: number;
  oleanCount?: number;
  environment: EnvironmentReport;
  log: string[];
  error?: Record<string, unknown>;
}

declare global {
  interface Window {
    __probeResult?: ProbeReport;
  }
}

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

const describe = (error: unknown, instance?: LeanInstance): Record<string, unknown> => {
  const candidate = error as {
    name?: string;
    message?: string;
    stack?: string;
    constructor?: { name?: string };
  };
  const info: Record<string, unknown> = {
    ctor: candidate?.constructor?.name,
    name: candidate?.name,
    message: candidate?.message,
    stack: candidate?.stack,
  };
  if (typeof WebAssembly !== 'undefined' && error instanceof WebAssembly.Exception) {
    info.isWasmException = true;
    try {
      const exception = error as WebAssembly.Exception & { readonly tag: WebAssembly.Tag };
      info.arg0 = exception.getArg(exception.tag, 0);
    } catch {
      // tag 未导出时无法解码，忽略。
    }
    // EXCEPTION_STACK_TRACES=1 时 Emscripten 能解出 C++ 异常类型、消息与调用栈。
    if (typeof instance?.getExceptionMessage === 'function') {
      try {
        info.decoded = instance.getExceptionMessage(error);
      } catch (decodeError) {
        info.decodeFailure = String(decodeError);
      }
    }
  }
  return info;
};

const readEnvironment = (): EnvironmentReport => ({
  browser: navigator.userAgent,
  sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
  // memory64 与 shared memory64（pthreads 前提）分开探测，失败原因才能定位。
  memory64: probeMemory({ initial: 1, index: 'i64' }),
  memory64Shared: probeMemory({ initial: 1, maximum: 4096, shared: true, index: 'i64' }),
});

const finish = (value: ProbeReport): void => {
  log.push(
    `result ok=${String(value.ok)} stage=${value.stage}${value.code === undefined ? '' : ` code=${value.code}`}`,
  );
  window.__probeResult = value;
};

const DEFAULT_GOOD_BODY = 'example : 1 + 1 = 2 := rfl\n';
const DEFAULT_BAD_BODY = 'example : 1 + 1 = 3 := rfl\n';
const RING_BYTES = 8 * 1024 * 1024 + 8192;
const FETCH_CONCURRENCY = 16;

const FALLBACK_TZIF = Uint8Array.from([
  84, 90, 105, 102, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 85, 84, 67, 0, 84, 90, 105,
  102, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 85, 84, 67, 0, 10, 85, 84, 67, 48, 10,
]);

interface QueryConfig {
  readonly mode: string;
  readonly manifestUrl: string;
  readonly moduleName?: string;
  readonly goodCode?: string;
}

const readQueryConfig = (): QueryConfig => {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') ?? 'auto';
  const manifestUrl = params.get('manifest') ?? '/olean-manifest.json';
  const moduleName = params.get('module') ?? undefined;
  const goodCode = params.get('good') ?? undefined;
  return {
    mode,
    manifestUrl,
    ...(moduleName ? { moduleName } : {}),
    ...(goodCode ? { goodCode } : {}),
  };
};

const buildSource = (moduleName: string | undefined, body: string): string => {
  const importLine = moduleName ? `import ${moduleName}\n` : '';
  const normalized = body.endsWith('\n') ? body : `${body}\n`;
  return `${importLine}${normalized}`;
};

const fetchAssetsConcurrent = async (
  files: readonly string[],
): Promise<Array<{ rel: string; bytes: Uint8Array }>> => {
  const out = new Array<{ rel: string; bytes: Uint8Array }>(files.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(FETCH_CONCURRENCY, Math.max(1, files.length)) },
    async () => {
      while (cursor < files.length) {
        const idx = cursor;
        cursor += 1;
        const rel = files[idx];
        if (!rel) continue;
        const response = await fetch(`/lean-lib/${rel}`);
        if (!response.ok) throw new Error(`olean 加载失败 ${rel}: ${response.status}`);
        out[idx] = { rel, bytes: new Uint8Array(await response.arrayBuffer()) };
      }
    },
  );
  await Promise.all(workers);
  return out;
};

/**
 * 把自建的 64 位 Init (+ 可选 Mathlib) oleans 读进 MEMFS 的 /lean/lib/lean。
 * 清单由 CI 生成；没有清单时返回空数组，退化为 --version 冒烟。
 */
const mountOleans = async (lean: LeanInstance, config: QueryConfig): Promise<string[]> => {
  // Lean 启动时会解析 libdir，即使不导入任何模块也要有 /lean/lib/lean。
  lean.FS.mkdirTree('/lean/bin');
  lean.FS.mkdirTree('/lean/lib/lean');
  lean.FS.mkdirTree('/src');
  const manifestResponse = await fetch(config.manifestUrl);
  if (!manifestResponse.ok) {
    log.push(`olean manifest 缺失 (${config.manifestUrl})，跳过 olean 阶段`);
    return [];
  }
  const files = (await manifestResponse.json()) as string[];
  const loaded = await fetchAssetsConcurrent(files);
  for (const { rel, bytes } of loaded) {
    const target = `/lean/lib/lean/${rel}`;
    const parent = target.slice(0, target.lastIndexOf('/'));
    if (parent) lean.FS.mkdirTree(parent);
    lean.FS.writeFile(target, bytes);
  }
  lean.FS.mkdirTree('/lean/bin');
  lean.FS.mkdirTree('/src');
  const probeSource = buildSource(
    config.moduleName ?? 'Init',
    config.goodCode ?? DEFAULT_GOOD_BODY,
  );
  lean.FS.writeFile('/src/Probe.lean', new TextEncoder().encode(probeSource));
  // 自检：确认关键文件确实落在 MEMFS 的预期路径上。
  const fsAny = lean.FS as unknown as {
    analyzePath(path: string): { exists: boolean; object?: { contents?: Uint8Array } };
    readFile(path: string): Uint8Array;
  };
  for (const probe of ['/lean/lib/lean/Init.olean', '/lean/lib/lean/Init.olean.server']) {
    try {
      const info = fsAny.analyzePath(probe);
      const size = info.object?.contents?.length ?? -1;
      log.push(`fs check ${probe} exists=${info.exists} size=${size}`);
      if (info.exists) log.push(`fs read ${probe} bytes=${fsAny.readFile(probe).length}`);
    } catch (error) {
      log.push(`fs check ${probe} threw ${String(error)}`);
    }
  }
  return files;
};

interface LspDiagnostic {
  readonly range?: { readonly start?: { readonly line?: number; readonly character?: number } };
  readonly severity?: number;
  readonly message?: string;
}

interface LspMessage {
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
}

const initializeParams = {
  processId: null,
  rootUri: 'file:///workspace',
  workspaceFolders: null,
  capabilities: { textDocument: { publishDiagnostics: {}, synchronization: {} } },
};

const runLspDoc = async (
  name: string,
  text: string,
  waitUntilFinal: boolean,
  config: QueryConfig,
  nudgeLine: number,
): Promise<{ diagnostics: LspDiagnostic[]; elapsedMs: number }> => {
  const startedAt = performance.now();
  const uri = `file:///workspace/${name}`;
  const ringBuffer = new SharedArrayBuffer(RING_CONTROL_BYTES + RING_BYTES);
  const writer = new RingWriter(ringBuffer, RING_BYTES);
  const decoder = new FrameDecoder();
  const worker = new Worker('/lsp-worker.mjs', { type: 'module' });

  // 无进展看门狗：任何消息或输出都算进展并重新计时。Mathlib 加载 import 时
  // 可能长时间没有 publishDiagnostics，但 stderr / progress 通知会持续出现。
  const idleMs = config.moduleName ? 180_000 : 120_000;

  const waitMessage = <T extends LspMessage>(
    match: (msg: LspMessage) => boolean,
    label: string,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          cleanup();
          reject(new Error(`${name}: ${label} ${idleMs}ms 内没有任何消息或输出`));
        }, idleMs);
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(`${name}: worker error ${event.message}`));
      };
      const onMessage = (event: MessageEvent<Record<string, unknown>>) => {
        arm();
        const msg = event.data;
        if (typeof msg.failure === 'string') {
          cleanup();
          reject(new Error(`${name}: worker failure ${msg.failure}`));
          return;
        }
        if (typeof msg.exit === 'number') {
          // PROXY_TO_PTHREAD 派发完成时也会冒出一条 exit:0，此时真实进程还在跑。
          // 只有非零退出才是故障；exit:0 但拿不到诊断，交给无进展看门狗兜底。
          if (msg.exit !== 0) {
            cleanup();
            reject(new Error(`${name}: lean exited with ${msg.exit}`));
          }
          return;
        }
        if (typeof msg.stderr === 'string') {
          const line = msg.stderr.trim();
          if (line) log.push(`[${name}:err] ${line.slice(0, 240)}`);
          return;
        }
        if (!(msg.stdout instanceof Uint8Array)) return;
        for (const decoded of decoder.push(msg.stdout)) {
          const frame = decoded as LspMessage;
          if (
            frame.method === 'workspace/inlayHint/refresh' ||
            frame.method === 'workspace/semanticTokens/refresh'
          ) {
            if (frame.id !== undefined) {
              writer.write(encodeFrame({ jsonrpc: '2.0', id: frame.id, result: null }));
            }
          }
          if (frame.method) log.push(`[${name}] recv ${frame.method}`);
          if (match(frame)) {
            cleanup();
            resolve(frame as T);
            return;
          }
        }
      };
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      arm();
    });

  const readyPromise = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: worker ready 超时`)), 180_000);
    const onReady = (event: MessageEvent<Record<string, unknown>>) => {
      const msg = event.data;
      if (typeof msg.failure === 'string') {
        clearTimeout(timer);
        worker.removeEventListener('message', onReady);
        reject(new Error(`${name}: ${msg.failure}`));
      } else if (msg.ready === true) {
        clearTimeout(timer);
        worker.removeEventListener('message', onReady);
        resolve(typeof msg.assets === 'number' ? msg.assets : 0);
      }
    };
    worker.addEventListener('message', onReady);
    worker.addEventListener('error', (event) => {
      clearTimeout(timer);
      reject(new Error(`${name}: worker error ${event.message}`));
    });
  });

  worker.postMessage({
    leanMjsUrl: '/lean-adapted-proxy.mjs',
    manifestUrl: config.manifestUrl,
    libBaseUrl: '/lean-lib',
    stdin: { buffer: ringBuffer, capacity: RING_BYTES },
    files: { [`/workspace/${name}`]: text },
    args: ['-j4', '--worker', uri],
    env: {
      LEAN_STACK_SIZE_KB: '16384',
      LEAN_MAIN_USE_THREAD: '0',
    },
    timezone: FALLBACK_TZIF,
  });

  try {
    const assetCount = await readyPromise;
    log.push(`[${name}] worker ready assets=${assetCount}`);

    writer.write(
      encodeFrame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: initializeParams }),
    );
    writer.write(
      encodeFrame({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri, languageId: 'lean', version: 1, text } },
      }),
    );

    const collected: LspDiagnostic[][] = [];
    const nudgeTimer = setTimeout(() => {
      writer.write(
        encodeFrame({
          jsonrpc: '2.0',
          id: 900,
          method: 'textDocument/hover',
          params: { textDocument: { uri }, position: { line: nudgeLine, character: 10 } },
        }),
      );
    }, 30_000);

    try {
      // 总预算只是兜底，真正决定失败时机的是无进展看门狗：正常推进的请求不会
      // 因为“总耗时超过 N 秒”被杀掉，卡死的进程也不会拖满整段预算。
      const hardCapMs = config.moduleName ? 900_000 : 300_000;
      const deadline = performance.now() + hardCapMs;
      for (;;) {
        if (performance.now() > deadline) {
          throw new Error(`${name}: 超过总预算 ${hardCapMs}ms 仍未拿到诊断`);
        }
        const msg = await waitMessage<LspMessage>(
          (frame) =>
            (frame.method === 'textDocument/publishDiagnostics' &&
              String(frame.params?.uri ?? '').endsWith(uri)) ||
            (waitUntilFinal && frame.method === '$/lean/ileanInfoFinal'),
          'publishDiagnostics',
        );
        if (msg.method === '$/lean/ileanInfoFinal') {
          return {
            diagnostics: collected.at(-1) ?? [],
            elapsedMs: Math.round(performance.now() - startedAt),
          };
        }
        const diagnostics = (msg.params?.diagnostics ?? []) as LspDiagnostic[];
        collected.push(diagnostics);
        if (diagnostics.length > 0) {
          return { diagnostics, elapsedMs: Math.round(performance.now() - startedAt) };
        }
      }
    } finally {
      clearTimeout(nudgeTimer);
    }
  } finally {
    writer.close();
    worker.terminate();
  }
};

const runLspMode = async (environment: EnvironmentReport, config: QueryConfig): Promise<void> => {
  const mod = config.moduleName;
  const nudgeLine = mod ? 1 : 0;
  const badText = buildSource(mod, DEFAULT_BAD_BODY);
  const goodText = buildSource(mod, config.goodCode ?? DEFAULT_GOOD_BODY);

  const bad = await runLspDoc('Bad.lean', badText, false, config, nudgeLine);
  log.push(`Bad.lean diagnostics=${bad.diagnostics.length} (${bad.elapsedMs}ms)`);
  const hasTypeError = bad.diagnostics.some((d) => /mismatch|type/i.test(String(d.message ?? '')));
  if (!hasTypeError) {
    throw new Error(`Bad.lean 未收到预期类型错误: ${JSON.stringify(bad.diagnostics)}`);
  }

  const good = await runLspDoc('Good.lean', goodText, true, config, nudgeLine);
  log.push(`Good.lean diagnostics=${good.diagnostics.length} (${good.elapsedMs}ms)`);
  if (good.diagnostics.length > 0) {
    throw new Error(`Good.lean 不该有诊断: ${JSON.stringify(good.diagnostics)}`);
  }

  finish({
    ok: true,
    stage: mod ? `lsp-${mod}` : 'lsp-init',
    code: 0,
    environment,
    log,
  });
};

const DEPTH_SAMPLES = [1000, 1200, 1500, 2000, 4000] as const;

const buildDepthCode = (n: number): string =>
  [
    'def f : Nat → Nat',
    '  | 0 => 0',
    '  | n + 1 => f n',
    '',
    'set_option maxRecDepth 8000 in',
    `example : f ${n} = 0 := by simp [f]`,
    '',
  ].join('\n');

const runDepthMode = async (environment: EnvironmentReport, config: QueryConfig): Promise<void> => {
  let maxPassed = 0;
  for (const n of DEPTH_SAMPLES) {
    const fileName = `Depth${n}.lean`;
    try {
      const result = await runLspDoc(fileName, buildDepthCode(n), true, config, 5);
      if (result.diagnostics.length === 0) {
        maxPassed = n;
        log.push(`[depth] N=${n} ok (${result.elapsedMs}ms)`);
      } else {
        const msg = result.diagnostics.map((d) => String(d.message ?? '')).join('; ');
        log.push(`[depth] N=${n} diagnostics=${result.diagnostics.length}: ${msg.slice(0, 240)}`);
        break;
      }
    } catch (error: unknown) {
      const detail = String((error as Error)?.message ?? error).slice(0, 240);
      log.push(`[depth] N=${n} failed: ${detail}`);
      break;
    }
  }
  finish({
    ok: maxPassed >= 4000,
    stage: `depth-max-${maxPassed}`,
    code: maxPassed >= 4000 ? 0 : 1,
    environment,
    log,
  });
};

const run = async (): Promise<void> => {
  const environment = readEnvironment();
  const config = readQueryConfig();
  const mode = config.mode;
  log.push(
    `mode=${mode} manifest=${config.manifestUrl} module=${config.moduleName ?? '<none>'} env ${JSON.stringify(environment)}`,
  );
  let lean: LeanInstance | undefined;
  try {
    if (mode === 'lsp') {
      await runLspMode(environment, config);
      return;
    }
    if (mode === 'depth') {
      await runDepthMode(environment, config);
      return;
    }
    // 用变量持有 URL，避免打包阶段把 /lean.mjs 解析成模块依赖。
    const leanModuleUrl = '/lean.mjs';
    const module = (await import(/* @vite-ignore */ leanModuleUrl)) as unknown as {
      default?: LeanFactory;
      createLean?: LeanFactory;
    };
    const createLean = module.default ?? module.createLean;
    if (typeof createLean !== 'function') throw new Error('lean.mjs 未导出 createLean');
    lean = await createLean({
      noInitialRun: true,
      print: (line: string) => log.push(`OUT ${line}`),
      printErr: (line: string) => log.push(`ERR ${line}`),
      onAbort: (what: string) => log.push(`ABORT ${what}`),
      onExit: (code: number) => log.push(`EXIT ${code}`),
    });
    log.push('createLean ok');
    // Lean 启动时会解析 appPath/libdir，两个模式都需要这些目录存在。
    lean.FS.mkdirTree('/lean/bin');
    lean.FS.mkdirTree('/lean/lib/lean');
    lean.FS.mkdirTree('/src');
    // version 模式只验证启动；compile 模式挂载自建 oleans 后编译。两个模式用独立页面加载，避免 EXIT_RUNTIME 影响。
    const oleans = mode === 'version' ? [] : await mountOleans(lean, config);
    log.push(`oleans=${oleans.length}`);
    // Emscripten 的 callMain 会自己补 argv[0]，这里只传真实参数；
    // 再塞一个程序名会被 Lean 当成输入文件（"Expected exactly one file name"）。
    const compile = mode === 'compile' || (mode === 'auto' && oleans.length > 0);
    const argv = compile
      ? ['-j1', '-R', '/src', '-o', '/src/Probe.olean', '/src/Probe.lean']
      : ['--version'];
    const stage = compile
      ? config.moduleName
        ? `compile-${config.moduleName}`
        : 'compile-init'
      : 'version';
    log.push(`stage=${stage} argv=${JSON.stringify(argv)}`);
    // -sEXIT_RUNTIME=1 下 callMain 用 ExitStatus 异常退出，状态码即 Lean 的退出码。
    let code = 0;
    try {
      code = lean.callMain(argv);
    } catch (error) {
      const exit = error as { name?: string; status?: number } | null;
      if (exit?.name === 'ExitStatus' && typeof exit.status === 'number') code = exit.status;
      else throw error;
    }
    log.push(`callMain code=${code}`);
    if (compile) {
      const output = (
        lean.FS as unknown as {
          analyzePath(p: string): { exists: boolean; object?: { contents?: Uint8Array } };
        }
      ).analyzePath('/src/Probe.olean');
      log.push(`probe.olean exists=${output.exists} size=${output.object?.contents?.length ?? -1}`);
    }
    finish({ ok: code === 0, stage, code, oleanCount: oleans.length, environment, log });
  } catch (error) {
    finish({ ok: false, stage: 'exception', error: describe(error, lean), environment, log });
  }
};

void run();
