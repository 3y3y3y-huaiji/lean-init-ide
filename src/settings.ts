const AUTO_START_KEY = 'lean:auto-start';
const RUNTIME_SESSION_KEY = 'lean:runtime-session';
const DEFAULT_EXTENSIONS_KEY = 'lean:default-extensions';

/**
 * 打开编辑器页时是否自动下载并启动 Lean。
 * 默认关闭：首次下载约 102MB，应由用户主动决定。
 */
export const getAutoStart = (): boolean => {
  try {
    return localStorage.getItem(AUTO_START_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setAutoStart = (value: boolean) => {
  try {
    localStorage.setItem(AUTO_START_KEY, String(value));
  } catch {
    // 忽略隐私模式下的写入失败，当前页面仍然生效。
  }
};

/**
 * 启动 Lean 时默认挂载的扩展库。
 * 放入 localStorage 而不是 sessionStorage：这是跨访问保留的启动偏好；
 * 是否自动启动仍由 getAutoStart 单独控制。
 */
export const getDefaultExtensions = (): string[] => {
  try {
    const raw = localStorage.getItem(DEFAULT_EXTENSIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
};

export const setDefaultExtensions = (ids: Iterable<string>): void => {
  try {
    localStorage.setItem(DEFAULT_EXTENSIONS_KEY, JSON.stringify([...ids]));
  } catch {
    // 同上：隐私模式下忽略，当前页面仍按内存中的勾选执行。
  }
};

export type RuntimeSessionState = {
  /** 同一标签页上一页是否处于运行或启动中。 */
  active: boolean;
  /** 已选中的扩展库 id，导航回来后据此恢复，避免用户重新点一遍。 */
  extensions: string[];
};

/**
 * 页面跳转会销毁 Web Worker，运行时无法真正跨页存活；用 sessionStorage 记住
 * “上一页是运行中”和已选库，回到编辑器页时自动恢复，避免看起来像被重置。
 * 用 sessionStorage 而不是 localStorage：新标签页不应自动下载 100MB。
 */
export const readRuntimeSession = (): RuntimeSessionState | null => {
  try {
    const raw = sessionStorage.getItem(RUNTIME_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { active, extensions } = parsed as Partial<RuntimeSessionState>;
    if (typeof active !== 'boolean' || !Array.isArray(extensions)) return null;
    return {
      active,
      extensions: extensions.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return null;
  }
};

export const writeRuntimeSession = (state: RuntimeSessionState): void => {
  try {
    sessionStorage.setItem(RUNTIME_SESSION_KEY, JSON.stringify(state));
  } catch {
    // 同上：隐私模式下忽略。
  }
};
