/**
 * 站点 SEO 产物的唯一构造入口：sitemap.xml 与 robots.txt。
 *
 * 构建期由 scripts/generate-seo.mjs 调用；路由不在这里枚举，
 * 而是复用 src/prerender.ts 的 allStaticRoutes，与预渲染页面保持同一份数据源。
 */
import { SITE_ORIGIN } from './meta';
import type { Route } from './router';

export type SitemapEntry = {
  /** 绝对 URL，由 canonical 路由路径拼上 SITE_ORIGIN。 */
  loc: string;
  /** YYYY-MM-DD；缺省时不写 <lastmod>，避免伪造修改时间。 */
  lastmod?: string;
};

/** robots.txt 里不抓取的路径：运行时二进制分片与指标接收端没有索引价值。 */
export const NOT_INDEXED_PATHS = ['/cdn/', '/api/', '/wasm-lean4/'] as const;

const LAST_MOD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export const buildSitemapXml = (entries: readonly SitemapEntry[]): string => {
  const urls = entries.map(({ loc, lastmod }) => {
    const lines = [`    <loc>${escapeXml(loc)}</loc>`];
    // 只接受完整日期，避免把构建时间戳或空串写进 sitemap。
    if (lastmod && LAST_MOD_PATTERN.test(lastmod)) lines.push(`    <lastmod>${lastmod}</lastmod>`);
    return `  <url>\n${lines.join('\n')}\n  </url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
};

export const buildRobotsTxt = (origin: string = SITE_ORIGIN): string =>
  [
    '# 公开课程、速查表与编辑器均允许抓取；运行时分片与指标接口不需要索引。',
    'User-agent: *',
    'Allow: /',
    ...NOT_INDEXED_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');

const VIEW_SOURCE: Record<Route['page'], string | null> = {
  home: 'src/views/home.ts',
  lesson: 'src/views/lesson.ts',
  playground: 'src/views/playground.ts',
  reference: 'src/views/reference.ts',
  privacy: 'src/views/privacy.ts',
  challenges: 'src/views/challenge.ts',
  challenge: 'src/views/challenge.ts',
  // 404 不进 sitemap，没有对应页面源文件。
  notFound: null,
};

/**
 * 路由对应的源文件，用于 git log 取真实最后修改日期。
 * 课程正文在语言包里，所以中英文课程各自跟随 i18n/{locale}.ts 的提交时间；
 * 挑战题的双语正文在 src/challenges.ts，单题页额外跟随这份数据源。
 */
export const routeSourceFiles = (route: Route): string[] => {
  const files = [`src/i18n/${route.locale}.ts`];
  const view = VIEW_SOURCE[route.page];
  if (view) files.push(view);
  if (route.page === 'challenge') files.push('src/challenges.ts');
  return files;
};
