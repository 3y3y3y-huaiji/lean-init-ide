import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html';

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
