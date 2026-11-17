// wasm64 LSP 诊断链路验证。
//
// 用法：
//   node scripts/wasm64-lsp-diagnostics.ts --lean <lean.mjs> --lib <libDir> [--module Mathlib.Tactic.Spread] [--mode worker|server]
//
// server：`-j2 --server` 走 watchdog，只验证到 didOpen（wasm 里 Process.spawn 不可用，watchdog 会 forceExit）。
// worker：`-j4 --worker <uri>` 直接起文件 worker，和 SDK 在浏览器里的做法一致，能真正拿到 publishDiagnostics。
//
// 两种模式都断言：Bad.lean 有类型不匹配诊断，Good.lean 干净（同时证明 import 的 olean 真的加载成功）。
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import {
  CliError,
  optionalString,
  parseArgs,
  requireNumber,
  requireString,
  runCli,
  type FlagSpec,
} from './lib/cli.ts';
import { isMainModule } from './lib/entry.ts';
import { FrameDecoder, RingWriter, encodeFrame } from './lib/frames.ts';
import { requireDir, requireFile } from './lib/fs-guards.ts';

// watchdogMain 解析 /etc/localtime，合成数据会被 forceExit，直接用宿主时区文件。
// 没有 tzdata（比如本地 Windows）时退回 SDK 内置的 123 字节 UTC TZif。
const FALLBACK_TZIF = Uint8Array.from([
  84, 90, 105, 102, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 85, 84, 67, 0, 84, 90, 105,
  102, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 85, 84, 67, 0, 10, 85, 84, 67, 48, 10,
]);

// 与 SDK 的 LeanStdin 一致：16 字节控制区 + 环形负载。
const RING_BYTES = 8 * 1024 * 1024 + 8192;

export interface DocumentSet {
  readonly documents: Record<string, string>;
  readonly exampleLine: number;
}

const DEFAULT_GOOD_BODY = 'example : 1 + 1 = 2 := rfl\n';

/** import 行占掉第 0 行，示例在第 1 行；nudge 的 hover 位置要落在示例上。 */
export const buildDocuments = (moduleName?: string, goodBody?: string): DocumentSet => {
  const importLine = moduleName ? `import ${moduleName}\n` : '';
  const body = goodBody ?? DEFAULT_GOOD_BODY;
  const goodSource = body.endsWith('\n') ? body : `${body}\n`;
  return {
    documents: {
      'Bad.lean': `${importLine}example : 1 + 1 = 3 := rfl\n`,
      'Good.lean': `${importLine}${goodSource}`,
    },
    exampleLine: moduleName ? 1 : 0,
  };
};

export interface Diagnostic {
  readonly range?: { readonly start?: { readonly line?: number; readonly character?: number } };
  readonly severity?: number;
  readonly message?: string;
}

export interface LspMessage {
  readonly jsonrpc?: string;
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly result?: {
    readonly capabilities?: unknown;
    readonly serverInfo?: { readonly name?: string };
  };
}

export const describeDiagnostic = (diagnostic: Diagnostic): string => {
  const range = diagnostic.range?.start ?? {};
  const severity = ({ 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' } as Record<number, string>)[
    diagnostic.severity ?? 0
  ];
  const text = String(diagnostic.message ?? '')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
  return `${severity ?? '?'} ${range.line ?? '?'}:${range.character ?? '?'} ${text}`;
};

export const isTypeMismatch = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => /mismatch|type/i.test(String(diagnostic.message ?? '')));

const readTimezone = (): Uint8Array => {
  for (const candidate of [
    process.env.LEAN_WASM_TZ,
    '/usr/share/zoneinfo/UTC',
    '/usr/share/zoneinfo/Etc/UTC',
  ]) {
    if (!candidate) continue;
    try {
      return readFileSync(candidate);
    } catch {
      // 换下一个候选。
    }
  }
  console.error('[diag] 没有系统 tzdata，使用内置 UTC TZif');
  return FALLBACK_TZIF;
};

interface Session {
  sendFrame(message: LspMessage): void;
  waitFor(
    match: (message: LspMessage) => boolean,
    label: string,
    timeoutMs: number,
  ): Promise<LspMessage>;
  stats(): { write: number; read: number; closed: boolean };
  dispose(): Promise<void>;
}

