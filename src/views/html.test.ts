import { describe, expect, it } from 'vitest';
import { escapeHtml, renderInlineCode } from './html';

describe('escapeHtml', () => {
  it('escapes characters that could break out of markup', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersands before other entities', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves Lean syntax untouched', () => {
    expect(escapeHtml('theorem add_comm (a b : Nat) : a + b = b + a := by')).toBe(
      'theorem add_comm (a b : Nat) : a + b = b + a := by',
    );
  });
});

describe('renderInlineCode', () => {
  it('把成对反引号转成行内代码，并保留周围文本', () => {
    expect(renderInlineCode('把 `sorry` 换成 `rfl` 即可')).toBe(
      '把 <code class="rounded bg-panel-soft px-1 py-0.5 font-mono text-[0.92em] leading-normal text-fg">sorry</code> 换成 <code class="rounded bg-panel-soft px-1 py-0.5 font-mono text-[0.92em] leading-normal text-fg">rfl</code> 即可',
    );
  });

  it('代码内容先转义，不会带出可执行标记', () => {
    expect(renderInlineCode('`const x: number = "abc"`')).toContain(
      '<code class="rounded bg-panel-soft px-1 py-0.5 font-mono text-[0.92em] leading-normal text-fg">const x: number = &quot;abc&quot;</code>',
    );
    expect(renderInlineCode('`<script>`')).not.toContain('<script>');
  });

  it('落单的反引号按普通文本保留', () => {
    expect(renderInlineCode('这里只有一个 ` 反引号')).toBe('这里只有一个 ` 反引号');
  });

  it('不跨行配对，避免把两段正文吞进同一个代码块', () => {
    expect(renderInlineCode('开头 `a\n结尾 b`')).toBe('开头 `a\n结尾 b`');
  });
});
