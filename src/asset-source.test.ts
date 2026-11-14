import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySourcePreference, setSourcePreference } from './asset-source';

const put = vi.fn<(key: string, response: Response) => Promise<void>>(() => Promise.resolve());
const remove = vi.fn<(key: string) => Promise<void>>(() => Promise.resolve());
const postMessage = vi.fn();

const stubCaches = () => {
  vi.stubGlobal('caches', {
    open: vi.fn(() => Promise.resolve({ put, delete: remove })),
  });
};

const stubController = () => {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { controller: { postMessage } },
    configurable: true,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  put.mockClear();
  remove.mockClear();
  postMessage.mockClear();
});

describe('applySourcePreference', () => {
  it('不带 source 参数时什么都不做', async () => {
    stubCaches();
    await applySourcePreference('?debug=1');
    expect(put).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('合法的 source 写入 CacheStorage 并通知 SW', async () => {
    stubCaches();
    stubController();
    await applySourcePreference('?source=mirror');

    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[0]).toBe('/__lean/source-preference');
    expect(postMessage).toHaveBeenCalledWith({ type: 'lean-source-mode', mode: 'mirror' });
  });

  it('非法 source 清掉旧配置，避免上一次诊断残留', async () => {
    stubCaches();
    stubController();
    await applySourcePreference('?source=whatever');

    expect(remove).toHaveBeenCalledWith('/__lean/source-preference');
    expect(postMessage).toHaveBeenCalledWith({ type: 'lean-source-mode', mode: null });
  });

  it('没有 CacheStorage 时静默失败', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(applySourcePreference('?source=cdn')).resolves.toBeUndefined();
  });
});

describe('setSourcePreference', () => {
  it('直接切换同源网关并通知 SW', async () => {
    stubCaches();
    stubController();
    await setSourcePreference('cdn');

    expect(put).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'lean-source-mode', mode: 'cdn' });
  });

  it('传 null 恢复自动选择', async () => {
    stubCaches();
    stubController();
    await setSourcePreference(null);

    expect(remove).toHaveBeenCalledWith('/__lean/source-preference');
    expect(postMessage).toHaveBeenCalledWith({ type: 'lean-source-mode', mode: null });
  });
});
