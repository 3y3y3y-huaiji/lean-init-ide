import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerState = vi.hoisted(() => ({ instances: [] as unknown[] }));

vi.mock('./wasm64-process-worker.ts?worker', () => {
  class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    readonly posted: unknown[] = [];
    terminated = false;
    constructor(readonly options?: { name?: string }) {
      workerState.instances.push(this);
    }
    postMessage(message: unknown): void {
      this.posted.push(message);
    }
    terminate(): void {
      this.terminated = true;
    }
  }
  return { default: FakeWorker };
});

import { RING_CONTROL_BYTES, encodeFrame } from './lean-wasm64-frames';
import { createWasm64ProcessFactory } from './wasm64-process';
import type { LspMessage } from './lean-wasm64-supervisor';

type FakeWorker = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  readonly posted: unknown[];
  terminated: boolean;
  readonly options?: { name?: string };
};

type StartMessage = {
  type: string;
  glueUrl: string;
  wasmModule: WebAssembly.Module;
  library: Record<string, Uint8Array>;
  stdin: { buffer: SharedArrayBuffer; capacity: number };
  args: readonly string[];
};

const RING_BYTES = 8 * 1024 * 1024 + 8192;

const workers = (): FakeWorker[] => workerState.instances as FakeWorker[];

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const setup = (startupTimeoutMs = 60_000) => {
  const messages: LspMessage[] = [];
  const failures: string[] = [];
  const exits: number[] = [];
  const memory: number[] = [];
  const factory = createWasm64ProcessFactory(
    {
      glueUrl: 'blob:https://example.test/glue64',
      wasmModule: {} as WebAssembly.Module,
      library: { 'lean-init-64.index.json': new Uint8Array([1]) },
      dispose: vi.fn(),
    },
    { startupTimeoutMs, onMemoryBytes: (bytes) => memory.push(bytes) },
  );
  const process = factory(['-j2', '--server'], {
    onMessage: (message) => messages.push(message),
    onExit: (code) => exits.push(code),
    onFailure: (message) => failures.push(message),
  });
  return { process, messages, failures, exits, memory, worker: workers().at(-1)! };
};

const post = (worker: FakeWorker, data: unknown): void => {
  worker.onmessage?.({ data } as MessageEvent);
};

beforeEach(() => {
  workerState.instances.length = 0;
});

describe('createWasm64ProcessFactory', () => {
  it('启动消息带上运行时、stdin 环形缓冲与进程参数', () => {
    const { worker } = setup();
    const start = worker.posted[0] as StartMessage;

    expect(worker.options?.name).toBe('lean-wasm64 -j2 --server');
    expect(start.type).toBe('start');
    expect(start.glueUrl).toBe('blob:https://example.test/glue64');
    expect(start.args).toEqual(['-j2', '--server']);
    expect(start.stdin.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(start.stdin.capacity).toBe(RING_BYTES);
  });

  it('ready 后 resolve，stdout 分帧后逐条回调', async () => {
    const { process, messages, worker } = setup();
    let ready = false;
    void process.ready.then(() => {
      ready = true;
    });

    post(worker, { ready: true });
    await flush();
    expect(ready).toBe(true);

    post(worker, { stdout: encodeFrame({ jsonrpc: '2.0', id: 1, result: { ok: true } }) });
    expect(messages).toEqual([{ jsonrpc: '2.0', id: 1, result: { ok: true } }]);
  });

  it('内存事件转给守卫；exit:0 是伪退出被忽略，非零退出上报', () => {
    const { memory, exits, worker } = setup();

    post(worker, { memoryBytes: 1234 });
    post(worker, { exit: 0 });
    expect(exits).toEqual([]);

    post(worker, { exit: 2 });
    expect(exits).toEqual([2]);
    expect(memory).toEqual([1234]);
  });

  it('failure 让 ready 拒绝并上报，且清理启动计时器', async () => {
    vi.useFakeTimers();
    try {
      const { process, failures, worker } = setup(1000);
      const rejection = process.ready.catch((error: Error) => error);

      post(worker, { failure: 'boom' });

      expect(((await rejection) as Error).message).toBe('boom');
      expect(failures).toEqual(['boom']);
      expect(worker.terminated).toBe(true);

      await vi.advanceTimersByTimeAsync(2000);
      expect(failures).toEqual(['boom']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('启动超时让 ready 拒绝并上报一次', async () => {
    vi.useFakeTimers();
    try {
      const { process, failures } = setup(50);
      const rejection = process.ready.catch((error: Error) => error);

      await vi.advanceTimersByTimeAsync(50);

      expect(((await rejection) as Error).message).toContain('startup timed out');
      expect(failures).toEqual(['Lean wasm64 process startup timed out.']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('send 把 LSP 帧写入共享环形缓冲', () => {
    const { process, worker } = setup();
    const start = worker.posted[0] as StartMessage;

    process.send({ jsonrpc: '2.0', id: 1, method: 'initialize' });

    const control = new Int32Array(start.stdin.buffer, 0, 4);
    const written = Atomics.load(control, 0);
    const text = new TextDecoder().decode(
      new Uint8Array(start.stdin.buffer, RING_CONTROL_BYTES, written),
    );
    expect(text).toContain('Content-Length: ');
    expect(text).toContain('"method":"initialize"');
  });

  it('dispose 终止 Worker，之后的 stdout/exit 不再回调', async () => {
    const { process, messages, exits, worker } = setup();
    const rejection = process.ready.catch((error: Error) => error);

    process.dispose();
    expect(worker.terminated).toBe(true);

    post(worker, { stdout: encodeFrame({ jsonrpc: '2.0', id: 1, result: {} }) });
    post(worker, { exit: 3 });

    expect(messages).toEqual([]);
    expect(exits).toEqual([]);
    expect(((await rejection) as Error).name).toBe('AbortError');
  });

  it('worker.onerror 解包错误后上报', () => {
    const { process, failures, worker } = setup();
    void process.ready.catch(() => undefined);
    const preventDefault = vi.fn();

    worker.onerror?.({
      preventDefault,
      error: new Error('RangeError: Maximum call stack size exceeded'),
      message: 'ignored',
    } as unknown as ErrorEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(failures[0]).toContain('RangeError: Maximum call stack size exceeded');
    expect(worker.terminated).toBe(true);
  });
});