interface SessionInput {
  readonly leanMjs: string;
  readonly libDir: string;
  readonly files: Record<string, string>;
  readonly args: string[];
  readonly proxy: boolean;
  readonly timezone: Uint8Array;
  /** 无进展窗口：超过这么久没收到任何消息/输出就判定卡死，而不是干等总预算。 */
  readonly idleTimeoutMs: number;
}

/** 无进展超时：worker 还在但没有任何消息，重试只会把无效等待翻倍。 */
export class NoProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoProgressError';
  }
}

export const createSession = ({
  leanMjs,
  libDir,
  files,
  args,
  proxy,
  timezone,
  idleTimeoutMs,
}: SessionInput): Session => {
  const ringBuffer = new SharedArrayBuffer(16 + RING_BYTES);
  const writer = new RingWriter(ringBuffer, RING_BYTES);
  const decoder = new FrameDecoder();
  const worker = new Worker(new URL('./wasm64-lsp-worker.ts', import.meta.url), {
    workerData: {
      leanMjs,
      libDir,
      files,
      args,
      timezone,
      proxy,
      stdin: { buffer: ringBuffer, capacity: RING_BYTES },
    },
  });

  const waiters: Array<{
    match: (message: LspMessage) => boolean;
    resolve: (message: LspMessage) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  let exited = false;
  let disposing = false;
  let fatalError: Error | undefined;

  const failWaiters = (error: Error): void => {
    fatalError ??= error;
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  };

  let idleTimer: NodeJS.Timeout | undefined;
  const stopIdle = (): void => {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };

  // 无进展看门狗：worker 卡在 Atomics.wait 时不会有任何消息。每收到一条消息
  // （stdout 分片、stderr 行、debug 日志）就重新计时；静默满一个窗口立刻失败，
  // 不再把 15 分钟总预算耗在已经死掉的进程上。
  const touch = (): void => {
    if (disposing || fatalError) return;
    stopIdle();
    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      failWaiters(new NoProgressError(`超过 ${idleTimeoutMs}ms 没有收到任何 LSP 消息或输出`));
    }, idleTimeoutMs);
  };
  touch();

  const waitFor = (match: (message: LspMessage) => boolean, label: string, timeoutMs: number) =>
    new Promise<LspMessage>((resolveWait, rejectWait) => {
      if (fatalError) {
        rejectWait(fatalError);
        return;
      }
      const waiter = {
        match,
        resolve: resolveWait,
        reject: rejectWait,
      } as (typeof waiters)[number];
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index !== -1) waiters.splice(index, 1);
        rejectWait(new Error(`等待 ${label} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      waiters.push(waiter);
    });

  const dispatch = (message: LspMessage): void => {
    if (process.env.LEAN_WASM_DIAG_DEBUG) {
      const method = message.method ?? '<response>';
      const count =
        method === 'textDocument/publishDiagnostics'
          ? ` count=${diagnosticsOf(message).length}`
          : '';
      console.error(`[diag] recv method=${method} id=${String(message.id ?? '-')}${count}`);
    }
    if (message.method && message.id !== undefined) {
      writer.write(encodeFrame({ jsonrpc: '2.0', id: message.id, result: null }));
    }
    for (let i = 0; i < waiters.length; i += 1) {
      const waiter = waiters[i];
      if (waiter && waiter.match(message)) {
        waiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return;
      }
    }
  };

  worker.on('message', (message: Record<string, unknown>) => {
    touch();
    if (typeof message.debug === 'string') process.stderr.write(`[debug] ${message.debug}\n`);
    else if (message.stdout instanceof Uint8Array) {
      for (const decoded of decoder.push(message.stdout)) dispatch(decoded as LspMessage);
    } else if (typeof message.stderr === 'string') process.stderr.write(`[lean] ${message.stderr}`);
    else if (typeof message.failure === 'string') {
      console.error(`[worker] ${message.failure}`);
      stopIdle();
      failWaiters(new Error(`worker 异常: ${message.failure}`));
    } else if (typeof message.exit === 'number') {
      exited = true;
      stopIdle();
      // 退出码为 0 也算提前结束：诊断还没等到就退出，继续等只会白等。
      if (!disposing) failWaiters(new Error(`worker 提前退出 code=${message.exit}`));
    }
  });
  worker.on('error', (error) => {
    stopIdle();
    console.error(`[worker] ${error.stack ?? error}`);
    failWaiters(error instanceof Error ? error : new Error(String(error)));
  });
  worker.on('exit', (code) => {
    exited = true;
    stopIdle();
    if (!disposing) failWaiters(new Error(`worker 提前退出 code=${code}`));
  });

  return {
    sendFrame(message) {
      const frame = encodeFrame(message);
      writer.write(frame);
      if (process.env.LEAN_WASM_DIAG_DEBUG) console.error(`[debug] sent ${frame.length} bytes`);
    },
    waitFor,
    stats: () => writer.stats(),
    async dispose() {
      disposing = true;
      stopIdle();
      // proxy 模式下 main 在 pthread 上，送 EOF 没必要，直接收掉整个 worker。
      if (!proxy) writer.close();
      if (exited) return;
      await new Promise<void>((resolveExit) => {
        const timer = setTimeout(resolveExit, 10_000);
        worker.once('exit', () => {
          clearTimeout(timer);
          resolveExit();
        });
        worker.terminate().catch(() => resolveExit());
      });
    },
  };
};

const isPublishFor =
  (uri: string) =>
  (message: LspMessage): boolean =>
    message.method === 'textDocument/publishDiagnostics' &&
    String((message.params as { uri?: unknown } | undefined)?.uri ?? '').endsWith(uri);

const diagnosticsOf = (message: LspMessage): Diagnostic[] =>
  ((message.params as { diagnostics?: Diagnostic[] } | undefined)?.diagnostics ??
    []) as Diagnostic[];

const isIleanFinal = (message: LspMessage): boolean => message.method === '$/lean/ileanInfoFinal';

/** 等一个文档的诊断；Lean 会先在 setupImports 发空数组，所以 Good 也要等到 ileanInfoFinal。 */
const awaitDiagnostics = async (
  session: Session,
  uri: string,
  waitUntilFinal: boolean,
  label: string,
  timeoutMs: number,
  nudgeLine: number,
): Promise<Diagnostic[]> => {
  const collected: Diagnostic[][] = [];
  const started = Date.now();
  const progress = setInterval(() => {
    const { write, read, closed } = session.stats();
    console.error(
      `[diag] 环形缓冲 write=${write} read=${read} closed=${closed} 已收集=${collected.length}`,
    );
  }, 10_000);
  const nudge = setTimeout(() => {
    session.sendFrame({
      jsonrpc: '2.0',
      id: 900,
      method: 'textDocument/hover',
      params: { textDocument: { uri }, position: { line: nudgeLine, character: 10 } },
    });
  }, 30_000);
  const match = (message: LspMessage): boolean =>
    isPublishFor(uri)(message) || (waitUntilFinal && isIleanFinal(message));
  try {
    for (;;) {
      const remaining = timeoutMs - (Date.now() - started);
      if (remaining <= 0) {
        const last = collected.at(-1)?.length ?? 0;
        throw new Error(`${label} 超时，最后一条诊断数=${last}`);
      }
      const message = await session.waitFor(match, `${label} 的诊断`, remaining);
      if (isIleanFinal(message)) return collected.at(-1) ?? [];
      const diagnostics = diagnosticsOf(message);
      collected.push(diagnostics);
      if (diagnostics.length > 0) return diagnostics;
    }
  } finally {
    clearTimeout(nudge);
    clearInterval(progress);
  }
};

const openDocument = (
  session: Session,
  name: string,
  uri: string,
  documents: Record<string, string>,
): void => {
  session.sendFrame({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: { textDocument: { uri, languageId: 'lean', version: 1, text: documents[name] ?? '' } },
  });
};

const assertBad = (name: string, diagnostics: readonly Diagnostic[]): void => {
  console.log(`[diag] ${name} diagnostics=${diagnostics.length}`);
  for (const diagnostic of diagnostics) console.log(`  - ${describeDiagnostic(diagnostic)}`);
  if (!isTypeMismatch(diagnostics)) throw new Error(`${name} 收到了诊断，但不是预期的类型不匹配`);
};

const assertGood = (name: string, diagnostics: readonly Diagnostic[]): void => {
  console.log(`[diag] ${name} diagnostics=${diagnostics.length}`);
  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) console.log(`  - ${describeDiagnostic(diagnostic)}`);
    throw new Error(`${name} 不该有诊断：依赖或 import 有问题`);
  }
};

export interface DiagOptions {
  readonly leanMjs: string;
  readonly libDir: string;
  readonly moduleName?: string;
  readonly goodCode?: string;
  readonly mode: 'worker' | 'server';
  readonly timeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly jobs: number;
}

const initializeParams = {
  processId: null,
  rootUri: 'file:///workspace',
  workspaceFolders: null,
  capabilities: { textDocument: { publishDiagnostics: {}, synchronization: {} } },
};

/** watchdog 模式：initialize → initialized → didOpen；didOpen 之后的 spawn 在 wasm 里不可用。 */
const runServerMode = async (
  options: DiagOptions,
  documents: Record<string, string>,
  exampleLine: number,
) => {
  const proxy = /adapted-proxy/.test(options.leanMjs);
  const session = createSession({
    leanMjs: options.leanMjs,
    libDir: options.libDir,
    files: {
      '/workspace/Bad.lean': documents['Bad.lean'] ?? '',
      '/workspace/Good.lean': documents['Good.lean'] ?? '',
    },
    args: ['-j2', '--server'],
    proxy,
    timezone: readTimezone(),
    idleTimeoutMs: options.idleTimeoutMs,
  });
  try {
    const init = session.waitFor((message) => message.id === 1, 'initialize 响应', 180_000);
    session.sendFrame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: initializeParams });
    const initialized = await init;
    if (!initialized.result?.capabilities) {
      throw new Error(`initialize 没有 capabilities: ${JSON.stringify(initialized).slice(0, 300)}`);
    }
    console.log(`[diag] initialize ok server=${initialized.result.serverInfo?.name ?? '?'}`);
    session.sendFrame({ jsonrpc: '2.0', method: 'initialized', params: {} });

    const uri = 'file:///workspace/Bad.lean';
    openDocument(session, 'Bad.lean', uri, documents);
    const diagnostics = await awaitDiagnostics(
      session,
      uri,
      false,
      'Bad.lean',
      options.timeoutMs,
      exampleLine,
    );
    assertBad('Bad.lean', diagnostics);
  } finally {
    await session.dispose();
  }
};

/** 文件 worker 模式：每个文档一个实例，直接收 publishDiagnostics —— SDK 在浏览器里就是这么做的。 */
const runWorkerMode = async (
  options: DiagOptions,
  documents: Record<string, string>,
  exampleLine: number,
) => {
  const proxy = /adapted-proxy/.test(options.leanMjs);
  for (const name of ['Bad.lean', 'Good.lean']) {
    const uri = `file:///workspace/${name}`;
    const session = createSession({
      leanMjs: options.leanMjs,
      libDir: options.libDir,
      files: { [`/workspace/${name}`]: documents[name] ?? '' },
      args: [`-j${options.jobs}`, '--worker', uri],
      proxy,
      timezone: readTimezone(),
      idleTimeoutMs: options.idleTimeoutMs,
    });
    try {
      // 按 SDK 的顺序：initialize 与 didOpen 连着发，不等待 initialize 响应。
      session.sendFrame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: initializeParams });
      openDocument(session, name, uri, documents);
      // Bad 等到非空诊断；Good 等到 ileanInfoFinal（跳过 setupImports 的空通知）。
      const diagnostics = await awaitDiagnostics(
        session,
        uri,
        name === 'Good.lean',
        name,
        options.timeoutMs,
        exampleLine,
      );
      if (name === 'Bad.lean') assertBad(name, diagnostics);
      else assertGood(name, diagnostics);
    } finally {
      await session.dispose();
    }
  }
};

