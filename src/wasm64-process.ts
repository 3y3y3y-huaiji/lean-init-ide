/**
 * 实验性 wasm64：LeanProcessFactory 的浏览器实现——每个进程一个 Worker + 共享 stdin 环形缓冲。
 */
import Wasm64ProcessWorker from './wasm64-process-worker.ts?worker';
import { formatWorkerError } from './wasm64-error';
import { FrameDecoder, RING_CONTROL_BYTES, RingWriter, encodeFrame } from './lean-wasm64-frames';
import type { LoadedWasm64Runtime } from './lean-wasm64-runtime';
import type { LeanProcessFactory, LspMessage } from './lean-wasm64-supervisor';

/** stdin 容量：单帧上限同时约束 didOpen 的文本大小（上层已限制 8 MiB）。 */
const RING_BYTES = 8 * 1024 * 1024 + 8192;

type ProcessEvent = {
  ready?: true;
  stdout?: Uint8Array;
  stderr?: string;
  exit?: number;
  failure?: string;
  memoryBytes?: number;
};

export type Wasm64ProcessHooks = {
  onMemoryBytes?: (bytes: number) => void;
  startupTimeoutMs: number;
};

export const createWasm64ProcessFactory =
  (runtime: LoadedWasm64Runtime, hooks: Wasm64ProcessHooks): LeanProcessFactory =>
  (args, callbacks) => {
    const worker = new Wasm64ProcessWorker({ name: `lean-wasm64 ${args.join(' ')}` });
    const ringBuffer = new SharedArrayBuffer(RING_CONTROL_BYTES + RING_BYTES);
    const ring = new RingWriter(ringBuffer, RING_BYTES);
    const decoder = new FrameDecoder();
    let disposed = false;
    let resolveReady: () => void = () => undefined;
    let rejectReady: (reason: Error) => void = () => undefined;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const startupTimer = setTimeout(
      () => fail('Lean wasm64 process startup timed out.'),
      hooks.startupTimeoutMs,
    );

    const fail = (message: string): void => {
      if (disposed) return;
      rejectReady(new Error(message));
      // 失败即终止 Worker，避免调用方只上报错误却留下一个仍在跑的 Lean 进程。
      dispose();
      callbacks.onFailure(message);
    };

    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      clearTimeout(startupTimer);
      rejectReady(new DOMException('Lean process was disposed.', 'AbortError'));
      ring.close();
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<ProcessEvent>) => {
      if (disposed) return;
      const data = event.data;
      try {
        if (data.ready) {
          clearTimeout(startupTimer);
          resolveReady();
        }
        if (typeof data.memoryBytes === 'number') hooks.onMemoryBytes?.(data.memoryBytes);
        if (data.stdout) {
          for (const message of decoder.push(data.stdout))
            callbacks.onMessage(message as LspMessage);
        }
        if (typeof data.stderr === 'string' && data.stderr) {
          console.warn('Lean 4 (wasm64):', data.stderr.slice(0, 4096));
        }
        // exit:0 是 PROXY_TO_PTHREAD 派发完成的伪退出，真实进程仍在 pthread 上跑。
        if (typeof data.exit === 'number' && data.exit !== 0) callbacks.onExit(data.exit);
        if (typeof data.failure === 'string') fail(data.failure);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      fail(
        formatWorkerError(
          event.error ?? event,
          event.message || 'Lean wasm64 process worker failed.',
        ),
      );
    };

    worker.postMessage({
      type: 'start',
      glueUrl: runtime.glueUrl,
      wasmModule: runtime.wasmModule,
      library: runtime.library,
      stdin: { buffer: ringBuffer, capacity: RING_BYTES },
      args,
    });

    return {
      ready,
      send(message) {
        if (disposed) return;
        try {
          ring.write(encodeFrame(message));
        } catch (error) {
          fail(error instanceof Error ? error.message : String(error));
        }
      },
      dispose,
    };
  };
