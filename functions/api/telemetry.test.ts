import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from './telemetry';

type Context = Parameters<typeof onRequest>[0];

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://example.test/api/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });

const call = (request: Request, env: Context['env'] = {}): Promise<Response> =>
  onRequest({ request, env });

const withEvents = (events: unknown) => JSON.stringify({ v: 1, events });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/telemetry', () => {
  it('拒绝非 POST 方法并给出 Allow', async () => {
    const response = await call(
      new Request('https://example.test/api/telemetry', { method: 'GET' }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('同一 IP 超过每分钟额度时返回 429', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const headers = { 'CF-Connecting-IP': '203.0.113.9' };

    for (let index = 0; index < 30; index += 1) {
      const response = await call(post(withEvents([{ name: 'boot' }]), headers));
      expect(response.status).toBe(204);
    }

    const blocked = await call(post(withEvents([{ name: 'boot' }]), headers));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('60');
  });

  it('拒绝非 JSON 的 Content-Type', async () => {
    const response = await call(post('{"events":[]}', { 'Content-Type': 'text/plain' }));
    expect(response.status).toBe(415);
  });

  it('Content-Length 超限时直接 413', async () => {
    const response = await call(post('{}', { 'Content-Length': '9000' }));
    expect(response.status).toBe(413);
  });

  it('实际 body 超限时同样 413（没有 Content-Length 时）', async () => {
    const longBody = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: () => Promise.resolve('x'.repeat(9000)),
    } as unknown as Request;
    const response = await call(longBody);
    expect(response.status).toBe(413);
  });

  it('多字节 UTF-8 body 按实际字节数限制 413', async () => {
    // 4000 个汉字字符数 < 8192，但 UTF-8 占 12000 字节。
    const utf8Body = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: () => Promise.resolve('测'.repeat(4000)),
    } as unknown as Request;
    const response = await call(utf8Body);
    expect(response.status).toBe(413);
  });

  it('Content-Length 不是数字时按实际 body 判断', async () => {
    const response = await call(post(withEvents([]), { 'Content-Length': 'abc' }));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('No valid events');
  });

  it('body 读不出来时 400', async () => {
    const broken = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: () => Promise.reject(new Error('stream broke')),
    } as unknown as Request;
    const response = await call(broken);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Unreadable body');
  });

  it('JSON 不合法时 400', async () => {
    const response = await call(post('not json'));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Invalid JSON');
  });

  it('没有合法事件时 400', async () => {
    for (const body of [
      '{}',
      'null',
      '[]',
      withEvents([]),
      withEvents([null, 'boot', { name: 'unknown_event' }, { ts: 1 }]),
    ]) {
      const response = await call(post(body));
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('No valid events');
    }
  });

  it('合法事件返回 204 并关闭缓存', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await call(
      post(withEvents([{ name: 'boot', ts: 1000, fields: { page: 'home' } }])),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      telemetry: { name: string; ts: number; fields: Record<string, unknown> };
    };
    expect(line.telemetry.name).toBe('boot');
    expect(line.telemetry.ts).toBe(1000);
    expect(line.telemetry.fields.page).toBe('home');
  });

  it('清洗字段：截断字符串、丢弃非法键与非法数值', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await call(
      post(
        withEvents([
          {
            name: 'assets',
            ts: 1,
            fields: {
              note: `${'x'.repeat(200)}\n`,
              'bad key': 'drop',
              infinite: Number.POSITIVE_INFINITY,
              ratio: 0.456,
              cached: true,
              nested: { a: 1 },
            },
          },
        ]),
      ),
    );

    expect(response.status).toBe(204);
    const line = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      telemetry: { fields: Record<string, unknown> };
    };
    const fields = line.telemetry.fields;
    expect(String(fields.note)).toHaveLength(120);
    expect(fields.note).not.toContain('\n');
    expect(fields).not.toHaveProperty('bad key');
    expect(fields).not.toHaveProperty('infinite');
    expect(fields).not.toHaveProperty('nested');
    expect(fields.ratio).toBe(0);
    expect(fields.cached).toBe(true);
  });

  it('没有可用字段时也记录事件，时间戳缺省为当前时间', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const before = Date.now();
    const response = await call(post(withEvents([{ name: 'sw', fields: { 'Bad-Key': 1 } }])));

    expect(response.status).toBe(204);
    const line = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      telemetry: { ts: number; fields?: unknown };
    };
    expect(line.telemetry.fields).toBeUndefined();
    expect(line.telemetry.ts).toBeGreaterThanOrEqual(before);
  });

  it('一次最多处理 16 个事件', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const events = Array.from({ length: 20 }, (_, index) => ({ name: 'assets', ts: index }));
    const response = await call(post(withEvents(events)));

    expect(response.status).toBe(204);
    expect(log).toHaveBeenCalledTimes(16);
  });

  it('binding 存在但没有 writeDataPoint 时退回日志', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await call(post(withEvents([{ name: 'boot', ts: 7 }])), {
      TELEMETRY: {} as unknown as NonNullable<Context['env']['TELEMETRY']>,
    });

    expect(response.status).toBe(204);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('配置了 Analytics Engine 时写数据点而不是打日志', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const writeDataPoint = vi.fn();
    const response = await call(
      post(withEvents([{ name: 'lsp_ready', ts: 42, fields: { ms: 8500 } }])),
      {
        TELEMETRY: { writeDataPoint },
      },
    );

    expect(response.status).toBe(204);
    expect(log).not.toHaveBeenCalled();
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ['lsp_ready'],
      blobs: ['lsp_ready', JSON.stringify({ ms: 8500 })],
      doubles: [42],
    });
  });
});
