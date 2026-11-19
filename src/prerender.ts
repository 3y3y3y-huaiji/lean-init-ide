import { CHALLENGES } from './challenges';
import { REPO_URL } from './feedback';
import { LESSON_CATALOG, type Locale } from './i18n';
import { SITE_ORIGIN, swapLocalePath } from './meta';
import { pageDescription, pageTitle, renderNotFound } from './page-meta';
import { canonicalRoutePath, FIRST_LESSON_SLUG, type Route } from './router';
import { renderChallenge, renderChallenges } from './views/challenge';
import { renderHome } from './views/home';
import { escapeHtml } from './views/html';
import { renderLayout } from './views/layout';
import { renderLesson } from './views/lesson';
import { renderPlayground } from './views/playground';
import { renderPrivacy } from './views/privacy';
import { renderReference } from './views/reference';

export { pageDescription, pageTitle, renderNotFound };

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 首页与 Playground 的 WebApplication 结构化数据；内联到预渲染 HTML，爬虫无需执行 JS。 */
const webApplicationJsonLd = (
  route: Route,
  canonical: string,
  title: string,
  description: string,
): string =>
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: title,
    url: canonical,
    description,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires WebAssembly, Web Workers and cross-origin isolation',
    inLanguage: route.locale === 'zh' ? 'zh-CN' : 'en',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    sameAs: [REPO_URL],
  }).replaceAll('<', '\\u003c');

/** 将主样式表内联为 <style>，消除首屏渲染阻塞请求。 */
export const inlineStylesheet = (html: string, cssHref: string, cssText: string): string => {
  const escapedHref = escapeRegExp(cssHref);
  const pattern = new RegExp(
    `<link\\b(?=[^>]*\\brel=["']stylesheet["'])(?=[^>]*\\bhref=["']${escapedHref}["'])[^>]*>`,
    'i',
  );
  if (!pattern.test(html)) return html;
  const safeCss = cssText.replaceAll('</style', '<\\/style');
  return html.replace(pattern, () => `<style>${safeCss}</style>`);
};

export const renderStaticApp = (route: Route): string => {
  const pathname = canonicalRoutePath(route);
  let content: string;
  switch (route.page) {
    case 'lesson':
      content = renderLesson(route.locale, route.slug);
      break;
    case 'playground':
      content = renderPlayground(route.locale);
      break;
    case 'privacy':
      content = renderPrivacy(route.locale);
      break;
    case 'reference':
      content = renderReference(route.locale);
      break;
    case 'challenges':
      content = renderChallenges(route.locale);
      break;
    case 'challenge':
      content = renderChallenge(route.locale, route.slug);
      break;
    case 'notFound':
      content = renderNotFound(route.locale);
      break;
    default:
      content = renderHome(route.locale);
  }
  return renderLayout(route.locale, route.page === 'notFound' ? 'home' : route.page, content, {
    pathname,
  });
};

/** 列出需要构建期预渲染的公开路由；按语言 × 页面展平，与站点地图对齐。 */
export const allStaticRoutes = (locales: readonly Locale[] = ['zh', 'en']): Route[] => {
  const routes: Route[] = [];
  for (const locale of locales) {
    routes.push({ page: 'home', locale });
    routes.push({ page: 'playground', locale });
    routes.push({ page: 'reference', locale });
    routes.push({ page: 'privacy', locale });
    routes.push({ page: 'challenges', locale });
    for (const lesson of LESSON_CATALOG) {
      routes.push({ page: 'lesson', locale, slug: lesson.slug });
    }
    for (const challenge of CHALLENGES) {
      routes.push({ page: 'challenge', locale, slug: challenge.slug });
    }
  }
  return routes;
};

/** 对应 Cloudflare Pages Pretty URLs 约定，非目录页输出 `<path>.html` 避免尾部斜杠 308 跳转。 */
export const outputRelPath = (route: Route): string => {
  switch (route.page) {
    case 'home':
      // 英文首页是站点根入口，直接覆盖 dist/index.html；中文仍输出 /zh/index.html。
      return route.locale === 'en' ? 'index.html' : `${route.locale}/index.html`;
    case 'lesson':
      return `${route.locale}/learn/${route.slug ?? FIRST_LESSON_SLUG}.html`;
    case 'playground':
      return `${route.locale}/playground.html`;
    case 'reference':
      return `${route.locale}/reference.html`;
    case 'privacy':
      return `${route.locale}/privacy.html`;
    case 'challenges':
      return `${route.locale}/challenges.html`;
    case 'challenge':
      return `${route.locale}/challenges/${route.slug ?? CHALLENGES[0]!.slug}.html`;
    default:
      return 'index.html';
  }
};

export const injectPrerenderedHtml = (
  templateHtml: string,
  route: Route,
  preloads: readonly string[] = [],
): string => {
  const ssgPath = canonicalRoutePath(route);
  const title = pageTitle(route);
  const description = pageDescription(route);
  const canonical = `${SITE_ORIGIN}${ssgPath}`;
  const altZh = `${SITE_ORIGIN}${route.locale === 'zh' ? ssgPath : swapLocalePath(ssgPath, route.locale)}`;
  const altEn = `${SITE_ORIGIN}${route.locale === 'en' ? ssgPath : swapLocalePath(ssgPath, route.locale)}`;
  const ogLocale = route.locale === 'zh' ? 'zh_CN' : 'en_US';
  const htmlLang = route.locale === 'zh' ? 'zh-CN' : 'en';
  const bodyPage = route.page === 'playground' ? 'playground' : 'content';
  const isAppPage = route.page === 'home' || route.page === 'playground';

  const headExtra = [
    ...preloads.map(
      (href) => `<link rel="modulepreload" crossorigin href="${escapeHtml(href)}" />`,
    ),
    `<meta name="lean-ssg" content="${escapeHtml(ssgPath)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<link rel="alternate" hreflang="zh" href="${escapeHtml(altZh)}" />`,
    `<link rel="alternate" hreflang="en" href="${escapeHtml(altEn)}" />`,
    // x-default 指向英文版本：英文首页就是根路径 `/`。
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(altEn)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:locale" content="${ogLocale}" />`,
    ...(isAppPage
      ? [
          `<script type="application/ld+json">${webApplicationJsonLd(
            route,
            canonical,
            title,
            description,
          )}</script>`,
        ]
      : []),
  ].join('\n    ');

  const appHtml = renderStaticApp(route);

  return templateHtml
    .replace(/<html\s+lang="[^"]*"/, () => `<html lang="${htmlLang}"`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      () => `<meta name="description" content="${escapeHtml(description)}" />`,
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
      () => `<meta property="og:title" content="${escapeHtml(title)}" />`,
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
      () => `<meta property="og:description" content="${escapeHtml(description)}" />`,
    )
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/,
      () => `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
      () => `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    )
    .replace('</head>', () => `    ${headExtra}\n  </head>`)
    .replace(/<body\s+data-page="[^"]*">/, () => `<body data-page="${bodyPage}">`)
    .replace('<div id="app"></div>', () => `<div id="app">${appHtml}</div>`);
};
