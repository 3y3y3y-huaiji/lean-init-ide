import { describe, expect, it } from 'vitest';
import { messagesFor } from './i18n';
import { pageDescription, pageTitle, renderNotFound } from './page-meta';

describe('page-meta', () => {
  it('按路由生成中英文标题与描述并在缺失课时回退第一课', () => {
    const zh = messagesFor('zh');
    const en = messagesFor('en');

    expect(pageTitle({ page: 'home', locale: 'zh' })).toBe('Lean Init IDE');
    expect(pageDescription({ page: 'home', locale: 'en' })).toBe(en.home.lead);

    expect(pageTitle({ page: 'playground', locale: 'zh' })).toContain(zh.playground.title);
    expect(pageDescription({ page: 'playground', locale: 'en' })).toBe(en.playground.hint);

    expect(pageTitle({ page: 'privacy', locale: 'en' })).toContain(en.privacy.title);
    expect(pageDescription({ page: 'privacy', locale: 'zh' })).toBe(zh.privacy.intro);

    expect(pageTitle({ page: 'reference', locale: 'zh' })).toContain(zh.reference.title);
    expect(pageDescription({ page: 'reference', locale: 'en' })).toBe(en.reference.lead);

    expect(pageTitle({ page: 'notFound', locale: 'en' })).toContain(en.notFound.title);
    expect(pageDescription({ page: 'notFound', locale: 'zh' })).toBe(zh.home.lead);

    const fallbackTitle = pageTitle({ page: 'lesson', locale: 'zh', slug: 'nonexistent-slug' });
    expect(fallbackTitle).toContain(zh.lesson.lessons[0]!.title);
    expect(pageDescription({ page: 'lesson', locale: 'en', slug: 'nonexistent-slug' })).toBe(
      en.lesson.lessons[0]!.lead,
    );
  });

  it('404 视图渲染对应语言的标题与回首页链接', () => {
    const zhHtml = renderNotFound('zh');
    const enHtml = renderNotFound('en');

    expect(zhHtml).toContain('href="/zh/"');
    expect(zhHtml).toContain(messagesFor('zh').notFound.title);
    expect(enHtml).toContain('href="/en/"');
    expect(enHtml).toContain(messagesFor('en').notFound.title);
  });
});
