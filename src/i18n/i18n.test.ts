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

  it('invokes every message formatter in both locales and returns non-empty text', () => {
    for (const locale of [zh, en]) {
      expect(locale.home.facts(27)).toContain('27');
      expect(locale.home.pathMeta(5)).toContain('5');
      expect(locale.home.demo.stepLabel(1, 3)).toContain('1');
      expect(locale.challenges.detail.goalsRemaining(2)).toContain('2');
      expect(locale.challenges.detail.feedbackIssueTitle('Add Comm')).toContain('Add Comm');
      expect(locale.lesson.requiresHint('Std')).toContain('Std');
      expect(locale.lesson.feedbackIssueTitle('Intro')).toContain('Intro');
      expect(locale.lesson.completedCount(3, 27)).toContain('3');
      expect(locale.lesson.goalStepLabel(1, 2)).toContain('1');
      expect(locale.playground.facts(27)).toContain('27');
      expect(locale.playground.runPassedDetail(0, 12)).toContain('12');
      expect(locale.playground.runPassedDetail(2, 15)).toContain('2');
      expect(locale.playground.libraryLoading('50%')).toContain('50%');
      expect(locale.playground.libraryError('boom')).toContain('boom');
      expect(locale.playground.libraryQuickFix('Std')).toContain('Std');
      expect(locale.playground.libraryQuickFixDone('Std')).toContain('Std');
      expect(locale.playground.logCompletion(1, 2, 3)).toContain('3');
      expect(locale.playground.logHover(1, 2, true)).toBeTruthy();
      expect(locale.playground.logHover(1, 2, false)).toBeTruthy();
      expect(locale.playground.logRequestFailed('hover', 'timeout')).toContain('timeout');
      expect(locale.playground.logGoalFailed('err')).toContain('err');
      expect(locale.playground.statusChunks('1.0', '2.0')).toContain('1.0');
      expect(locale.playground.statusChunkFallback('init', 'retry')).toContain('init');
      expect(locale.playground.statusError('bad')).toContain('bad');
      expect(locale.playground.statusFailure('fail')).toContain('fail');
      expect(locale.playground.crashAutoDetail('oom')).toContain('oom');
      expect(locale.playground.crashLoopDetail('stack')).toContain('stack');
      expect(locale.playground.sourceSwitching('CDN')).toContain('CDN');
      expect(locale.playground.assetFallbackLabel('cdn', '404')).toContain('cdn');
      expect(locale.playground.statusReady(1, 20)).toContain('20');
      expect(locale.playground.statusNoDiagnostics(10)).toContain('10');
      expect(locale.playground.logSwFailed('denied')).toContain('denied');
      expect(locale.playground.logRuntimeError('err')).toContain('err');
      expect(locale.playground.logRuntimeCrash('trap')).toContain('trap');
      expect(locale.playground.logSourceSwitched('Mirror')).toContain('Mirror');
      expect(locale.playground.logInitialize('1.2')).toContain('1.2');
      expect(locale.playground.logStartFailed('fail')).toContain('fail');
      expect(locale.playground.logMemorySoftRecycle('500')).toContain('500');
      expect(locale.playground.logMemoryImportRecycle('600')).toContain('600');
      expect(locale.playground.logMemoryBackgroundRelease('700')).toContain('700');
      expect(locale.playground.logMemoryHardLimit('900', '1024')).toContain('1024');
      expect(locale.playground.logRuntimeArchSelected('wasm64')).toContain('wasm64');
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

  it('在 localStorage 不可用或 navigator.languages 为空时安全回退', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    Object.defineProperty(navigator, 'languages', { value: [], configurable: true });
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });

    const { detectLocale, readLocalePreference, rememberLocale } = await import('./index');
    expect(readLocalePreference()).toBeNull();
    expect(detectLocale()).toBe('zh');
    expect(() => rememberLocale('zh')).not.toThrow();
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
