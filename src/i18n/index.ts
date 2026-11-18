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

export const detectLocale = (): Locale => {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // 忽略隐私模式下的存储异常。
  }
  if (saved === 'zh' || saved === 'en') return saved;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language.toLowerCase().startsWith('zh')) ? 'zh' : 'en';
};

export const rememberLocale = (locale: Locale) => {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // 忽略写入失败。
  }
};
