import { describe, expect, it } from 'vitest';
import { messagesFor } from '../i18n';
import { renderHome } from './home';

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
      expect(html.match(/<article/g)?.length, locale).toBe(expected + 3);
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

  it('两种语言的标题都出现在页面里', () => {
    expect(renderHome('zh')).toContain(messagesFor('zh').home.title);
    expect(renderHome('en')).toContain(messagesFor('en').home.title);
  });
});
