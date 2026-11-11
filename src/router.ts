import { isLocale, type Locale } from './i18n';

export type Page = 'home' | 'lesson' | 'playground' | 'notFound';

export type Route = {
  page: Page;
  locale: Locale;
};

export type RouteResolution = { kind: 'route'; route: Route } | { kind: 'redirect'; path: string };

/**
 * 路由约定：/{locale}/、/{locale}/learn/first-proof、/{locale}/playground。
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
  if (rest[0] === 'learn' && rest[1] === 'first-proof') {
    return { kind: 'route', route: { page: 'lesson', locale: first } };
  }
  return { kind: 'route', route: { page: 'notFound', locale: first } };
};
