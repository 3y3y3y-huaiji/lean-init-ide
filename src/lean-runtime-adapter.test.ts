import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLeanRuntime, type Wasm32ServerLoader } from './lean-runtime-adapter';
import { WASM32_MEMORY_BYTES } from './device';
import type { LeanSessionServer } from './lean-session';

type Wasm32ServerOptions = Exclude<Parameters<Wasm32ServerLoader>[0], string | undefined>;

class FakeWorker {
  readonly posted: unknown[] = [];
  private readonly listeners = new Set<(event: MessageEvent) => void>();

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  emit(data: unknown): void {
    for (const listener of this.listeners) listener({ data } as MessageEvent);
  }
}

const fakeServer = (): LeanSessionServer =>
  ({
    transport: {} as LeanSessionServer['transport'],
    dispose: vi.fn(),
  }) as unknown as LeanSessionServer;

describe('createLeanRuntime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('wasm32 模式透传 extensionPacks、内存事件与非阻塞 pollMemory 采样，并在 dispose 后清理', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const rawServer = fakeServer();
    const memoryEvents: number[] = [];
    const seenOptions: Wasm32ServerOptions[] = [];
    const sab = new SharedArrayBuffer(4);

    const handle = await createLeanRuntime({
      arch: 'wasm32',
      memoryTier: 'standard',
      extensionPacks: { 'lean-std.index.json': sab },
      activeExtensions: ['std'],
      onStatus: () => {},
      onMemoryBytes: (bytes) => memoryEvents.push(bytes),
      createWasm32Worker: () => worker as unknown as Worker,
      getWasm32Server: (async (options: Wasm32ServerOptions) => {
        seenOptions.push(options);
        options.createWorker!();
        return rawServer;
      }) as unknown as Wasm32ServerLoader,
    });

    expect(handle.arch).toBe('wasm32');
    expect(seenOptions[0]?.lean4?.maxMemoryBytes).toBe(WASM32_MEMORY_BYTES);
    expect(seenOptions[0]?.lean4?.extensionPacks?.['lean-std.index.json']).toBe(sab);

    worker.emit({ memoryBytes: 268_435_456 });
    expect(memoryEvents).toEqual([268_435_456]);

    // 主动采样命中对应的 memorySample 且不会再走事件回调。
    const samplePromise = handle.sampleMemoryBytes();
    expect(worker.posted).toEqual([{ type: 'pollMemory', id: 1 }]);
    worker.emit({ type: 'memorySample', id: 1, memoryBytes: 300_000_000 });
    expect(await samplePromise).toBe(300_000_000);
    expect(memoryEvents).toEqual([268_435_456]);

    // 超时场景安全返回 null。
    const timeoutSample = handle.sampleMemoryBytes();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await timeoutSample).toBeNull();

    // 在途采样遇到 dispose 立即收敛为 null，且后续采样直接返回 null。
    const inflight = handle.sampleMemoryBytes();
    handle.server.dispose();
    expect(await inflight).toBeNull();
    expect(rawServer.dispose).toHaveBeenCalledTimes(1);
    expect(await handle.sampleMemoryBytes()).toBeNull();
  });

  it('wasm64 模式转发状态/阶段/采样回调，并在启动失败时传播异常', async () => {
    const statuses: Array<{ state: string; message?: string }> = [];
    const stages: string[] = [];
    const memoryEvents: number[] = [];
    let onWasm64LoadingCalled = false;

    const baseServer = {
      ...fakeServer(),
      sampleMemoryBytes: vi.fn(async () => 512_000_000),
    };

    const handle = await createLeanRuntime({
      arch: 'wasm64',
      memoryTier: 'standard',
      extensionPacks: {},
      activeExtensions: ['mathlib'],
      onStatus: (status) => statuses.push(status),
      onMemoryBytes: (bytes) => memoryEvents.push(bytes),
      onWasm64LoadingLog: () => {
        onWasm64LoadingCalled = true;
      },
      onWasm64Stage: (stage) => stages.push(stage),
      isWasm64Available: () => true,
      createWasm64Server: async (opts) => {
        opts.onStage?.('init');
        opts.onMemoryBytes?.(400_000_000);
        opts.onError?.('late crash');
        return baseServer;
      },
    });

    expect(handle.arch).toBe('wasm64');
    expect(onWasm64LoadingCalled).toBe(true);
    expect(stages).toEqual(['init']);
    expect(memoryEvents).toEqual([400_000_000]);
    expect(statuses).toEqual([
      { state: 'loading' },
      { state: 'error', message: 'late crash' },
      { state: 'ready' },
    ]);
    expect(await handle.sampleMemoryBytes()).toBe(512_000_000);
  });

  it('wasm64 资产未发布时记日志并自动回退 wasm32；wasm32 启动失败清理 sampler', async () => {
    const worker = new FakeWorker();
    const fallbackLog = vi.fn();

    const handle = await createLeanRuntime({
      arch: 'wasm64',
      memoryTier: 'low',
      extensionPacks: {},
      activeExtensions: [],
      onStatus: () => {},
      onMemoryBytes: () => {},
      onWasm64FallbackLog: fallbackLog,
      isWasm64Available: () => false,
      createWasm32Worker: () => worker as unknown as Worker,
      getWasm32Server: (async (options: Wasm32ServerOptions) => {
        options.createWorker!();
        return fakeServer();
      }) as unknown as Wasm32ServerLoader,
    });
    expect(fallbackLog).toHaveBeenCalledTimes(1);
    expect(handle.arch).toBe('wasm32');
    handle.server.dispose();

    await expect(
      createLeanRuntime({
        arch: 'wasm32',
        memoryTier: 'standard',
        extensionPacks: {},
        activeExtensions: [],
        onStatus: () => {},
        onMemoryBytes: () => {},
        createWasm32Worker: () => worker as unknown as Worker,
        getWasm32Server: (async (options: Wasm32ServerOptions) => {
          options.createWorker!();
          throw new Error('boot failed');
        }) as unknown as Wasm32ServerLoader,
      }),
    ).rejects.toThrow('boot failed');
  });
});
