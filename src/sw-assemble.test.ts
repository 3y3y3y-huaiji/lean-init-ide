// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadRangedAsset, type AssembleOptions } from './sw-assemble';

const body = (length: number) =>
  Uint8Array.from({ length }, (_, index) => index % 251).buffer as ArrayBuffer;

const request = (signal?: AbortSignal) =>
  new Request('https://example.test/wasm-lean4/asset.bin', signal ? { signal } : undefined);

const createOptions = (overrides: Partial<AssembleOptions> = {}): AssembleOptions => ({
  request: request(),
  name: 'asset.bin',
  bytes: 3,
  origin: 'https://example.test',
  sources: [{ label: 'primary', url: '/cdn/asset' }],
  download: vi.fn(async () => [body(3)]),
  onFallback: vi.fn(),
  fallbackFetch: vi.fn(async () => new Response('fallback')),
  ...overrides,
});

describe('loadRangedAsset', () => {
  it('主源成功时直接返回组装好的响应', async () => {
    const options = createOptions();
    const response = await loadRangedAsset(options);

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2]));
    expect(response.url).toBe('https://example.test/wasm-lean4/asset.bin');
    expect(options.onFallback).not.toHaveBeenCalled();
    expect(options.download).toHaveBeenCalledWith(
      'https://example.test/cdn/asset',
      3,
      options.request.signal,
      expect.any(Function),
    );
  });

  it('主源失败后按顺序切到下一个源，并报告回退原因', async () => {
    const download = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([body(3)]);
    const options = createOptions({
      sources: [
        { label: 'primary', url: '/cdn/asset' },
        { label: 'mirror', url: 'https://mirror.test/asset' },
      ],
      download,
    });

    const response = await loadRangedAsset(options);

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2]));
    expect(options.onFallback).toHaveBeenCalledWith('asset.bin', 'primary 不可用：network down');
    expect(download).toHaveBeenLastCalledWith(
      'https://mirror.test/asset',
      3,
      options.request.signal,
      expect.any(Function),
    );
  });

  it('所有远端源失败时回退到同源 fetch', async () => {
    const options = createOptions({
      download: vi.fn(async () => {
        throw new Error('boom');
      }),
    });

    const response = await loadRangedAsset(options);

    expect(await response.text()).toBe('fallback');
    expect(options.fallbackFetch).toHaveBeenCalledWith(options.request);
    expect(options.onFallback).toHaveBeenCalledTimes(2);
    expect(options.onFallback).toHaveBeenLastCalledWith(
      'asset.bin',
      '远端源均失败，回退同源：boom',
    );
  });

  it('组装字节数与清单不符时按失败处理', async () => {
    const download = vi
      .fn()
      .mockResolvedValueOnce([body(2)])
      .mockResolvedValueOnce([body(3)]);
    const options = createOptions({
      download,
      sources: [
        { label: 'primary', url: '/cdn/asset' },
        { label: 'fallback', url: '/other/asset' },
      ],
    });

    const response = await loadRangedAsset(options);

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2]));
    expect(options.onFallback).toHaveBeenCalledWith(
      'asset.bin',
      'primary 不可用：assembled 2 bytes, expected 3',
    );
  });

  it('请求被取消时直接抛出，不再尝试其他源', async () => {
    const controller = new AbortController();
    controller.abort();
    const options = createOptions({
      request: request(controller.signal),
      download: vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError');
      }),
    });

    await expect(loadRangedAsset(options)).rejects.toThrow();
    expect(options.onFallback).not.toHaveBeenCalled();
    expect(options.download).toHaveBeenCalledTimes(1);
  });

  it('把进度按源粒度上报', async () => {
    const onProgress = vi.fn();
    const options = createOptions({
      onProgress,
      download: vi.fn(async (_url, _total, _signal, progress) => {
        progress(1, 3);
        progress(3, 3);
        return [body(3)];
      }),
    });

    await loadRangedAsset(options);

    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3, { label: 'primary', url: '/cdn/asset' });
    expect(onProgress).toHaveBeenNthCalledWith(2, 3, 3, { label: 'primary', url: '/cdn/asset' });
  });
});
