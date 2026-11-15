/**
 * 页面内探针：在真实 Chromium 中加载 wasm64 Lean 产物并执行 --version。
 *
 * 由 esbuild 单独打包成 ESM 模块给页面加载，不经过 page.evaluate 的函数序列化，
 * 否则 tsx/esbuild 注入的 __name helper 在页面里不存在。
 * 只调用 Emscripten 公开 API（callMain），不直接读写 wasm 指针。
 */
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
  log.push(`result ok=${String(value.ok)} stage=${value.stage}${value.code === undefined ? '' : ` code=${value.code}`}`);
  window.__probeResult = value;
};

const PROBE_SOURCE = 'import Init\nexample : 1 + 1 = 2 := rfl\n';

/**
 * 把自建的 64 位 Init oleans 读进 MEMFS 的 /lean/lib/lean。
 * 清单由 CI 生成；没有清单时返回空数组，退化为 --version 冒烟。
 */
const mountOleans = async (lean: LeanInstance): Promise<string[]> => {
  // Lean 启动时会解析 libdir，即使不导入任何模块也要有 /lean/lib/lean。
  lean.FS.mkdirTree('/lean/bin');
  lean.FS.mkdirTree('/lean/lib/lean');
  lean.FS.mkdirTree('/src');
  const manifestResponse = await fetch('/olean-manifest.json');
  if (!manifestResponse.ok) {
    log.push('olean manifest 缺失，跳过 olean 阶段');
    return [];
  }
  const files = (await manifestResponse.json()) as string[];
  for (const rel of files) {
    const response = await fetch(`/lean-lib/${rel}`);
    if (!response.ok) throw new Error(`olean 加载失败 ${rel}: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const target = `/lean/lib/lean/${rel}`;
    const parent = target.slice(0, target.lastIndexOf('/'));
    if (parent) lean.FS.mkdirTree(parent);
    lean.FS.writeFile(target, bytes);
  }
  lean.FS.mkdirTree('/lean/bin');
  lean.FS.mkdirTree('/src');
  lean.FS.writeFile('/src/Probe.lean', new TextEncoder().encode(PROBE_SOURCE));
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

const run = async (): Promise<void> => {
  const environment = readEnvironment();
  const mode = new URLSearchParams(location.search).get('mode') ?? 'auto';
  log.push(`mode=${mode} env ${JSON.stringify(environment)}`);
  let lean: LeanInstance | undefined;
  try {
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
    // version 模式只验证启动；compile 模式挂官方 oleans 后编译。两个模式用独立页面加载，避免 EXIT_RUNTIME 影响。
    const oleans = mode === 'version' ? [] : await mountOleans(lean);
    log.push(`oleans=${oleans.length}`);
    // Emscripten 的 callMain 会自己补 argv[0]，这里只传真实参数；
    // 再塞一个程序名会被 Lean 当成输入文件（"Expected exactly one file name"）。
    const compile = mode === 'compile' || (mode === 'auto' && oleans.length > 0);
    const argv = compile
      ? ['-j1', '-R', '/src', '-o', '/src/Probe.olean', '/src/Probe.lean']
      : ['--version'];
    const stage = compile ? 'compile-init' : 'version';
    log.push(`stage=${stage} argv=${JSON.stringify(argv)}`);
    const code = lean.callMain(argv);
    log.push(`callMain code=${code}`);
    finish({ ok: code === 0, stage, code, oleanCount: oleans.length, environment, log });
  } catch (error) {
    finish({ ok: false, stage: 'exception', error: describe(error, lean), environment, log });
  }
};

void run();
