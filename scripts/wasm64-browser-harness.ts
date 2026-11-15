/**
 * 页面内探针：在真实 Chromium 中加载 wasm64 Lean 产物并执行 --version。
 *
 * 由 esbuild 单独打包成 ESM 模块给页面加载，不经过 page.evaluate 的函数序列化，
 * 否则 tsx/esbuild 注入的 __name helper 在页面里不存在。
 * 只调用 Emscripten 公开 API（callMain），不直接读写 wasm 指针。
 */
interface LeanInstance {
  callMain(args: string[]): number;
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

const run = async (): Promise<void> => {
  const environment = readEnvironment();
  log.push(`env ${JSON.stringify(environment)}`);
  try {
    // 用变量持有 URL，避免打包阶段把 /lean.mjs 解析成模块依赖。
    const leanModuleUrl = '/lean.mjs';
    const module = (await import(/* @vite-ignore */ leanModuleUrl)) as unknown as {
      default?: LeanFactory;
      createLean?: LeanFactory;
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
    finish({ ok: code === 0, stage: 'callMain', code, environment, log });
  } catch (error) {
    finish({ ok: false, stage: 'exception', error: describe(error), environment, log });
  }
};

void run();
