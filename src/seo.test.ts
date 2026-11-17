import { describe, expect, it } from 'vitest';
import { messagesFor } from './i18n';
import { SITE_ORIGIN } from './meta';
import { allStaticRoutes } from './prerender';
import { canonicalRoutePath } from './router';
import {
  buildRobotsTxt,
  buildSitemapXml,
  escapeXml,
  NOT_INDEXED_PATHS,
  routeSourceFiles,
  type SitemapEntry,
} from './seo';

const entriesForAllRoutes = (): SitemapEntry[] =>
  allStaticRoutes(['zh', 'en']).map((route) => ({
    loc: `${SITE_ORIGIN}${canonicalRoutePath(route)}`,
    lastmod: '2025-01-02',
  }));

describe('SEO 产物生成', () => {
  it('sitemap 覆盖全部公开路由，课程 URL 数量与课程数据源一致', () => {
    const routes = allStaticRoutes(['zh', 'en']);
    const xml = buildSitemapXml(entriesForAllRoutes());

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.endsWith('</urlset>\n')).toBe(true);

    const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]!);
    expect(locs).toHaveLength(routes.length);
    expect(new Set(locs).size).toBe(locs.length);

    let lessonCount = 0;
    for (const locale of ['zh', 'en'] as const) {
      const lessons = messagesFor(locale).lesson.lessons;
      expect(locs).toContain(`${SITE_ORIGIN}/${locale}/`);
      for (const page of ['playground', 'reference', 'privacy']) {
        expect(locs).toContain(`${SITE_ORIGIN}/${locale}/${page}`);
      }
      for (const lesson of lessons) {
        expect(locs).toContain(`${SITE_ORIGIN}/${locale}/learn/${lesson.slug}`);
      }
      lessonCount += lessons.length;
    }
    // 每条路由都有唯一的 lastmod，且不是用构建时间批量刷新出来的时间戳。
    expect(xml.match(/<lastmod>2025-01-02<\/lastmod>/g)).toHaveLength(routes.length);
    expect(locs.filter((loc) => loc.includes('/learn/'))).toHaveLength(lessonCount);
  });

  it('缺少或非法 lastmod 时不写该标签，并转义特殊字符', () => {
    const xml = buildSitemapXml([
      { loc: `${SITE_ORIGIN}/zh/` },
      { loc: `${SITE_ORIGIN}/zh/?a=1&b=2`, lastmod: 'not-a-date' },
    ]);
    expect(xml.match(/<lastmod>/g)).toBeNull();
    expect(xml).toContain('a=1&amp;b=2');
    expect(escapeXml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;');
  });

  it('robots.txt 允许公开页面抓取、排除内部路径并声明 sitemap', () => {
    const robots = buildRobotsTxt();
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    for (const path of NOT_INDEXED_PATHS) expect(robots).toContain(`Disallow: ${path}`);
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(robots.endsWith('\n')).toBe(true);
  });

  it('lastmod 来源指向对应语言与页面源文件', () => {
    expect(routeSourceFiles({ page: 'lesson', locale: 'zh', slug: 'first-proof' })).toEqual([
      'src/i18n/zh.ts',
      'src/views/lesson.ts',
    ]);
    expect(routeSourceFiles({ page: 'playground', locale: 'en' })).toEqual([
      'src/i18n/en.ts',
      'src/views/playground.ts',
    ]);
    expect(routeSourceFiles({ page: 'notFound', locale: 'zh' })).toEqual(['src/i18n/zh.ts']);
  });
});
