import { describe, expect, it } from 'vitest';
import { CHALLENGES } from './challenges';
import { LESSON_CATALOG, lessonsFor, messagesFor } from './i18n';
import {
  allStaticRoutes,
  injectPrerenderedHtml,
  inlineStylesheet,
  outputRelPath,
  pageDescription,
  pageTitle,
  renderNotFound,
  renderStaticApp,
} from './prerender';

const BASE_TEMPLATE = `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <title>Lean Init IDE</title>
    <meta name="description" content="placeholder" />
    <meta property="og:title" content="placeholder" />
    <meta property="og:description" content="placeholder" />
    <meta name="twitter:title" content="placeholder" />
    <meta name="twitter:description" content="placeholder" />
  </head>
  <body data-page="content">
    <div id="app"></div>
    <script type="module" crossorigin src="/assets/index-test.js"></script>
  </body>
</html>`;

describe('SSG 预渲染', () => {
  it('覆盖中英文全部公开静态路由并映射正确的输出路径', () => {
    const routes = allStaticRoutes(['zh', 'en']);
    const expectedLessons = LESSON_CATALOG.length;
    expect(routes.length).toBe(2 * (5 + expectedLessons + CHALLENGES.length));
    expect(outputRelPath({ page: 'home', locale: 'zh' })).toBe('zh/index.html');
    expect(outputRelPath({ page: 'playground', locale: 'en' })).toBe('en/playground.html');
    expect(outputRelPath({ page: 'lesson', locale: 'zh', slug: 'what-is-lean' })).toBe(
      'zh/learn/what-is-lean.html',
    );
    expect(outputRelPath({ page: 'reference', locale: 'en' })).toBe('en/reference.html');
    expect(outputRelPath({ page: 'privacy', locale: 'zh' })).toBe('zh/privacy.html');
    expect(outputRelPath({ page: 'challenges', locale: 'zh' })).toBe('zh/challenges.html');
    expect(outputRelPath({ page: 'challenge', locale: 'en', slug: 'even-plus-even' })).toBe(
      'en/challenges/even-plus-even.html',
    );
    expect(outputRelPath({ page: 'notFound', locale: 'zh' })).toBe('index.html');
  });

  it('注入 SSG DOM、SEO 元信息与 modulepreload，并保留 #app 原样供构建校验', () => {
    const html = injectPrerenderedHtml(
      BASE_TEMPLATE,
      { page: 'lesson', locale: 'en', slug: 'what-is-lean' },
      ['/assets/en-123.js', '/assets/lesson-456.js'],
    );
    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<meta name="lean-ssg" content="/en/learn/what-is-lean" />');
    expect(html).toContain('<link rel="modulepreload" crossorigin href="/assets/en-123.js" />');
    expect(html).toContain('<link rel="modulepreload" crossorigin href="/assets/lesson-456.js" />');
    expect(html).toContain(
      '<link rel="canonical" href="https://criticalthinking.de5.net/en/learn/what-is-lean" />',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="zh" href="https://criticalthinking.de5.net/zh/learn/what-is-lean" />',
    );
    expect(html).toMatch(/<div id="app">\s*<header/);
    expect(html).toContain(`>${lessonsFor('en')[0]!.title}</h1>`);
  });

  it('首页预渲染恰好包含一个 H1，保证根路径回落到 index.html 时可被索引', () => {
    const html = injectPrerenderedHtml(BASE_TEMPLATE, { page: 'home', locale: 'zh' });
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(`>${messagesFor('zh').home.title}</h1>`);
  });

  it('playground 预渲染设置 body data-page=playground 且不含空壳 h1 缺失问题', () => {
    const html = injectPrerenderedHtml(BASE_TEMPLATE, { page: 'playground', locale: 'zh' });
    expect(html).toContain('<body data-page="playground">');
    expect(html).toContain('data-ssr-markup="full"');
    expect(html).toContain(`>${messagesFor('zh').playground.title}</h1>`);
    expect(html).toContain('100svh');
  });

  it('各页面标题、描述与 404 视图渲染正确且含 $ 字符时不会被替换语法破坏', () => {
    const refTitle = pageTitle({ page: 'reference', locale: 'en' });
    expect(refTitle).toContain(messagesFor('en').reference.title);
    expect(pageDescription({ page: 'privacy', locale: 'zh' })).toBe(
      messagesFor('zh').privacy.intro,
    );
    expect(pageTitle({ page: 'notFound', locale: 'zh' })).toContain(
      messagesFor('zh').notFound.title,
    );
    expect(renderNotFound('en')).toContain(messagesFor('en').notFound.cta);

    // 确认课程页包含 $/lean 或 $ 符号时不会被 String.replace 的 $&/$' 吞改。
    const withDollar = injectPrerenderedHtml(BASE_TEMPLATE, { page: 'reference', locale: 'zh' });
    expect(withDollar).toContain('</html>');
    expect(withDollar).toContain('<script type="module" crossorigin src="/assets/index-test.js">');

    expect(renderStaticApp({ page: 'notFound', locale: 'en' })).toContain('/en/');
    expect(renderStaticApp({ page: 'privacy', locale: 'en' })).toContain('/en/');
  });

  it('inlineStylesheet 内联主样式表并保留 CSS 中的 $ 字符，找不到匹配链接时原样返回', () => {
    const withCss = `${BASE_TEMPLATE.replace(
      '</head>',
      '    <link rel="stylesheet" crossorigin href="/assets/index-abc.css">\n  </head>',
    )}`;
    const inlined = inlineStylesheet(
      withCss,
      '/assets/index-abc.css',
      'body{content:"$&";color:red}</style>',
    );
    expect(inlined).not.toContain('<link rel="stylesheet"');
    expect(inlined).toContain('<style>body{content:"$&";color:red}<\\/style></style>');

    expect(inlineStylesheet(BASE_TEMPLATE, '/assets/missing.css', 'a{}')).toBe(BASE_TEMPLATE);
  });
});
