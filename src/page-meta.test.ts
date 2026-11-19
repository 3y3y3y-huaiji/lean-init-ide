import { describe, expect, it } from 'vitest';
import { lessonsFor, messagesFor } from './i18n';
import { pageDescription, pageTitle, renderNotFound } from './page-meta';

describe('page-meta', () => {
  it('按路由生成中英文标题与描述并在缺失课时回退第一课', () => {
    const zh = messagesFor('zh');
    const en = messagesFor('en');
    const hanCount = (value: string) =>
      Array.from(value).filter((char) => /\p{Script=Han}/u.test(char)).length;

    expect(hanCount(pageTitle({ page: 'home', locale: 'zh' }))).toBeGreaterThanOrEqual(15);
    expect(pageTitle({ page: 'home', locale: 'en' }).length).toBeGreaterThanOrEqual(30);
    expect(pageDescription({ page: 'home', locale: 'en' }).length).toBeGreaterThanOrEqual(110);

    expect(pageTitle({ page: 'playground', locale: 'zh' })).toContain('Playground');
    expect(pageDescription({ page: 'playground', locale: 'en' })).toContain('Lean 4 Playground');

    expect(pageTitle({ page: 'privacy', locale: 'en' })).toContain(en.privacy.title);
    expect(pageDescription({ page: 'privacy', locale: 'zh' })).toBe(zh.privacy.intro);

    expect(pageTitle({ page: 'reference', locale: 'zh' })).toContain(zh.reference.title);
    expect(pageDescription({ page: 'reference', locale: 'en' })).toBe(en.reference.lead);

    expect(pageTitle({ page: 'notFound', locale: 'en' })).toContain(en.notFound.title);
    expect(pageDescription({ page: 'notFound', locale: 'zh' })).toContain(zh.home.lead);

    const fallbackTitle = pageTitle({ page: 'lesson', locale: 'zh', slug: 'nonexistent-slug' });
    expect(fallbackTitle).toContain(lessonsFor('zh')[0]!.title);
    expect(pageDescription({ page: 'lesson', locale: 'en', slug: 'nonexistent-slug' })).toContain(
      lessonsFor('en')[0]!.lead,
    );

    expect(pageTitle({ page: 'challenges', locale: 'zh' })).toContain('挑战');
    const challengesDesc = pageDescription({ page: 'challenges', locale: 'en' });
    expect(challengesDesc).toContain('plain-language');
    expect(challengesDesc.length).toBeLessThanOrEqual(155);
    expect(pageTitle({ page: 'challenge', locale: 'zh', slug: 'add-comm' })).toBeTruthy();
    expect(pageDescription({ page: 'challenge', locale: 'en', slug: 'unknown' })).toBeTruthy();

    // 覆盖中文描述超过 85 汉字时的截断逻辑（truncateHan）。
    for (const lesson of lessonsFor('zh')) {
      expect(
        hanCount(pageDescription({ page: 'lesson', locale: 'zh', slug: lesson.slug })),
      ).toBeLessThanOrEqual(85);
    }
  });

  it('404 视图渲染对应语言的标题与回首页链接', () => {
    const zhHtml = renderNotFound('zh');
    const enHtml = renderNotFound('en');

    expect(zhHtml).toContain('href="/zh/"');
    expect(zhHtml).toContain(messagesFor('zh').notFound.title);
    expect(enHtml).toContain('href="/"');
    expect(enHtml).toContain(messagesFor('en').notFound.title);
  });
});
