/**
 * 运行指标接收端：POST /api/telemetry
 *
 * 只接收结构化的启动链路打点与错误摘要，不落库、不回显原文。
 * 配了 Analytics Engine binding（env.TELEMETRY）时写数据点；没有 binding 时打一行
 * JSON 到 Workers Logs（`wrangler pages deployment tail` 可见）。
 *
 * 校验刻意与服务端前端各写一份：跨端共享会让前端包多一套解析逻辑，
 * 而这里只有几十行，重复成本远低于共享模块的耦合。
 */

const MAX_BODY_BYTES = 8192;
const MAX_EVENTS = 16;
const MAX_FIELDS = 12;
const MAX_STRING = 120;

const EVENT_NAMES = new Set([
  'boot',
  'sw',
  'assets',
  'lsp_ready',
  'first_diagnostics',
  'runtime_error',
]);

const FIELD_KEY = /^[a-z][a-z0-9_]{0,23}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

type TelemetryFields = Record<string, string | number | boolean>;
type TelemetryEvent = { name: string; ts: number; fields?: TelemetryFields };

type AnalyticsEngineDataset = {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
};

type Env = { TELEMETRY?: AnalyticsEngineDataset };
type Context = { request: Request; env: Env };

const normalizeFields = (value: unknown): TelemetryFields | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const fields: TelemetryFields = {};
  let count = 0;
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (count >= MAX_FIELDS) break;
    if (!FIELD_KEY.test(key)) continue;
    if (typeof field === 'number') {
      if (!Number.isFinite(field)) continue;
      fields[key] = Math.round(field);
    } else if (typeof field === 'boolean') {
      fields[key] = field;
    } else if (typeof field === 'string') {
      fields[key] = field.slice(0, MAX_STRING).replace(CONTROL_CHARS, ' ');
    } else {
      continue;
    }
    count += 1;
  }

  return count > 0 ? fields : undefined;
};

const normalizeEvents = (value: unknown): TelemetryEvent[] => {
  if (!Array.isArray(value)) return [];

  const events: TelemetryEvent[] = [];
  for (const item of value.slice(0, MAX_EVENTS)) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { name?: unknown; ts?: unknown; fields?: unknown };
    if (typeof candidate.name !== 'string' || !EVENT_NAMES.has(candidate.name)) continue;

    const ts =
      typeof candidate.ts === 'number' && Number.isFinite(candidate.ts)
        ? Math.round(candidate.ts)
        : Date.now();
    const event: TelemetryEvent = { name: candidate.name, ts };
    const fields = normalizeFields(candidate.fields);
    if (fields) event.fields = fields;
    events.push(event);
  }
  return events;
};

const record = (env: Env, event: TelemetryEvent): void => {
  const dataset = env?.TELEMETRY;
  if (dataset && typeof dataset.writeDataPoint === 'function') {
    dataset.writeDataPoint({
      indexes: [event.name],
      blobs: [event.name, JSON.stringify(event.fields ?? {})],
      doubles: [event.ts],
    });
    return;
  }
  // 没配 Analytics Engine 时也能排障：日志按行 JSON，直接 grep 事件名即可。
  console.log(JSON.stringify({ telemetry: event }));
};

const badRequest = (message: string): Response => new Response(message, { status: 400 });

export const onRequest = async ({ request, env }: Context): Promise<Response> => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  }

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    return new Response('Unsupported media type', { status: 415 });
  }

  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return badRequest('Unreadable body');
  }
  if (text.length > MAX_BODY_BYTES) return new Response('Payload too large', { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return badRequest('Invalid JSON');
  }

  const events = normalizeEvents((payload as { events?: unknown } | null)?.events);
  if (events.length === 0) return badRequest('No valid events');

  for (const event of events) record(env, event);

  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
};
