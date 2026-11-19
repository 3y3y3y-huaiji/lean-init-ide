import { describe, expect, it, vi, beforeEach } from 'vitest';

const mediaQuery = (matches: boolean) =>
  vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('defaults to the system preference', async () => {
    window.matchMedia = mediaQuery(true);
    const theme = await import('./theme');
    expect(theme.getThemePreference()).toBe('system');
    expect(theme.getResolvedTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('resolves the system preference to dark when the OS is dark', async () => {
    window.matchMedia = mediaQuery(false);
    const theme = await import('./theme');
    expect(theme.getResolvedTheme()).toBe('dark');
  });

  it('persists an explicit choice and applies it', async () => {
    window.matchMedia = mediaQuery(false);
    const theme = await import('./theme');
    theme.setThemePreference('light');
    expect(localStorage.getItem('lean:theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themePreference).toBe('light');
  });

  it('cycles light -> dark -> system -> light', async () => {
    window.matchMedia = mediaQuery(false);
    const theme = await import('./theme');
    theme.setThemePreference('light');
    expect(theme.cycleThemePreference()).toBe('dark');
    expect(theme.cycleThemePreference()).toBe('system');
    expect(theme.cycleThemePreference()).toBe('light');
  });

  it('notifies subscribers on change, supports unsubscribe, and tracks OS theme in system mode', async () => {
    let matches = false;
    let changeHandler: (() => void) | undefined;
    window.matchMedia = vi.fn((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        changeHandler = cb;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const theme = await import('./theme');
    const seen: string[] = [];
    const unsubscribe = theme.onResolvedThemeChange((resolved) => seen.push(resolved));

    matches = true;
    changeHandler?.();
    expect(theme.getResolvedTheme()).toBe('light');
    expect(seen).toEqual(['light']);

    // Explicitly pinned theme ignores subsequent OS changes.
    theme.setThemePreference('dark');
    matches = false;
    changeHandler?.();
    expect(theme.getResolvedTheme()).toBe('dark');
    expect(seen).toEqual(['light', 'dark']);

    unsubscribe();
    theme.setThemePreference('light');
    expect(seen).toEqual(['light', 'dark']);
  });

  it('启动时恢复已保存的暗色偏好，并在存储异常或系统无变化时保持稳定', async () => {
    localStorage.setItem('lean:theme', 'dark');
    const matches = false;
    let changeHandler: (() => void) | undefined;
    window.matchMedia = vi.fn((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        changeHandler = cb;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const theme = await import('./theme');
    expect(theme.getThemePreference()).toBe('dark');
    expect(theme.getResolvedTheme()).toBe('dark');

    // system 模式下 OS 未变时不触发回调；存储异常时不抛错。
    theme.setThemePreference('system');
    const listener = vi.fn();
    theme.onResolvedThemeChange(listener);
    changeHandler?.();
    expect(listener).not.toHaveBeenCalled();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => theme.setThemePreference('light')).not.toThrow();

    vi.resetModules();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const fallbackTheme = await import('./theme');
    expect(fallbackTheme.getThemePreference()).toBe('system');
  });
});
