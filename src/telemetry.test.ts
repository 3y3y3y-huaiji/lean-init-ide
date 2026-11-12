import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Telemetry = typeof import('./telemetry');

const beacon = vi.fn<(url: string, data: Blob) => boolean>(() => true);
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() =>
  Promise.resolve(new Response(null, { status: 204 })),
);

const loadTelemetry = async (): Promise<Telemetry> => {
  vi.resetModules();
  return import('./telemetry');
};

const readBeaconBody = async (index: number): Promise<{ v: number; events: unknown[] }> => {
  const blob = beacon.mock.calls[index]?.[1];
  if (!blob) throw new Error(`第 ${index} 次 beacon 没有负载`);
  return JSON.parse(await blob.text()) as { v: number; events: unknown[] };
};

beforeEach(() => {
  beacon.mockClear();
  fetchMock.mockClear();
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
  Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('telemetry', () => {
  it('未初始化时不会上报', async () => {
    const { track, flushTelemetry } = await loadTelemetry();
    track('boot', { page: 'home' });
    flushTelemetry();
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Do Not Track 为 1 时整体关闭', async () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    const { initTelemetry, track, flushTelemetry } = await loadTelemetry();
    initTelemetry({ sampleRate: 1 });
    track('boot', { page: 'home' });
    flushTelemetry();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('采样率为 0 时普通指标被丢弃，但错误仍然上报', async () => {
    const { initTelemetry, track, reportError } = await loadTelemetry();
    initTelemetry({ sampleRate: 0 });
    track('boot', { page: 'home' });
    reportError('test', new Error('boom'));

    expect(beacon).toHaveBeenCalledTimes(1);
    const payload = await readBeaconBody(0);
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0]).toMatchObject({ name: 'runtime_error' });
  });

  it('按协议发送 v1 负载并清洗字段', async () => {
    const { initTelemetry, track, flushTelemetry } = await loadTelemetry();
    initTelemetry({ sampleRate: 1 });

    const long = 'x'.repeat(200);
    track('assets', {
      phase: 'complete',
      bytes: 1024.7,
      cached: true,
      note: long,
      'bad key': 'dropped',
      infinite: Number.POSITIVE_INFINITY,
      newline: 'a\nb',
    });
    flushTelemetry();

    expect(beacon).toHaveBeenCalledTimes(1);
    const [url] = beacon.mock.calls[0]!;
    expect(url).toBe('/api/telemetry');

    const payload = await readBeaconBody(0);
    expect(payload.v).toBe(1);
    const event = payload.events[0] as { name: string; fields: Record<string, unknown> };
    expect(event.name).toBe('assets');
    expect(event.fields.phase).toBe('complete');
    expect(event.fields.bytes).toBe(1025);
    expect(event.fields.cached).toBe(true);
    expect(String(event.fields.note)).toHaveLength(120);
    expect(event.fields.newline).toBe('a b');
    expect(event.fields).not.toHaveProperty('bad key');
    expect(event.fields).not.toHaveProperty('infinite');
  });

  it('没有有效字段时也照样上报事件', async () => {
    const { initTelemetry, track, flushTelemetry } = await loadTelemetry();
    initTelemetry({ sampleRate: 1 });
    track('boot', { 'bad key': 1 });
    flushTelemetry();

    const event = (await readBeaconBody(0)).events[0] as { fields?: unknown };
    expect(event.fields).toBeUndefined();
  });

  it('sendBeacon 返回 false 时回退到 keepalive fetch', async () => {
    beacon.mockReturnValueOnce(false);
    const { initTelemetry, track, flushTelemetry } = await loadTelemetry();
    initTelemetry({ sampleRate: 1 });
    track('boot', { page: 'home' });
    flushTelemetry();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/telemetry');
    expect(init?.keepalive).toBe(true);
  });

  it('每页最多上报 3 条错误', async () => {
    const { initTelemetry, reportError } = await loadTelemetry();
    initTelemetry({ sampleRate: 1 });
    for (let index = 0; index < 5; index += 1) reportError('loop', new Error(`e${index}`));
    expect(beacon).toHaveBeenCalledTimes(3);
  });

  it('单页事件数到达上限后停止入队', async () => {
    const { initTelemetry, track, flushTelemetry } = await loadTelemetry();
    initTelemetry({ sampleRate: 1 });
    for (let index = 0; index < 20; index += 1) track('assets', { index });
    flushTelemetry();

    expect(beacon).toHaveBeenCalledTimes(1);
    expect((await readBeaconBody(0)).events).toHaveLength(12);
  });

  it('pagehide 时用 beacon 强制发送', async () => {
    const { initTelemetry, track } = await loadTelemetry();
    initTelemetry({ sampleRate: 1 });
    track('boot', { page: 'home' });
    expect(beacon).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pagehide'));
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('捕获未处理 Promise 拒绝与 window 错误', async () => {
    // 直接取出注册的处理器：window 上的监听会跨测试累积，dispatch 真实事件会触发旧实例。
    const handlers: Array<{ type: string; handler: (event: Event) => void }> = [];
    const addSpy = vi.spyOn(window, 'addEventListener').mockImplementation(((
      type: string,
      handler: EventListenerOrEventListenerObject,
    ) => {
      handlers.push({ type, handler: handler as (event: Event) => void });
    }) as unknown as typeof window.addEventListener);

    const { initTelemetry } = await loadTelemetry();
    initTelemetry({ sampleRate: 1 });
    addSpy.mockRestore();

    handlers
      .find((entry) => entry.type === 'unhandledrejection')
      ?.handler(Object.assign(new Event('unhandledrejection'), { reason: new Error('rejected') }));
    handlers
      .find((entry) => entry.type === 'error')
      ?.handler(Object.assign(new Event('error'), { error: new Error('failed') }));

    expect(beacon).toHaveBeenCalledTimes(2);
    const first = (await readBeaconBody(0)).events[0] as { fields: Record<string, unknown> };
    const second = (await readBeaconBody(1)).events[0] as { fields: Record<string, unknown> };
    expect(first.fields.message).toBe('rejected');
    expect(second.fields.message).toBe('failed');
  });

  it('非 Error 的错误对象也能转成字符串上报', async () => {
    const { initTelemetry, reportError } = await loadTelemetry();
    initTelemetry({ sampleRate: 1 });
    reportError('raw', 'plain failure');

    const event = (await readBeaconBody(0)).events[0] as { fields: Record<string, unknown> };
    expect(event.fields.source).toBe('raw');
    expect(event.fields.message).toBe('plain failure');
  });
});
