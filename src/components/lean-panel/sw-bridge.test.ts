import { describe, expect, it, vi } from 'vitest';
import { zh } from '../../i18n/zh';
import { createSwBridge } from './sw-bridge';

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

const createFakeSw = (failRegister = false) => {
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    register: failRegister
      ? vi.fn().mockRejectedValue(new Error('sw blocked'))
      : vi.fn().mockResolvedValue({}),
    ready: Promise.resolve({} as ServiceWorkerRegistration),
    addEventListener: (_: string, listener: (event: MessageEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MessageEvent) => void) =>
      listeners.delete(listener),
    emit: (data: unknown) => {
      for (const listener of listeners) listener({ data } as MessageEvent);
    },
    listenerCount: () => listeners.size,
  };
};

describe('createSwBridge', () => {
  const t = zh.playground;

  it('按架构过滤进度消息、统计遥测并在 dispose 时注销监听', async () => {
    const sw = createFakeSw();
    const logs: string[] = [];
    const statuses: Array<{ text: string; kind: string }> = [];
    const progresses: Array<number | null> = [];
    const trackEvent = vi.fn();

    const bridge = createSwBridge({
      t,
      getSelectedArch: () => 'wasm32',
      log: (m) => logs.push(m),
      setStatus: (text, kind) => statuses.push({ text, kind }),
      setProgress: (ratio) => progresses.push(ratio),
      trackEvent,
      serviceWorker: sw as never,
      perfNow: () => 100,
    });
    await flush();
    expect(logs[0]).toBe(t.logSwReady);
    expect(trackEvent).toHaveBeenCalledWith('sw', expect.objectContaining({ ok: true }));

    // 非当前架构消息被忽略。
    sw.emit({
      type: 'lean-asset-progress',
      arch: 'wasm64',
      name: 'a',
      loaded: 10,
      total: 100,
    });
    expect(bridge.hasAssetProgress()).toBe(false);

    // 命中回退事件并记录。
    sw.emit({
      type: 'lean-asset-fallback',
      arch: 'wasm32',
      name: 'init-00.pack',
      message: 'r2 timeout',
    });
    expect(bridge.getLastAssetFallback()).toEqual({ name: 'init-00.pack', message: 'r2 timeout' });

    // 分片进度与完成状态。
    sw.emit({
      type: 'lean-asset-progress',
      arch: 'wasm32',
      name: 'init-00.pack',
      loaded: 1024 * 1024,
      total: 10 * 1024 * 1024,
      source: 'cdn',
    });
    expect(bridge.hasAssetProgress()).toBe(true);
    expect(statuses.at(-1)?.text).toBe(t.statusChunks('1.0', '10.0'));
    expect(progresses.at(-1)).toBeCloseTo(0.1);

    sw.emit({
      type: 'lean-asset-progress',
      arch: 'wasm32',
      name: 'init-00.pack',
      loaded: 10 * 1024 * 1024,
      total: 10 * 1024 * 1024,
    });
    expect(statuses.at(-1)?.text).toBe(t.statusStarting);
    expect(progresses.at(-1)).toBe(1);
    expect(trackEvent).toHaveBeenCalledWith(
      'assets',
      expect.objectContaining({ phase: 'complete', arch: 'wasm32' }),
    );

    bridge.resetProgressState();
    bridge.clearLastAssetFallback();
    expect(bridge.hasAssetProgress()).toBe(false);
    expect(bridge.getLastAssetFallback()).toBeNull();

    bridge.dispose();
    expect(sw.listenerCount()).toBe(0);
  });

  it('Service Worker 注册失败时记录日志并上报 failed telemetry', async () => {
    const sw = createFakeSw(true);
    const logs: string[] = [];
    const trackEvent = vi.fn();
    const bridge = createSwBridge({
      t,
      getSelectedArch: () => 'wasm32',
      log: (m) => logs.push(m),
      setStatus: () => {},
      setProgress: () => {},
      trackEvent,
      serviceWorker: sw as never,
    });
    await flush();
    expect(logs[0]).toContain('sw blocked');
    expect(trackEvent).toHaveBeenCalledWith(
      'sw',
      expect.objectContaining({ ok: false, message: 'sw blocked' }),
    );
    bridge.dispose();
  });
});