const DIAG_SPEC: Record<string, FlagSpec> = {
  lean: { kind: 'string', required: true, valueName: 'lean.mjs' },
  lib: { kind: 'string', required: true, valueName: 'dir' },
  module: {
    kind: 'string',
    valueName: 'Module.Name',
    description: '要被 import 的模块（默认只验证 Init）',
  },
  'good-code': {
    kind: 'string',
    valueName: 'LeanCode',
    description: '覆盖 Good.lean 的测试主体，用于验证具体 Mathlib 引理/策略',
  },
  mode: { kind: 'string', valueName: 'worker|server' },
  timeout: { kind: 'number', valueName: 'ms' },
  'idle-timeout': {
    kind: 'number',
    valueName: 'ms',
    description: '多久没有任何消息或输出就判定卡死（默认 120000）',
  },
  jobs: { kind: 'number', valueName: 'n', description: 'worker 模式的 -j 线程数（默认 4）' },
};

export const parseDiagOptions = (argv: readonly string[]): DiagOptions => {
  const parsed = parseArgs(argv, DIAG_SPEC);
  const mode = optionalString(parsed, 'mode') ?? 'worker';
  if (mode !== 'worker' && mode !== 'server')
    throw new CliError(`--mode 只能是 worker 或 server，收到 ${mode}`);
  const timeoutMs = parsed.flags.timeout === undefined ? 300_000 : requireNumber(parsed, 'timeout');
  const idleTimeoutMs =
    parsed.flags['idle-timeout'] === undefined ? 120_000 : requireNumber(parsed, 'idle-timeout');
  if (!Number.isInteger(idleTimeoutMs) || idleTimeoutMs <= 0)
    throw new CliError(`--idle-timeout 必须是正整数，收到 ${idleTimeoutMs}`);
  const jobs = parsed.flags.jobs === undefined ? 4 : requireNumber(parsed, 'jobs');
  if (!Number.isInteger(jobs) || jobs < 1) throw new CliError(`--jobs 必须是正整数，收到 ${jobs}`);
  const moduleName = optionalString(parsed, 'module');
  const goodCode = optionalString(parsed, 'good-code');
  return {
    leanMjs: requireFile(requireString(parsed, 'lean'), 'lean.mjs'),
    libDir: requireDir(requireString(parsed, 'lib'), 'lib'),
    ...(moduleName === undefined ? {} : { moduleName }),
    ...(goodCode === undefined ? {} : { goodCode }),
    mode,
    timeoutMs,
    idleTimeoutMs,
    jobs,
  };
};

