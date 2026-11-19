import type { LessonPage, Messages } from './types';

export type Locale = 'zh' | 'en';

export const LOCALES: readonly Locale[] = ['zh', 'en'];
export { LESSON_CATALOG, type LessonCatalogEntry } from './lesson-catalog';

const STORAGE_KEY = 'lean:locale';

export const isLocale = (value: string | undefined): value is Locale =>
  value === 'zh' || value === 'en';

const createLoader = <T>(
  loaders: Record<Locale, () => Promise<T>>,
  missingError: (locale: Locale) => string,
) => {
  const store: Partial<Record<Locale, T>> = {};
  const inflight: Partial<Record<Locale, Promise<T>>> = {};

  const load = async (locale: Locale): Promise<T> => {
    const cached = store[locale];
    if (cached) return cached;

    const pending = inflight[locale];
    if (pending) return pending;

    const promise = loaders[locale]().then((data) => {
      store[locale] = data;
      delete inflight[locale];
      return data;
    });

    inflight[locale] = promise;
    return promise;
  };

  const get = (locale: Locale): T => {
    const data = store[locale];
    if (!data) throw new Error(missingError(locale));
    return data;
  };

  return { load, get };
};

const localeLoader = createLoader<Messages>(
  {
    zh: () => import('./zh').then((mod) => mod.zh),
    en: () => import('./en').then((mod) => mod.en),
  },
  (locale) => `Locale "${locale}" is not loaded; call await loadLocale("${locale}") first.`,
);

const lessonLoader = createLoader<readonly LessonPage[]>(
  {
    zh: () => import('./lessons-zh').then((mod) => mod.lessonsZh),
    en: () => import('./lessons-en').then((mod) => mod.lessonsEn),
  },
  (locale) => `Lessons for "${locale}" are not loaded; call await loadLessons("${locale}") first.`,
);

/** 按需加载单个轻量语言包（不含 27 节课程正文），避免首屏下载冗余文案。 */
export const loadLocale = localeLoader.load;
export const messagesFor = localeLoader.get;

/** 仅在课程页或 ?lesson= 练习时按需加载对应语言的全部课程正文。 */
export const loadLessons = lessonLoader.load;
export const lessonsFor = lessonLoader.get;

export const otherLocale = (locale: Locale): Locale => (locale === 'zh' ? 'en' : 'zh');

export const localeLabel = (locale: Locale): string => (locale === 'zh' ? '中文' : 'English');

/** 读取用户手动选择过的语言；没有手动选择时返回 null。 */
export const readLocalePreference = (): Locale | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'zh' || saved === 'en' ? saved : null;
  } catch {
    // 忽略隐私模式下的存储异常。
    return null;
  }
};

export const detectLocale = (): Locale => {
  const saved = readLocalePreference();
  if (saved) return saved;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language.toLowerCase().startsWith('zh')) ? 'zh' : 'en';
};

const CRAWLER_UA =
  /bot|crawler|spider|crawling|googlebot|bingbot|baiduspider|yandex|duckduckbot|slurp|facebookexternalhit|twitterbot|linkedinbot|embedly|pinterest|whatsapp|telegrambot/i;

export type RootLocaleInput = {
  pathname: string;
  /** 用户手动选择过的语言；null 表示从未选择。 */
  savedLocale: Locale | null;
  /** 自动化浏览器（含 Playwright）通常为 true，不应触发语言跳转。 */
  webdriver: boolean;
  userAgent: string;
  languages: readonly string[];
};

/**
 * 根路径是否应该由客户端静默切到中文首页。
 *
 * 静态层始终给爬虫英文首页；这里只服务真实中文用户，
 * 并且尊重用户手动选择过的语言偏好。
 */
export const shouldLocalizeRoot = (input: RootLocaleInput): boolean => {
  if (input.pathname !== '/' || input.savedLocale === 'en') return false;
  if (input.webdriver || CRAWLER_UA.test(input.userAgent)) return false;
  // 手动选过中文的用户回到根路径时也直接进中文首页。
  if (input.savedLocale === 'zh') return true;
  return input.languages.some((language) => language.toLowerCase().startsWith('zh'));
};

export const rememberLocale = (locale: Locale) => {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // 忽略写入失败。
  }
};
