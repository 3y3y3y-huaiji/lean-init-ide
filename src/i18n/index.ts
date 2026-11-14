import type { Messages } from './types';

export type Locale = 'zh' | 'en';

export const LOCALES: readonly Locale[] = ['zh', 'en'];

const store: Partial<Record<Locale, Messages>> = {};
const inflight: Partial<Record<Locale, Promise<Messages>>> = {};

const STORAGE_KEY = 'lean:locale';

export const isLocale = (value: string | undefined): value is Locale =>
  value === 'zh' || value === 'en';

/** 按需加载单个语言包，避免首屏同时下载中英两套课程正文。 */
export const loadLocale = async (locale: Locale): Promise<Messages> => {
  const cached = store[locale];
  if (cached) return cached;

  const pending = inflight[locale];
  if (pending) return pending;

  const promise = (
    locale === 'zh' ? import('./zh').then((mod) => mod.zh) : import('./en').then((mod) => mod.en)
  ).then((messages) => {
    store[locale] = messages;
    delete inflight[locale];
    return messages;
  });

  inflight[locale] = promise;
  return promise;
};

export const messagesFor = (locale: Locale): Messages => {
  const messages = store[locale];
  if (!messages) {
    throw new Error(`Locale "${locale}" is not loaded; call await loadLocale("${locale}") first.`);
  }
  return messages;
};

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
