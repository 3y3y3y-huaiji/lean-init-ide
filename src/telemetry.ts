/**
 * 轻量运行指标：启动链路打点 + 未捕获错误上报。
 *
 * 不引第三方 SDK：字段只允许数值、布尔与截断后的短字符串，
 * 不含 cookie、用户输入或设备指纹。任何失败都静默吞掉——观测不能反过来影响 Lean 启动。
 *
 * 采样只在普通指标上生效；错误事件必发（每页最多 3 条），否则最需要的数据反而会被采样掉。
 */

export const TELEMETRY_ENDPOINT = '/api/telemetry';

/** 服务端只接受这些事件名，新增时两端同时改。 */
export type TelemetryEventName =
  'boot' | 'sw' | 'assets' | 'lsp_ready' | 'first_diagnostics' | 'runtime_error';

export type TelemetryFields = Record<string, number | boolean | string>;

type QueuedEvent = {
  name: TelemetryEventName;
  ts: number;
  fields?: TelemetryFields;
};

const MAX_EVENTS_PER_PAGE = 12;
const MAX_FIELDS = 12;
const MAX_STRING_LENGTH = 120;
const MAX_ERRORS_PER_PAGE = 3;
const DEFAULT_SAMPLE_RATE = 0.5;
const FLUSH_DELAY_MS = 1200;

const FIELD_KEY = /^[a-z][a-z0-9_]{0,23}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

let enabled = false;
let sampled = false;
let errorCount = 0;
let flushTimer: number | undefined;
const queue: QueuedEvent[] = [];

/** Do Not Track 是用户明确的退出信号，整页都不上报。 */
const isDoNotTrack = (): boolean => {
  try {
    const nav = navigator as Navigator & { doNotTrack?: string | null };
    const win = window as Window & { doNotTrack?: string | null };
    return nav.doNotTrack === '1' || win.doNotTrack === '1';
  } catch {
    return false;
  }
};

const sanitizeFields = (fields: TelemetryFields | undefined): TelemetryFields | undefined => {
  if (!fields) return undefined;
  const clean: TelemetryFields = {};
  let count = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (count >= MAX_FIELDS) break;
    if (!FIELD_KEY.test(key)) continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue;
      clean[key] = Math.round(value);
    } else if (typeof value === 'boolean') {
      clean[key] = value;
    } else {
      clean[key] = value.slice(0, MAX_STRING_LENGTH).replace(CONTROL_CHARS, ' ');
    }
    count += 1;
  }
  return count > 0 ? clean : undefined;
};

const post = (events: QueuedEvent[]): void => {
  let body: string;
  try {
    body = JSON.stringify({ v: 1, events });
  } catch {
    return;
  }
  try {
    // 指标不需要响应，beacon 还能在页面卸载后继续发出；不可用时才退回 fetch。
    if (typeof navigator.sendBeacon === 'function') {
      if (
        navigator.sendBeacon(TELEMETRY_ENDPOINT, new Blob([body], { type: 'application/json' }))
      ) {
        return;
      }
    }
    void fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // 网络层不可用时也不需要提示用户：指标不是功能。
  }
};

/** 立即发送缓冲区。错误路径与页面卸载都走这里。 */
export const flushTelemetry = (): void => {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  if (queue.length === 0) return;
  post(queue.splice(0, queue.length));
};

export const track = (name: TelemetryEventName, fields?: TelemetryFields): void => {
  if (!enabled) return;
  if (!sampled && name !== 'runtime_error') return;
  if (queue.length >= MAX_EVENTS_PER_PAGE) return;

  const event: QueuedEvent = { name, ts: Date.now() };
  const clean = sanitizeFields(fields);
  if (clean) event.fields = clean;
  queue.push(event);

  if (flushTimer === undefined && typeof window !== 'undefined') {
    flushTimer = window.setTimeout(() => {
      flushTimer = undefined;
      flushTelemetry();
    }, FLUSH_DELAY_MS);
  }
};

export const reportError = (source: string, error: unknown): void => {
  if (!enabled || errorCount >= MAX_ERRORS_PER_PAGE) return;
  errorCount += 1;

  const fields: TelemetryFields = { source };
  if (error instanceof Error) {
    fields.name = error.name;
    fields.message = error.message;
    fields.frames = error.stack ? Math.max(0, error.stack.split('\n').length - 1) : 0;
  } else {
    fields.message = String(error);
  }

  track('runtime_error', fields);
  // 错误立即发出：下一次导航会把内存里的缓冲区丢掉。
  flushTelemetry();
};

export const initTelemetry = (options: { sampleRate?: number } = {}): void => {
  if (enabled) return;
  if (isDoNotTrack()) return;

  const rate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  enabled = true;
  sampled = Number.isFinite(rate) && rate > 0 ? Math.random() < Math.min(1, rate) : false;

  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    reportError('window', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError('promise', event.reason);
  });
  window.addEventListener('pagehide', () => flushTelemetry(true));
};
