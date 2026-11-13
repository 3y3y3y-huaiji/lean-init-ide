import { describe, expect, it } from 'vitest';
import { messagesFor } from '../i18n';
import { renderReference } from './reference';

describe('速查表页面', () => {
  it('渲染策略、符号和报错三块内容', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderReference(locale);
      const t = messagesFor(locale).reference;

      expect(html).toContain(t.title);
      expect(html).toContain(t.tacticsTitle);
      expect(html).toContain(t.symbolsTitle);
      expect(html).toContain(t.errorsTitle);
      for (const tactic of t.tactics) expect(html).toContain(tactic.name);
      for (const symbol of t.symbols) expect(html).toContain(symbol.abbreviation);
      for (const error of t.errors) expect(html).toContain(error.error);
    }
  });

  it('按钮指向 playground 与第一课', () => {
    expect(renderReference('zh')).toContain('href="/zh/playground"');
    expect(renderReference('en')).toContain('href="/en/learn/what-is-lean"');
  });
});
