/**
 * 实验性 wasm64 运行时的 LSP 监督器：用「每个 Lean 进程一个 Worker」替代原生子进程。
 * 逻辑对应 @wasm-idle/lsp 的 lean4/worker.js（bootstrap 进程拿 initialize 能力、
 * 文件进程负责文档、退出码 2 表示 FileWorker 请求重启），但完全与进程创建方式解耦，
 * 进程由 LeanProcessFactory 提供，便于单测。
 *
 * ⚠️ 实验性：仅在用户手动选择 wasm64 时使用，默认生产路径仍是 wasm32。
 */
import type { DataCallback, Event, Message } from 'vscode-jsonrpc/browser';
import type { LeanSessionServer } from './lean-session';

/** 最小事件发射器：只需要 vscode-jsonrpc 的 Event 形状，避免在 Node 单测里加载浏览器入口。 */
const createEmitter = <T>() => {
  const listeners = new Set<(value: T) => void>();
  const event: Event<T> = (listener) => {
    const wrapped = (value: T): void => void listener(value);
    listeners.add(wrapped);
    return { dispose: () => void listeners.delete(wrapped) };
  };
  return {
    event,
    fire: (value: T): void => {
      for (const listener of [...listeners]) listener(value);
    },
    dispose: (): void => listeners.clear(),
  };
};

export type LspMessage = {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: Record<string, unknown> & {
    textDocument?: { uri?: string; [key: string]: unknown };
    contentChanges?: Array<{
      text: string;
      range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    }>;
  };
  result?: { capabilities?: Record<string, unknown>; [key: string]: unknown };
  error?: { code: number; message: string };
};

export type LeanProcessCallbacks = {
  onMessage: (message: LspMessage) => void;
  /** Lean 进程以非零退出码结束；2 表示 FileWorker 请求重启。 */
  onExit: (code: number) => void;
  onFailure: (message: string) => void;
};

export interface LeanProcess {
  /** 进程已把库挂载进 MEMFS 并开始 callMain。 */
  readonly ready: Promise<void>;
  send(message: LspMessage): void;
  dispose(): void;
  /** 主动采样当前进程的线性内存字节数（支持运行时扩展后的瞬时探测）。 */
  readonly sampleMemoryBytes?: () => Promise<number | null>;
}

export type Wasm64SessionServer = LeanSessionServer & {
  readonly sampleMemoryBytes?: () => Promise<number | null>;
};

export type LeanProcessFactory = (
  args: readonly string[],
  callbacks: LeanProcessCallbacks,
) => LeanProcess;

export type Wasm64SupervisorOptions = {
  /** 终态错误（进程崩溃等）；调用方据此走崩溃恢复。 */
  onError?: (message: string) => void;
  /** 测试注入：重启风暴判定使用的时钟。 */
  now?: () => number;
  /** 时间窗内允许的重启次数；超过即视为无法恢复。 */
  maxRestarts?: number;
  /** 重启计数的时间窗（毫秒）。 */
  restartWindowMs?: number;
};

type ActiveDocument = {
  uri: string;
  languageId?: string;
  version?: number;
  text: string;
};

const RESTART_EXIT_CODE = 2;
const INTERNAL_INIT_ID = 'lean-browser:init';
const DEFAULT_MAX_RESTARTS = 5;
const DEFAULT_RESTART_WINDOW_MS = 60_000;
/** 只有启动后很快退出（而不是用户改 header 后正常重启）才计入重启风暴。 */
const FAST_RESTART_MS = 15_000;
const MAX_EARLY_REQUESTS = 128;
const MAX_DOCUMENT_BYTES = 8 * 1024 ** 2;

// 这些操作需要原生项目 watchdog，浏览器里没有。
const UNSUPPORTED_METHODS = new Set([
  'workspace/symbol',
  'textDocument/references',
  'textDocument/rename',
  'textDocument/prepareRename',
  'textDocument/prepareCallHierarchy',
  'callHierarchy/incomingCalls',
  'callHierarchy/outgoingCalls',
  '$/lean/prepareModuleHierarchy',
  '$/lean/moduleHierarchy/imports',
  '$/lean/moduleHierarchy/importedBy',
]);

// 这些能力属于原生 watchdog，不属于 FileWorker。
const WATCHDOG_CAPABILITIES = [
  'referencesProvider',
  'renameProvider',
  'callHierarchyProvider',
  'workspaceSymbolProvider',
] as const;

