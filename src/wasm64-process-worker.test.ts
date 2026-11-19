import { afterEach, describe, expect, it, vi } from 'vitest';
import { unpackLibrary } from './wasm64-process-worker';

const sharedCopy = (bytes: Uint8Array): Uint8Array => {
  const view = new Uint8Array(new SharedArrayBuffer(bytes.byteLength));
  view.set(bytes);
  return view;
};

const encodeIndex = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

/** 还原浏览器行为：TextDecoder.decode 拒绝 SharedArrayBuffer 视图。 */
class SharedRejectingTextDecoder extends TextDecoder {
  decode(input?: AllowSharedBufferSource, options?: TextDecodeOptions): string {
    const buffer =
      input instanceof ArrayBuffer || input instanceof SharedArrayBuffer ? input : input?.buffer;
    if (buffer instanceof SharedArrayBuffer) {
      throw new TypeError('The provided ArrayBufferView value must not be shared.');
    }
    return super.decode(input, options);
  }
}

describe('unpackLibrary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('索引位于 SharedArrayBuffer 时仍可解码，并重组跨分片文件', () => {
    vi.stubGlobal('TextDecoder', SharedRejectingTextDecoder);
    const index = {
      chunks: [{ path: 'chunk.zst', offset: 0, uncompressedBytes: 6 }],
      files: [
        { path: 'Init/A.olean', offset: 0, bytes: 2 },
        { path: 'Init/B.olean', offset: 2, bytes: 4 },
      ],
    };
    const library = {
      'lean-init-64.index.json': sharedCopy(encodeIndex(index)),
      chunk: sharedCopy(new Uint8Array([1, 2, 3, 4, 5, 6])),
    };

    const files = unpackLibrary(library);

    expect(files.map((file) => file.path)).toEqual(['Init/A.olean', 'Init/B.olean']);
    expect([...files[0]!.bytes]).toEqual([1, 2]);
    expect([...files[1]!.bytes]).toEqual([3, 4, 5, 6]);
    // 写进 MEMFS 的必须是普通缓冲，不能继续引用共享内存。
    expect(files[0]!.bytes.buffer).not.toBeInstanceOf(SharedArrayBuffer);
  });

  it('分片索引顺序颠倒时仍按偏移量拼接', () => {
    const index = {
      chunks: [
        { path: 'right.zst', offset: 2, uncompressedBytes: 4 },
        { path: 'left.zst', offset: 0, uncompressedBytes: 2 },
      ],
      files: [{ path: 'Init/C.olean', offset: 0, bytes: 6 }],
    };
    const library = {
      'lean-init-64.index.json': encodeIndex(index),
      left: new Uint8Array([1, 2]),
      right: new Uint8Array([3, 4, 5, 6]),
    };

    const files = unpackLibrary(library);

    expect([...files[0]!.bytes]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('索引缺失或长度不符时拒绝启动', () => {
    expect(() => unpackLibrary({})).toThrow(/索引缺失/);

    expect(() =>
      unpackLibrary({
        'lean-init-64.index.json': encodeIndex({
          chunks: [{ path: 'chunk.zst', offset: 0, uncompressedBytes: 8 }],
          files: [],
        }),
        chunk: new Uint8Array(4),
      }),
    ).toThrow(/长度不符/);

    expect(() =>
      unpackLibrary({
        'lean-init-64.index.json': encodeIndex({
          chunks: [{ path: 'chunk.zst', offset: 0, uncompressedBytes: 4 }],
          files: [{ path: '../etc/passwd', offset: 0, bytes: 4 }],
        }),
        chunk: new Uint8Array(4),
      }),
    ).toThrow(/非法/);

    expect(() =>
      unpackLibrary({
        'lean-init-64.index.json': encodeIndex({
          chunks: [{ path: 'chunk.zst', offset: 0, uncompressedBytes: 2 }],
          files: [{ path: 'Init/Short.olean', offset: 0, bytes: 4 }],
        }),
        chunk: new Uint8Array(2),
      }),
    ).toThrow(/被截断/);
  });
});

describe('wasm64-process-worker 消息与运行生命周期', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const loadWorkerWithGlue = async (glueSource: string) => {
    vi.resetModules();
    const posted: unknown[] = [];
    const listeners = new Map<string, (event: unknown) => void>();
    const fakeSelf = {
      postMessage: vi.fn((message: unknown) => {
        posted.push(message);
      }),
      addEventListener: vi.fn((type: string, handler: (event: unknown) => void) => {
        listeners.set(type, handler);
      }),
      onmessage: null as ((event: MessageEvent) => void) | null,
    };
    vi.stubGlobal('self', fakeSelf);
    await import('./wasm64-process-worker');
    const glueUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(glueSource)}`;
    return { posted, listeners, fakeSelf, glueUrl };
  };

  it('启动后挂载 FS、重定向 stdout/stderr、响应 pollMemory 并在 ExitStatus 时正常结算', async () => {
    const glueSource = `
      export default async function createLean(opts) {
        const stream1 = { stream_ops: {} };
        const stream2 = { stream_ops: {} };
        const files = new Map();
        let captured = {};
        await opts.instantiateWasm({}, (inst) => { captured = inst; });
        opts.onMemoryResize(4096);
        opts.print('hello-out');
        opts.printErr('hello-err');
        return {
          wasmMemory: { buffer: new ArrayBuffer(8192) },
          FS: {
            mkdirTree: () => {},
            writeFile: (p, d) => files.set(p, d),
            chdir: () => {},
            getStream: (fd) => (fd === 1 ? stream1 : stream2),
          },
          callMain: () => {
            stream1.stream_ops.write(null, new Uint8Array([65, 66]), 0, 2);
            stream2.stream_ops.write(null, new TextEncoder().encode('warn'), 0, 4);
            opts.lspProcessExit(0);
            const err = new Error('exit');
            err.name = 'ExitStatus';
            err.status = 0;
            throw err;
          },
        };
      }
    `;
    const instantiateSpy = vi
      .spyOn(WebAssembly, 'instantiate')
      .mockResolvedValue({ exports: {} } as unknown as WebAssembly.Instance);

    const { posted, fakeSelf, glueUrl } = await loadWorkerWithGlue(glueSource);

    // pollMemory 在尚未启动时不发送消息。
    fakeSelf.onmessage?.({ data: { type: 'pollMemory' } } as MessageEvent);
    expect(posted).toEqual([]);

    const index = {
      chunks: [{ path: 'c.zst', offset: 0, uncompressedBytes: 2 }],
      files: [{ path: 'Init/A.olean', offset: 0, bytes: 2 }],
    };
    fakeSelf.onmessage?.({
      data: {
        type: 'start',
        glueUrl,
        wasmModule: {} as WebAssembly.Module,
        library: {
          'lean-init-64.index.json': encodeIndex(index),
          c: new Uint8Array([1, 2]),
        },
        stdin: { buffer: new SharedArrayBuffer(64), capacity: 32 },
        args: ['--server'],
      },
    } as MessageEvent);

    await vi.waitFor(() => expect(posted).toContainEqual({ ready: true, memoryBytes: 8192 }));
    expect(instantiateSpy).toHaveBeenCalledTimes(1);
    expect(posted).toContainEqual({ memoryBytes: 4096 });
    expect(posted).toContainEqual({ stderr: 'hello-out\n' });
    expect(posted).toContainEqual({ stderr: 'hello-err\n' });
    expect(posted).toContainEqual({ stderr: 'warn' });
    expect(posted).toContainEqual({ exit: 0 });

    const stdoutMsg = posted.find(
      (item): item is { stdout: Uint8Array } =>
        typeof item === 'object' && item !== null && 'stdout' in item,
    );
    expect([...(stdoutMsg?.stdout ?? [])]).toEqual([65, 66]);

    // activeLean 已就绪，再次 pollMemory 会上报当前内存。
    fakeSelf.onmessage?.({ data: { type: 'pollMemory' } } as MessageEvent);
    expect(posted.at(-1)).toEqual({ memoryBytes: 8192 });
  });

  it('捕获 error/unhandledrejection、callMain 非零返回、locateFile 与 instantiateWasm 异常', async () => {
    const glueSource = `
      export default async function createLean(opts) {
        opts.instantiateWasm({}, () => {});
        let locateErr = '';
        try { opts.locateFile('unexpected.data'); } catch (e) { locateErr = e.message; }
        opts.printErr(locateErr);
        return {
          FS: {
            mkdirTree: () => {},
            writeFile: () => {},
            chdir: () => {},
            getStream: () => ({ stream_ops: {} }),
          },
          callMain: () => 7,
        };
      }
    `;
    vi.spyOn(WebAssembly, 'instantiate').mockRejectedValue(new Error('wasm instantiate boom'));
    const { posted, listeners, fakeSelf, glueUrl } = await loadWorkerWithGlue(glueSource);

    const errPrevent = vi.fn();
    listeners.get('error')?.({
      preventDefault: errPrevent,
      error: new Error('worker crash'),
      message: 'worker crash',
    });
    expect(errPrevent).toHaveBeenCalled();

    const rejPrevent = vi.fn();
    listeners.get('unhandledrejection')?.({
      preventDefault: rejPrevent,
      reason: 'unhandled boom',
    });
    expect(rejPrevent).toHaveBeenCalled();

    fakeSelf.onmessage?.({
      data: {
        type: 'start',
        glueUrl,
        wasmModule: {} as WebAssembly.Module,
        library: { 'lean-init-64.index.json': encodeIndex({ chunks: [], files: [] }) },
        stdin: { buffer: new SharedArrayBuffer(64), capacity: 32 },
        args: ['--worker'],
      },
    } as MessageEvent);

    await vi.waitFor(() => expect(posted).toContainEqual({ failure: 'callMain 返回 7' }));
    expect(posted).toContainEqual({ stderr: 'Unexpected unverified Lean file: unexpected.data\n' });
    expect(
      posted.some(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          'failure' in item &&
          String((item as { failure: string }).failure).includes('wasm instantiate boom'),
      ),
    ).toBe(true);
  });

  it('callMain 抛出非 ExitStatus 异常时透传到 failure 上报', async () => {
    const glueSource = `
      export default async function createLean() {
        return {
          FS: {
            mkdirTree: () => {},
            writeFile: () => {},
            chdir: () => {},
            getStream: () => ({ stream_ops: {} }),
          },
          callMain: () => { throw new Error('unexpected callMain crash'); },
        };
      }
    `;
    const { posted, fakeSelf, glueUrl } = await loadWorkerWithGlue(glueSource);
    fakeSelf.onmessage?.({
      data: {
        type: 'start',
        glueUrl,
        wasmModule: {} as WebAssembly.Module,
        library: { 'lean-init-64.index.json': encodeIndex({ chunks: [], files: [] }) },
        stdin: { buffer: new SharedArrayBuffer(64), capacity: 32 },
        args: ['--server'],
      },
    } as MessageEvent);

    await vi.waitFor(() =>
      expect(
        posted.some(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            'failure' in item &&
            String((item as { failure: string }).failure).includes('unexpected callMain crash'),
        ),
      ).toBe(true),
    );
  });
});
