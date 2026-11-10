export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'lean:theme';
const systemQuery = window.matchMedia('(prefers-color-scheme: light)');
const listeners = new Set<(theme: ResolvedTheme) => void>();

let preference = readPreference();
let resolved = resolve(preference);

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // 隐私模式下 localStorage 可能不可用，按系统偏好处理。
  }
  return 'system';
}

function resolve(value: ThemePreference): ResolvedTheme {
  if (value === 'system') return systemQuery.matches ? 'light' : 'dark';
  return value;
}

function paint() {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
}

function notify() {
  for (const listener of listeners) listener(resolved);
}

export const getThemePreference = (): ThemePreference => preference;
export const getResolvedTheme = (): ResolvedTheme => resolved;

export const setThemePreference = (value: ThemePreference) => {
  preference = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 忽略写入失败，当前会话仍然生效。
  }
  const next = resolve(value);
  const changed = next !== resolved;
  resolved = next;
  paint();
  if (changed) notify();
};

export const cycleThemePreference = (): ThemePreference => {
  const order: ThemePreference[] = ['light', 'dark', 'system'];
  const index = order.indexOf(preference);
  const next = order[(index + 1) % order.length] ?? 'system';
  setThemePreference(next);
  return next;
};

export const onResolvedThemeChange = (listener: (theme: ResolvedTheme) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

systemQuery.addEventListener('change', () => {
  if (preference !== 'system') return;
  const next = resolve('system');
  if (next === resolved) return;
  resolved = next;
  paint();
  notify();
});

paint();
