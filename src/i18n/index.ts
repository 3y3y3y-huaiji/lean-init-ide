import { en } from './en';
import { zh } from './zh';
import type { Messages } from './types';

export type Locale = 'zh' | 'en';

export const LOCALES: readonly Locale[] = ['zh', 'en'];

const store = { zh, en } satisfies Record<Locale, Messages>;

const STORAGE_KEY = 'lean:locale';

export const isLocale = (value: string | undefined): value is Locale =>
  value === 'zh' || value === 'en';

export const messagesFor = (locale: Locale): Messages => store[locale];

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
