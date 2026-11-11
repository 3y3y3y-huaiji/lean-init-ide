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
});
