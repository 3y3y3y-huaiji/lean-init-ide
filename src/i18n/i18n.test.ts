import { beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from './en';
import { zh } from './zh';

const collectPaths = (value: unknown, path: string, out: Map<string, unknown>): void => {
  out.set(path, value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPaths(item, `${path}[${index}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectPaths(child, path ? `${path}.${key}` : key, out);
    }
  }
};

describe('translations', () => {
  const zhPaths = new Map<string, unknown>();
  const enPaths = new Map<string, unknown>();
  collectPaths(zh, '', zhPaths);
  collectPaths(en, '', enPaths);

  it('ships the same keys in both locales', () => {
    expect([...enPaths.keys()].sort()).toEqual([...zhPaths.keys()].sort());
  });

  it('has no empty strings', () => {
    for (const [path, value] of zhPaths) {
      if (typeof value === 'string') expect(value.trim(), path).not.toBe('');
    }
    for (const [path, value] of enPaths) {
      if (typeof value === 'string') expect(value.trim(), path).not.toBe('');
    }
  });

  it('defines the same helper functions', () => {
    for (const [path, value] of zhPaths) {
      if (typeof value === 'function') expect(typeof enPaths.get(path), path).toBe('function');
    }
  });
});

describe('detectLocale', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('prefers a remembered locale', async () => {
    localStorage.setItem('lean:locale', 'zh');
    const { detectLocale, readLocalePreference } = await import('./index');
    expect(readLocalePreference()).toBe('zh');
    expect(detectLocale()).toBe('zh');
  });

  it('falls back to English for non-Chinese browsers', async () => {
    const { detectLocale, readLocalePreference } = await import('./index');
    expect(readLocalePreference()).toBeNull();
    expect(detectLocale()).toBe('en');
  });

  it('按需加载语言包并复用并发与已缓存结果', async () => {
    const { loadLessons, loadLocale, lessonsFor, messagesFor } = await import('./index');
    expect(() => messagesFor('zh')).toThrow();
    expect(() => lessonsFor('zh')).toThrow();

    const [first, second] = await Promise.all([loadLocale('zh'), loadLocale('zh')]);
    expect(first).toBe(second);
    expect(messagesFor('zh')).toBe(first);
    expect(await loadLocale('zh')).toBe(first);

    const enMessages = await loadLocale('en');
    expect(messagesFor('en')).toBe(enMessages);

    const [zhLessonsA, zhLessonsB] = await Promise.all([loadLessons('zh'), loadLessons('zh')]);
    expect(zhLessonsA).toBe(zhLessonsB);
    expect(lessonsFor('zh')).toBe(zhLessonsA);
    expect(await loadLessons('zh')).toBe(zhLessonsA);

    const enLessons = await loadLessons('en');
    expect(lessonsFor('en')).toBe(enLessons);
  });
});

describe('shouldLocalizeRoot', () => {
  const base = {
    pathname: '/',
    savedLocale: null,
    webdriver: false,
    userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
    languages: ['zh-CN', 'zh'],
  } as const;

  it('中文浏览器且未手动选择语言时切到中文首页', async () => {
    const { shouldLocalizeRoot } = await import('./index');
    expect(shouldLocalizeRoot({ ...base })).toBe(true);
    expect(shouldLocalizeRoot({ ...base, languages: ['zh-TW'] })).toBe(true);
  });

  it('英文浏览器留在英文首页', async () => {
    const { shouldLocalizeRoot } = await import('./index');
    expect(shouldLocalizeRoot({ ...base, languages: ['en-US', 'en'] })).toBe(false);
  });

  it('尊重用户手动选择过的语言', async () => {
    const { shouldLocalizeRoot } = await import('./index');
    expect(shouldLocalizeRoot({ ...base, savedLocale: 'en' })).toBe(false);
    expect(shouldLocalizeRoot({ ...base, savedLocale: 'zh', languages: ['en-US'] })).toBe(true);
  });

  it('爬虫、自动化浏览器与非根路径都不触发客户端跳转', async () => {
    const { shouldLocalizeRoot } = await import('./index');
    expect(shouldLocalizeRoot({ ...base, userAgent: 'Mozilla/5.0 Googlebot/2.1' })).toBe(false);
    expect(shouldLocalizeRoot({ ...base, userAgent: 'Mozilla/5.0 bingbot/2.0' })).toBe(false);
    expect(shouldLocalizeRoot({ ...base, webdriver: true })).toBe(false);
    expect(shouldLocalizeRoot({ ...base, pathname: '/zh/' })).toBe(false);
  });
});
