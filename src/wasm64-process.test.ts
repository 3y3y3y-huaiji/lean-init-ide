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

  it('发送超过环形缓冲的帧时上报失败并终止 Worker', () => {
    const { process, failures, worker } = setup();
    void process.ready.catch(() => undefined);

    process.send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: { uri: 'file:///workspace/Main.lean', text: 'a'.repeat(9 * 1024 ** 2) },
      },
    });

    expect(failures[0]).toContain('超过缓冲区');
    expect(worker.terminated).toBe(true);
  });

  it('stdout 出现坏帧时上报失败并终止 Worker', () => {
    const { process, failures, worker } = setup();
    void process.ready.catch(() => undefined);
    const bad = Uint8Array.from('Content-Length: 4\r\n\r\n{oops', (char) => char.charCodeAt(0));

    post(worker, { stdout: bad });

    expect(failures[0]).toContain('无法解析的 LSP 帧');
    expect(worker.terminated).toBe(true);
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

    // disposed 后再 send、dispose 或触发 onerror/failure 均安全忽略。
    process.send({ jsonrpc: '2.0', id: 2, method: 'shutdown' });
    process.dispose();
    post(worker, { failure: 'ignored' });
  });

  it('stderr 输出记录警告日志，worker.onerror 无 error 对象时使用消息兜底', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { process, failures, worker } = setup();
    void process.ready.catch(() => undefined);

    post(worker, { stderr: 'diag line\n' });
    expect(warn).toHaveBeenCalledWith('Lean 4 (wasm64):', 'diag line\n');

    worker.onerror?.({
      preventDefault: vi.fn(),
      error: undefined,
      message: '',
    } as unknown as ErrorEvent);
    expect(failures).toEqual(['Lean wasm64 process worker failed.']);
    warn.mockRestore();
  });

  it('sampleMemoryBytes 发送 pollMemory 并接收 memorySample；超时与 dispose 安全返回 null', async () => {
    vi.useFakeTimers();
    try {
      const { process, worker, memory } = setup();
      void process.ready.catch(() => undefined);

      const samplePromise = process.sampleMemoryBytes!();
      expect(worker.posted.at(-1)).toEqual({ type: 'pollMemory', id: 1 });
      post(worker, { type: 'memorySample', id: 1, memoryBytes: 4096 });
      expect(await samplePromise).toBe(4096);
      // 定向采样不会重复触发广播回调，由 MemoryGuard.pollOnce 统一消费。
      expect(memory).toEqual([]);

      const timeoutPromise = process.sampleMemoryBytes!();
      await vi.advanceTimersByTimeAsync(1500);
      expect(await timeoutPromise).toBeNull();

      const pendingOnDispose = process.sampleMemoryBytes!();
      process.dispose();
      expect(await pendingOnDispose).toBeNull();
      expect(await process.sampleMemoryBytes!()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
