import { describe, expect, it } from 'vitest';
import { messagesFor } from '../i18n';
import { renderPrivacy } from './privacy';

describe('renderPrivacy', () => {
  it('渲染标题、更新时间和全部章节', () => {
    const html = renderPrivacy('zh');
    const t = messagesFor('zh').privacy;

    expect(html).toContain(`<h1`);
    expect(html).toContain(t.title);
    expect(html).toContain(t.updated);
    expect(html.match(/<section/g)).toHaveLength(t.sections.length);
    for (const section of t.sections) {
      expect(html).toContain(section.heading);
      expect(html).toContain(section.paragraphs[0]);
    }
  });

  it('返回链接带语言前缀', () => {
    expect(renderPrivacy('en')).toContain('href="/en/"');
    expect(renderPrivacy('zh')).toContain('href="/zh/"');
  });

  it('所有文案都做 HTML 转义', () => {
    const html = renderPrivacy('zh');
    expect(html).not.toContain('<script');
  });
});
