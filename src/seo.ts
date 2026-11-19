/**
 * 站点 SEO 与智能体发现产物的唯一构造入口：sitemap.xml、robots.txt、llms.txt 与 ai-catalog.json。
 *
 * 构建期由 scripts/generate-seo.mjs 调用；路由不在这里枚举，
 * 而是复用 src/prerender.ts 的 allStaticRoutes，与预渲染页面保持同一份数据源。
 */
import { CHALLENGES } from './challenges';
import { REPO_URL } from './feedback';
import { lessonsFor, messagesFor } from './i18n';
import { LEAN_RUNTIME_VERSION, SITE_LICENSE, SITE_ORIGIN } from './meta';
import { FIRST_LESSON_SLUG, type Route } from './router';

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

/** 站点级 SoftwareApplication JSON-LD：供搜索富媒体卡片与 AI 引擎结构化抽取共用。 */
export const buildSoftwareApplicationJsonLd = (origin: string = SITE_ORIGIN): string => {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Lean Init IDE',
    alternateName: '浏览器里的 Lean 4 定理证明器',
    url: `${origin}/zh/`,
    description:
      '在浏览器里运行真正的 Lean 4 编译器与语言服务器：WebAssembly + Web Worker，零后端，内置 Init，Std 与 Batteries 按需挂载。',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any (modern web browser)',
    browserRequirements:
      'WebAssembly, Web Workers and SharedArrayBuffer (cross-origin isolation); Chromium-based browsers recommended',
    inLanguage: ['zh-CN', 'en'],
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
    codeRepository: REPO_URL,
    softwareVersion: LEAN_RUNTIME_VERSION,
    featureList: [
      `${LEAN_RUNTIME_VERSION} compiler and language server compiled to WebAssembly`,
      'Runs entirely in the browser in a Web Worker with no backend',
      'Init built in; Std and Batteries mounted on demand',
      'Bilingual courses, playground and math challenges; free and open source',
    ],
    keywords: ['Lean 4', 'theorem prover', 'WebAssembly', 'browser IDE', 'formal verification'],
  };
  // 直接内联进 <script>，转义 `<` 避免任何字符串提前闭合标签。
  return JSON.stringify(data, null, 2).replaceAll('<', '\\u003c');
};

/** 生成符合 llmstxt.org 规范的站点摘要与结构化导航索引。 */
export const buildLlmsTxt = (origin: string = SITE_ORIGIN): string => {
  const en = messagesFor('en');
  const zh = messagesFor('zh');
  const lessonCount = lessonsFor('en').length;
  const challengeCount = CHALLENGES.length;
  const lessonLines = (locale: 'en' | 'zh') =>
    lessonsFor(locale).map(
      (lesson) => `- [${lesson.title}](${origin}/${locale}/learn/${lesson.slug}): ${lesson.lead}`,
    );
  const challengeLines = (locale: 'en' | 'zh') =>
    CHALLENGES.map(
      (challenge) =>
        `- [${challenge.title[locale]}](${origin}/${locale}/challenges/${challenge.slug}): ${challenge.summary[locale]}`,
    );

  return [
    '# Lean Init IDE',
    '',
    `> ${en.home.lead}`,
    '',
    '## Key facts',
    '',
    `- Runtime: ${LEAN_RUNTIME_VERSION} compiler and language server, compiled to WebAssembly and running in a browser Web Worker.`,
    '- Execution: 100% client-side with zero backend; code never leaves the browser.',
    '- Libraries: Init built in; Std and Batteries load on demand. No Lean / Lake / Mathlib.',
    `- Content: ${lessonCount} lessons per language (Chinese / English) and ${challengeCount} math challenges.`,
    `- Free and open source (${SITE_LICENSE}): ${REPO_URL}`,
    '',
    '## 关键事实',
    '',
    `- 运行时：${LEAN_RUNTIME_VERSION} 编译器与语言服务器编译为 WebAssembly，在浏览器 Web Worker 内运行。`,
    '- 执行方式：100% 浏览器端，零后端，代码不上传服务器。',
    '- 库：内置 Init，Std 与 Batteries 按需挂载；不含 Lean / Lake / Mathlib。',
    `- 内容：中英各 ${lessonCount} 节课程 + ${challengeCount} 道趣味数学挑战。`,
    `- 免费开源（${SITE_LICENSE}）：${REPO_URL}`,
    '',
    '## Core Pages (English)',
    '',
    `- [${en.nav.home}](${origin}/en/): ${en.home.title}`,
    `- [${en.nav.lesson}](${origin}/en/learn/${FIRST_LESSON_SLUG}): ${en.home.courseBody}`,
    `- [${en.nav.challenges}](${origin}/en/challenges): ${en.challenges.lead}`,
    `- [${en.nav.playground}](${origin}/en/playground): ${en.playground.hint}`,
    `- [${en.nav.reference}](${origin}/en/reference): ${en.reference.lead}`,
    `- [${en.privacy.title}](${origin}/en/privacy): ${en.privacy.intro}`,
    '',
    '## 核心页面 (中文)',
    '',
    `- [${zh.nav.home}](${origin}/zh/): ${zh.home.title}`,
    `- [${zh.nav.lesson}](${origin}/zh/learn/${FIRST_LESSON_SLUG}): ${zh.home.courseBody}`,
    `- [${zh.nav.challenges}](${origin}/zh/challenges): ${zh.challenges.lead}`,
    `- [${zh.nav.playground}](${origin}/zh/playground): ${zh.playground.hint}`,
    `- [${zh.nav.reference}](${origin}/zh/reference): ${zh.reference.lead}`,
    `- [${zh.privacy.title}](${origin}/zh/privacy): ${zh.privacy.intro}`,
    '',
    '## Lessons (English)',
    '',
    ...lessonLines('en'),
    '',
    '## 课程列表 (中文)',
    '',
    ...lessonLines('zh'),
    '',
    '## Math Challenges (English)',
    '',
    ...challengeLines('en'),
    '',
    '## 趣味数学挑战 (中文)',
    '',
    ...challengeLines('zh'),
    '',
  ].join('\n');
};

/** 生成合法的 ARD 清单（当前站点不对外暴露 MCP/A2A 端点，entries 为空数组）。 */
export const buildAiCatalogJson = (origin: string = SITE_ORIGIN): string => {
  const host = new URL(origin).host;
  return `${JSON.stringify(
    {
      specVersion: '1.0',
      host: {
        displayName: 'Lean Init IDE',
        identifier: `did:web:${host}`,
        documentationUrl: `${origin}/llms.txt`,
      },
      entries: [],
    },
    null,
    2,
  )}\n`;
};

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
  if (route.page === 'lesson') files.push(`src/i18n/lessons-${route.locale}.ts`);
  if (route.page === 'challenge') files.push('src/challenges.ts');
  return files;
};
