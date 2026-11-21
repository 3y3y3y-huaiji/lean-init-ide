/**
 * 统一 Lean 运行时适配层：收敛 wasm32（@wasm-idle/lsp）与实验性 wasm64 的启动、
 * 扩展包挂载、线性内存事件转发、主动采样（pollMemory）以及释放清理。
 */
import type { ExtensionPacks, RuntimeExtensionId } from './runtime-extensions';
import {
  cacheBudgetBytes,
  WASM32_MEMORY_BYTES,
  type LeanRuntimeArch,
  type MemoryTier,
} from './device';
import { createWorkerMemorySampler } from './lean-memory-guard';
import type { LeanSessionServer } from './lean-session';
import { wasm64Available } from './lean-wasm64-available';
import type { Wasm64SessionServer } from './lean-wasm64-supervisor';

export type EngineStatus = {
  readonly state: string;
  readonly message?: string;
};

export type LeanRuntimeHandle = {
  readonly arch: LeanRuntimeArch;
  readonly server: LeanSessionServer;
  /** 向活跃文件进程请求一次瞬时 wasmMemory.buffer.byteLength，不可用或释放后返回 null。 */
  readonly sampleMemoryBytes: () => Promise<number | null>;
};

export type Wasm32ServerLoader = typeof import('@wasm-idle/lsp/lean4').getLean4LanguageServer;
export type Wasm64ServerLoader = (options: {
  extensions?: readonly string[];
  onMemoryBytes?: (bytes: number) => void;
  onError?: (message: string) => void;
  onStage?: (stage: string) => void;
  startupTimeoutMs?: number;
}) => Promise<Wasm64SessionServer>;

export type CreateLeanRuntimeOptions = {
  readonly arch: LeanRuntimeArch;
  readonly memoryTier: MemoryTier;
  readonly extensionPacks: ExtensionPacks;
  readonly activeExtensions: readonly RuntimeExtensionId[];
  readonly startupTimeoutMs?: number;
  readonly assetTimeoutMs?: number;
  readonly onStatus: (status: EngineStatus) => void;
  readonly onMemoryBytes: (bytes: number) => void;
  readonly onWasm64FallbackLog?: () => void;
  readonly onWasm64LoadingLog?: () => void;
  readonly onWasm64Stage?: (stage: string) => void;
  readonly isWasm64Available?: () => boolean;
  readonly getWasm32Server?: Wasm32ServerLoader;
  readonly createWasm64Server?: Wasm64ServerLoader;
  readonly createWasm32Worker?: () => Worker;
};

type WorkerMemoryMessage = {
  readonly type?: unknown;
  readonly id?: unknown;
  readonly memoryBytes?: unknown;
};

const DEFAULT_TIMEOUT_MS = 60 * 60_000;

/** 按架构创建统一的 Lean LSP 运行时句柄，并保证 dispose 时清空采样器与事件监听。 */
export const createLeanRuntime = async (
  options: CreateLeanRuntimeOptions,
): Promise<LeanRuntimeHandle> => {
  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const assetTimeoutMs = options.assetTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (options.arch === 'wasm64') {
    const published = (options.isWasm64Available ?? wasm64Available)();
    if (published) {
      const loadWasm64 =
        options.createWasm64Server ??
        (await import('./lean-wasm64-server')).createWasm64LanguageServer;
      options.onStatus({ state: 'loading' });
      options.onWasm64LoadingLog?.();
      const server = await loadWasm64({
        extensions: [...options.activeExtensions],
        onMemoryBytes: options.onMemoryBytes,
        onError: (message) => options.onStatus({ state: 'error', message }),
        ...(options.onWasm64Stage ? { onStage: options.onWasm64Stage } : {}),
        startupTimeoutMs,
      });
      options.onStatus({ state: 'ready' });
      return {
        arch: 'wasm64',
        server,
        sampleMemoryBytes: () => server.sampleMemoryBytes?.() ?? Promise.resolve(null),
      };
    }
    options.onWasm64FallbackLog?.();
  }

  const workerRef: { current: Worker | null } = { current: null };
  const sampler = createWorkerMemorySampler((message) => workerRef.current?.postMessage(message));
  const onWorkerMessage = (event: MessageEvent<WorkerMemoryMessage>) => {
    const data = event.data;
    if (!data || sampler.handleMessage(data)) return;
    if (typeof data.memoryBytes === 'number') {
      options.onMemoryBytes(data.memoryBytes);
    }
  };

  try {
    const loadWasm32 =
      options.getWasm32Server ?? (await import('@wasm-idle/lsp/lean4')).getLean4LanguageServer;
    const workerFactory: () => Worker =
      options.createWasm32Worker ??
      (await import('../node_modules/@wasm-idle/lsp/dist/lean4/worker.js?worker').then(
        (mod) => () => new mod.default(),
      ));

    const rawServer = await loadWasm32({
      rootUrl: '/',
      startupTimeoutMs,
      assetTimeoutMs,
      persistentCache: {
        maxBytes: cacheBudgetBytes(options.memoryTier),
        maxEntryBytes: cacheBudgetBytes(options.memoryTier),
      },
      lean4: {
        maxMemoryBytes: WASM32_MEMORY_BYTES,
        ...(Object.keys(options.extensionPacks).length > 0
          ? { extensionPacks: options.extensionPacks }
          : {}),
      },
      createWorker: () => {
        workerRef.current?.removeEventListener('message', onWorkerMessage);
        const created = workerFactory();
        workerRef.current = created;
        created.addEventListener('message', onWorkerMessage);
        return created;
      },
      onStatus: options.onStatus,
    });

    const server: LeanSessionServer = {
      ...rawServer,
      dispose: () => {
        sampler.dispose();
        workerRef.current?.removeEventListener('message', onWorkerMessage);
        workerRef.current = null;
        rawServer.dispose();
      },
    };

    return {
      arch: 'wasm32',
      server,
      sampleMemoryBytes: () => (workerRef.current ? sampler.sample() : Promise.resolve(null)),
    };
  } catch (error) {
    sampler.dispose();
    workerRef.current?.removeEventListener('message', onWorkerMessage);
    workerRef.current = null;
    throw error;
  }
};