const offsetOf = (text: string, position: { line: number; character: number }): number => {
  let offset = 0;
  for (let line = 0; line < position.line; line += 1) {
    const end = text.indexOf('\n', offset);
    offset = end < 0 ? text.length : end + 1;
  }
  return offset + position.character;
};

export const createWasm64Supervisor = async (
  factory: LeanProcessFactory,
  options: Wasm64SupervisorOptions = {},
): Promise<Wasm64SessionServer> => {
  const closed = createEmitter<void>();
  const readerError = createEmitter<Error>();
  const readerPartial = createEmitter<never>();
  const writerError = createEmitter<[Error, Message | undefined, number | undefined]>();

  let receive: DataCallback | undefined;
  let disposed = false;
  let terminalError: string | undefined;

  let bootstrap: LeanProcess | undefined;
  let fileProcess: LeanProcess | undefined;
  let restarting: Promise<void> | undefined;
  let active: ActiveDocument | undefined;
  let generation = 0;
  let initializeParams: LspMessage['params'];
  let initializeId: number | string | undefined;
  let initialized = false;
  let nextServerId = 0;
  const now = options.now ?? Date.now;
  const maxRestarts = options.maxRestarts ?? DEFAULT_MAX_RESTARTS;
  const restartWindowMs = options.restartWindowMs ?? DEFAULT_RESTART_WINDOW_MS;
  let restartTimestamps: number[] = [];

  /** 已转发给文件进程、尚未收到响应的请求。 */
  const pending = new Set<number | string>();
  /** 客户端发出、尚未收到响应的全部请求；dispose 时统一以错误结算。 */
  const inflight = new Set<number | string>();
  const early: LspMessage[] = [];
  const serverRequests = new Map<string, number | string>();

  const emit = (message: LspMessage): void => {
    if (disposed) return;
    if (!message.method && message.id !== undefined) inflight.delete(message.id);
    receive?.(message as unknown as Message);
  };

  const emitError = (id: number | string, code: number, message: string): void =>
    emit({ jsonrpc: '2.0', id, error: { code, message } });

  const cancelPending = (message: string, cancelEarly = false): void => {
    if (!initialized && initializeId !== undefined) {
      emitError(initializeId, -32603, message);
      initializeId = undefined;
    }
    for (const id of pending) emitError(id, -32801, message);
    pending.clear();
    if (cancelEarly) {
      for (const request of early.splice(0)) {
        if (request.method && request.id !== undefined) emitError(request.id, -32801, message);
      }
    }
  };

  const disposeProcesses = (): void => {
    const processes = [bootstrap, fileProcess];
    bootstrap = fileProcess = undefined;
    for (const process of processes) process?.dispose();
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    generation += 1;
    disposeProcesses();
    // 崩溃的监督器无法再回答，settle 所有还没有响应的请求，避免调用方永远挂起。
    const reason = terminalError ?? 'Lean LSP is closed.';
    for (const id of inflight) {
      receive?.({ jsonrpc: '2.0', id, error: { code: -32801, message: reason } } as Message);
    }
    inflight.clear();
    pending.clear();
    closed.fire();
    receive = undefined;
    closed.dispose();
    readerError.dispose();
    readerPartial.dispose();
    writerError.dispose();
  };

  const fail = (cause: unknown): void => {
    if (terminalError !== undefined || disposed) return;
    const message = cause instanceof Error ? cause.message : String(cause);
    terminalError = message;
    options.onError?.(message);
    dispose();
  };

  const fileOutput = (message: LspMessage): void => {
    if (message.method && message.id !== undefined) {
      // 客户端与服务端的请求 ID 相互独立；跨进程重启时给服务端 ID 加前缀。
      nextServerId += 1;
      const id = `lean-browser:${nextServerId}`;
      serverRequests.set(id, message.id);
      emit({ ...message, id });
      return;
    }
    if (!message.method && message.id !== undefined) {
      // 文件进程的 initialize 响应只是内部握手；客户端已经收到 bootstrap 的结果。
      if (message.id === INTERNAL_INIT_ID) {
        if (message.error) {
          fail(`Lean document process failed to initialize: ${message.error.message}`);
        }
        return;
      }
      pending.delete(message.id);
    }
    emit(message);
  };

  const canonicalDocumentUri = (message: LspMessage): LspMessage => {
    // Monaco 的 URI 可能被小写化；FileWorker 必须始终收到 didOpen 时的原始 URI。
    const uri = message.params?.textDocument?.uri;
    if (
      message.method !== 'textDocument/didOpen' &&
      active &&
      typeof uri === 'string' &&
      uri.toLowerCase() === active.uri.toLowerCase()
    ) {
      return {
        ...message,
        params: {
          ...message.params,
          textDocument: { ...message.params?.textDocument, uri: active.uri },
        },
      };
    }
    return message;
  };

  const forward = (raw: LspMessage): void => {
    const message = canonicalDocumentUri(raw);
    if (message.id !== undefined && !message.method) {
      const id = serverRequests.get(String(message.id));
      if (id !== undefined) {
        serverRequests.delete(String(message.id));
        fileProcess?.send({ ...message, id });
      }
      return;
    }
    if (message.method === '$/cancelRequest') {
      // 服务端请求对客户端用的是重写后的 ID；取消时也要映射回 Lean 进程的原始 ID。
      const requested = message.params?.id;
      if (typeof requested === 'string') {
        const id = serverRequests.get(requested);
        if (id !== undefined) {
          serverRequests.delete(requested);
          fileProcess?.send({ ...message, params: { ...message.params, id } });
          return;
        }
      }
    }
    if (message.id !== undefined && UNSUPPORTED_METHODS.has(message.method ?? '')) {
      emitError(message.id, -32601, 'This operation requires the native Lean project watchdog.');
      return;
    }
    if (!fileProcess) {
      if (early.length >= MAX_EARLY_REQUESTS)
        throw new Error('Too many Lean requests before didOpen.');
      early.push(message);
      return;
    }
    const uri = message.params?.textDocument?.uri;
    if (uri && uri !== active?.uri) {
      if (message.id !== undefined)
        emitError(message.id, -32801, 'Lean LSP has a different active document.');
      return;
    }
    if (message.id !== undefined) pending.add(message.id);
    fileProcess.send(message);
  };

  /**
   * 重启风暴保护：时间窗内超过上限说明 FileWorker 无法稳定启动，
   * 继续重开只会不断挂载上百 MB 的库并拖垮标签页。
   */
  const allowRestart = (): boolean => {
    const at = now();
    restartTimestamps = restartTimestamps.filter((stamp) => at - stamp < restartWindowMs);
    if (restartTimestamps.length >= maxRestarts) return false;
    restartTimestamps.push(at);
    return true;
  };

  const openDocument = async (document: ActiveDocument): Promise<void> => {
    if (!initializeParams)
      throw new Error('Lean LSP must be initialized before opening a document.');
    const url = new URL(document.uri);
    if (
      url.protocol !== 'file:' ||
      url.host ||
      !url.pathname.endsWith('.lean') ||
      typeof document.text !== 'string' ||
      // 环形缓冲按 UTF-8 字节计容量；非 ASCII 文档不能按 UTF-16 长度放行。
      new TextEncoder().encode(document.text).byteLength > MAX_DOCUMENT_BYTES
    ) {
      throw new Error('Lean LSP requires a local .lean document of at most 8 MiB (UTF-8).');
    }
    cancelPending('Lean document process was replaced.');
    fileProcess?.dispose();
    serverRequests.clear();
    active = { ...document };
    generation += 1;
    const token = generation;
    const startedAt = now();

    const process = factory(['-j4', '--worker', document.uri], {
      onMessage: (message) => {
        if (token === generation) fileOutput(message);
      },
      onExit: (code) => {
        if (token !== generation) return;
        process.dispose();
        fileProcess = undefined;
        if (code === RESTART_EXIT_CODE && active) {
          // FileWorker 在 import / 头部状态变化时请求重启：重开进程并重放 initialize + didOpen。
          // 正常编辑造成的重启不计入风暴，否则用户连续改几次 import 就会被误判。
          if (now() - startedAt < FAST_RESTART_MS && !allowRestart()) {
            fail(
              `Lean document process restarted ${maxRestarts} times within ${Math.round(restartWindowMs / 1000)}s; giving up.`,
            );
            return;
          }
          const restart = openDocument(active);
          restarting = restart;
          void restart.catch(fail).finally(() => {
            if (restarting === restart) restarting = undefined;
          });
        } else {
          fail(`Lean document process exited with code ${code}.`);
        }
      },
      onFailure: (message) => {
        if (token === generation) fail(message);
      },
    });
    fileProcess = process;
    try {
      await process.ready;
    } catch (cause) {
      // 更新的 didOpen 可能在加载期间替换了它；有意的 dispose 不能变成致命错误。
      if (token !== generation) return;
      throw cause;
    }
    if (token !== generation) return;
    process.send({
      jsonrpc: '2.0',
      id: INTERNAL_INIT_ID,
      method: 'initialize',
      params: initializeParams,
    });
    process.send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: active },
    });
    for (const message of early.splice(0)) forward(message);
  };

  const startBootstrap = (): LeanProcess => {
    const process = factory(['-j2', '--server'], {
      onMessage: (message) => {
        if (!message.method && message.id === initializeId && message.result) {
          // 这些能力属于原生 watchdog，不属于 FileWorker。
          const capabilities = { ...message.result.capabilities };
          for (const key of WATCHDOG_CAPABILITIES) delete capabilities[key];
          delete capabilities.experimental;
          initialized = true;
          emit({ ...message, result: { ...message.result, capabilities } });
          bootstrap?.dispose();
          bootstrap = undefined;
        } else {
          emit(message);
        }
      },
      onExit: (code) => {
        if (bootstrap === process) fail(`Lean initialization process exited with code ${code}.`);
      },
      onFailure: fail,
    });
    return process;
  };

  const handle = async (raw: LspMessage): Promise<void> => {
    const message = canonicalDocumentUri(raw);
    switch (message.method) {
      case 'initialize': {
        if (!bootstrap || initializeParams) throw new Error('Lean LSP is already initialized.');
        initializeParams = message.params;
        initializeId = message.id;
        bootstrap.send(message);
        return;
      }
      case 'initialized':
      case 'exit':
        return;
      case 'textDocument/didOpen': {
        const document = message.params?.textDocument as unknown as ActiveDocument;
        await openDocument(document);
        return;
      }
      case 'textDocument/didClose': {
        if (message.params?.textDocument?.uri === active?.uri) {
          generation += 1;
          fileProcess?.dispose();
          fileProcess = undefined;
          active = undefined;
          cancelPending('Lean document was closed.');
          serverRequests.clear();
        }
        return;
      }
      case 'textDocument/didChange': {
        if (!active || message.params?.textDocument?.uri !== active.uri) return;
        // 保留当前缓冲区，供 FileWorker 请求重启时重放；增量编辑原样转发给 Lean 处理。
        for (const change of message.params.contentChanges ?? []) {
          active.text = change.range
            ? active.text.slice(0, offsetOf(active.text, change.range.start)) +
              change.text +
              active.text.slice(offsetOf(active.text, change.range.end))
            : change.text;
        }
        const version = message.params.textDocument.version;
        if (typeof version === 'number') active.version = version;
        forward(message);
        return;
      }
      case 'shutdown': {
        generation += 1;
        disposeProcesses();
        cancelPending('Lean LSP shut down.', true);
        if (message.id !== undefined)
          emit({ jsonrpc: '2.0', id: message.id, result: null as never });
        return;
      }
      default:
        forward(message);
    }
  };

  // 保持消息顺序：文档进程准备期间，后续消息排队。
  let queued: Promise<void> = Promise.resolve();
  const write = (raw: Message): Promise<void> => {
    if (disposed) return Promise.reject(new Error(terminalError ?? 'Lean LSP is closed.'));
    const message = raw as unknown as LspMessage;
    if (message.method && message.id !== undefined) inflight.add(message.id);
    queued = queued
      .then(async () => {
        await restarting;
        if (terminalError !== undefined) {
          if (message.id !== undefined && message.method)
            emitError(message.id, -32603, terminalError);
          return;
        }
        await handle(message);
      })
      .catch((cause: unknown) => {
        if (message.id !== undefined && message.method)
          emitError(message.id, -32603, String(cause));
        fail(cause);
      });
    return Promise.resolve();
  };

  bootstrap = startBootstrap();
  try {
    await bootstrap.ready;
  } catch (cause) {
    dispose();
    throw cause;
  }
  if (disposed) throw new Error(terminalError ?? 'Lean LSP was disposed during startup.');

  return {
    transport: {
      reader: {
        onClose: closed.event,
        onError: readerError.event,
        onPartialMessage: readerPartial.event,
        listen(callback) {
          receive = callback;
          return {
            dispose() {
              if (receive === callback) receive = undefined;
            },
          };
        },
        dispose() {
          receive = undefined;
        },
      },
      writer: {
        onError: writerError.event,
        onClose: closed.event,
        write,
        end: dispose,
        dispose,
      },
    },
    sampleMemoryBytes: () => fileProcess?.sampleMemoryBytes?.() ?? Promise.resolve(null),
    dispose,
  };
};