/** 只有网络/缓存类错误值得重试；超时重试只会把无效等待翻倍。 */
const isRetryable = (message: string): boolean =>
  /ECONN|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|network|download/i.test(message);

const main = async (): Promise<void> => {
  const options = parseDiagOptions(process.argv.slice(2));
  const { documents, exampleLine } = buildDocuments(options.moduleName, options.goodCode);

  // 兜底：worker 卡在 Atomics.wait 时 Node 不会自己退出，超时直接杀掉。
  const watchdogMs = Number(process.env.LEAN_WASM_DIAG_TIMEOUT_MS ?? 900_000);
  const watchdog = setTimeout(() => {
    console.error(`[diag] 全局超时 ${watchdogMs}ms`);
    process.exit(1);
  }, watchdogMs);
  watchdog.unref();

  try {
    if (options.mode === 'worker') await runWorkerMode(options, documents, exampleLine);
    else await runServerMode(options, documents, exampleLine);
    console.log(
      `[diag] mode=${options.mode} module=${options.moduleName ?? '<Init>'} lib=${options.libDir}`,
    );
    console.log('[diag] ok');
    // Emscripten 的 _proc_exit 可能把 process.exitCode 留成 1，成功时显式覆盖。
    process.exitCode = 0;
  } catch (error) {
    const message = (error as Error).message;
    console.error(`[diag] failed: ${message}`);
    // CI 靠退出码决定是否重试：4 = 无进展/超时（不重试），3 = 网络/缓存（值得一次重试）。
    if (error instanceof NoProgressError || message.includes('超时')) process.exitCode = 4;
    else if (isRetryable(message)) process.exitCode = 3;
    else process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
  }
};

if (isMainModule(import.meta.url, process.argv[1])) {
  runCli(async () => {
    await main();
    // worker 里的 pthread 可能卡在 Atomics.wait，Node 不会自己退出；
    // 刷新 stdout 后强制收尾，否则 CI 步骤会一直挂到 timeout。
    const code = process.exitCode ?? 0;
    await new Promise<void>((resolve) => process.stdout.write('', () => resolve()));
    process.exit(code);
  });
}
