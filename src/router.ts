import { isLocale, type Locale } from './i18n';

export type Page = 'home' | 'lesson' | 'playground' | 'privacy' | 'reference' | 'notFound';

export type Route = {
  page: Page;
  locale: Locale;
  /** 课时 slug，仅 lesson 页有值；无效 slug 由视图层回退到第一节。 */
  slug?: string;
};

export type RouteResolution = { kind: 'route'; route: Route } | { kind: 'redirect'; path: string };

/** 课程入口默认跳到的第一节课。新增课时时同步这里。 */
export const FIRST_LESSON_SLUG = 'what-is-lean';

/**
 * 路由约定：/{locale}/、/{locale}/learn/what-is-lean、/{locale}/playground。
 * 没有语言前缀时返回重定向目标，由调用方写入 location。
 */
export const resolveRoute = (pathname: string, fallbackLocale: Locale): RouteResolution => {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];

  if (!isLocale(first)) {
    const rest = segments.length ? `/${segments.join('/')}` : '/';
    return { kind: 'redirect', path: `/${fallbackLocale}${rest}` };
  }

  const rest = segments.slice(1);
  if (rest.length === 0) return { kind: 'route', route: { page: 'home', locale: first } };
  if (rest[0] === 'playground')
    return { kind: 'route', route: { page: 'playground', locale: first } };
  if (rest[0] === 'reference')
    return { kind: 'route', route: { page: 'reference', locale: first } };
  if (rest[0] === 'privacy') return { kind: 'route', route: { page: 'privacy', locale: first } };
  if (rest[0] === 'learn') {
    // 目录页没有独立形态，直接落到第一节。
    if (!rest[1]) return { kind: 'redirect', path: `/${first}/learn/${FIRST_LESSON_SLUG}` };
    return { kind: 'route', route: { page: 'lesson', locale: first, slug: rest[1] } };
  }
  return { kind: 'route', route: { page: 'notFound', locale: first } };
};
