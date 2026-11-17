import { describe, expect, it } from 'vitest';
import { messagesFor } from '../i18n';
import { hydrateHome, renderHome } from './home';

describe('首页渲染', () => {
  it('主行动按钮指向当前语言的课程页', () => {
    expect(renderHome('zh')).toContain('href="/zh/learn/what-is-lean"');
    expect(renderHome('en')).toContain('href="/en/learn/what-is-lean"');
  });

  it('次要行动按钮指向 playground', () => {
    expect(renderHome('zh')).toContain('href="/zh/playground"');
    expect(renderHome('en')).toContain('href="/en/playground"');
  });

  it('有完成进度时继续学习指向第一节未完成课', () => {
    const html = renderHome('zh', new Set(['what-is-lean']), new Set(['what-is-lean']));
    expect(html).toContain('href="/zh/learn/first-proof"');
    expect(html).toContain(messagesFor('zh').home.continueCta);
  });

  it('只有已读、没有完成时，继续学习回到第一节未完成课', () => {
    const html = renderHome('zh', new Set(['first-proof']), new Set());
    expect(html).toContain('href="/zh/learn/what-is-lean"');
  });

  it('每条特性都渲染成独立卡片', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderHome(locale);
      const expected = messagesFor(locale).home.features.length;
      expect(html.match(/<article/g)?.length, locale).toBe(expected + 4);
    }
  });

  it('数学与验证路径入口指向第一节数学课', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderHome(locale);
      const mathLessons = messagesFor(locale).lesson.lessons.filter(
        (lesson) => lesson.track === 'math',
      );
      expect(html).toContain(messagesFor(locale).lesson.tracks.math.title);
      expect(html).toContain(`href="/${locale}/learn/${mathLessons[0]!.slug}"`);
    }
  });

  it('工程实战路径入口指向第一节工程课', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderHome(locale);
      const engLessons = messagesFor(locale).lesson.lessons.filter(
        (lesson) => lesson.track === 'eng',
      );
      expect(engLessons.length, locale).toBe(5);
      expect(html).toContain(messagesFor(locale).lesson.tracks.eng.title);
      expect(html).toContain(`href="/${locale}/learn/${engLessons[0]!.slug}"`);
    }
  });

  it('两种语言的标题都出现在页面里', () => {
    expect(renderHome('zh')).toContain(messagesFor('zh').home.title);
    expect(renderHome('en')).toContain(messagesFor('en').home.title);
  });

  it('hydrateHome 原地更新进度链接与文案且不替换主标题节点', () => {
    document.body.innerHTML = renderHome('zh');
    const originalH1 = document.body.querySelector('h1');

    hydrateHome(document.body, 'zh', new Set(['what-is-lean']), new Set(['what-is-lean']));

    expect(document.body.querySelector('h1')).toBe(originalH1);
    const primary = document.body.querySelector<HTMLAnchorElement>('[data-home-cta="primary"]');
    expect(primary?.getAttribute('href')).toBe('/zh/learn/first-proof');
    expect(primary?.textContent).toBe(messagesFor('zh').home.continueCta);
    const intro = document.body.querySelector<HTMLAnchorElement>('[data-home-cta="intro"]');
    expect(intro?.getAttribute('href')).toBe('/zh/learn/first-proof');
    const mathLessons = messagesFor('zh').lesson.lessons.filter(
      (lesson) => lesson.track === 'math',
    );
    if (mathLessons.length >= 2) {
      hydrateHome(document.body, 'zh', new Set(), new Set([mathLessons[0]!.slug]));
      const math = document.body.querySelector<HTMLAnchorElement>('[data-home-cta="math"]');
      expect(math?.getAttribute('href')).toBe(`/zh/learn/${mathLessons[1]!.slug}`);
    }
  });

  it('hydrateHome 在空容器中安全无操作', () => {
    const empty = document.createElement('div');
    expect(() => hydrateHome(empty, 'en')).not.toThrow();
  });
});
