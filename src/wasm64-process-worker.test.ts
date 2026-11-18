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
  });
});
