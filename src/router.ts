import { CHALLENGES } from './challenges';
import { isLocale, type Locale } from './i18n';

export type Page =
  | 'home'
  | 'lesson'
  | 'playground'
  | 'privacy'
  | 'reference'
  | 'challenges'
  | 'challenge'
  | 'notFound';

export type Route = {
  page: Page;
  locale: Locale;
  /** 课时 slug，仅 lesson 页有值；无效 slug 由视图层回退到第一节。 */
  slug?: string;
};

export type RouteResolution = { kind: 'route'; route: Route } | { kind: 'redirect'; path: string };

/** 课程入口默认跳到的第一节课。新增课时时同步这里。 */
export const FIRST_LESSON_SLUG = 'what-is-lean';

/** 各语言首页的规范路径：英文首页固定为根路径，与 Search Console 选定的规范网址一致。 */
export const localeHomePath = (locale: Locale): string => (locale === 'en' ? '/' : '/zh/');

/**
 * 路由约定：英文首页 `/`、/{locale}/learn/what-is-lean、/{locale}/playground。
 * 没有语言前缀时返回重定向目标，由调用方写入 location。
 */
export const resolveRoute = (pathname: string, fallbackLocale: Locale): RouteResolution => {
  const segments = pathname.split('/').filter(Boolean);

  // 根路径是唯一英文主入口，不再按浏览器语言跳到 /zh/。
  if (segments.length === 0) return { kind: 'route', route: { page: 'home', locale: 'en' } };

  const first = segments[0];

  if (!isLocale(first)) {
    const rest = `/${segments.join('/')}`;
    return { kind: 'redirect', path: `/${fallbackLocale}${rest}` };
  }

  const rest = segments.slice(1);

  // /en 与 /en/ 不再是可索引的独立首页；Cloudflare Pages 会先做 301，
  // 这里保留同样的跳转，避免直接以 SPA 形式落到旧地址。
  if (first === 'en' && rest.length === 0) return { kind: 'redirect', path: '/' };

  if (rest.length === 0) return { kind: 'route', route: { page: 'home', locale: first } };
  if (rest[0] === 'playground')
    return { kind: 'route', route: { page: 'playground', locale: first } };
  if (rest[0] === 'reference')
    return { kind: 'route', route: { page: 'reference', locale: first } };
  if (rest[0] === 'privacy') return { kind: 'route', route: { page: 'privacy', locale: first } };
  if (rest[0] === 'challenges') {
    // 挑战区是课程之外的第二条入口，索引页与单题页共用 /challenges 前缀。
    if (!rest[1]) return { kind: 'route', route: { page: 'challenges', locale: first } };
    return { kind: 'route', route: { page: 'challenge', locale: first, slug: rest[1] } };
  }
  if (rest[0] === 'learn') {
    // 目录页没有独立形态，直接落到第一节。
    if (!rest[1]) return { kind: 'redirect', path: `/${first}/learn/${FIRST_LESSON_SLUG}` };
    return { kind: 'route', route: { page: 'lesson', locale: first, slug: rest[1] } };
  }
  return { kind: 'route', route: { page: 'notFound', locale: first } };
};

export const canonicalRoutePath = (route: Route): string => {
  switch (route.page) {
    case 'lesson':
      return `/${route.locale}/learn/${route.slug ?? FIRST_LESSON_SLUG}`;
    case 'playground':
      return `/${route.locale}/playground`;
    case 'reference':
      return `/${route.locale}/reference`;
    case 'privacy':
      return `/${route.locale}/privacy`;
    case 'challenges':
      return `/${route.locale}/challenges`;
    case 'challenge':
      return `/${route.locale}/challenges/${route.slug ?? CHALLENGES[0]!.slug}`;
    default:
      return localeHomePath(route.locale);
  }
};
