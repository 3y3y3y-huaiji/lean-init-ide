import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRuntimeCache } from './runtime-cache';

describe('clearRuntimeCache', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('只删除 wasm-idle 运行时命名空间，保留站点偏好缓存', async () => {
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => ['wasm-idle-assets-v1:wasm-idle', 'lean-source', 'other'],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });

    await clearRuntimeCache();

    expect(deleted).toEqual(['wasm-idle-assets-v1:wasm-idle']);
  });

  it('没有 CacheStorage 时静默返回', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(clearRuntimeCache()).resolves.toBeUndefined();
  });
});
