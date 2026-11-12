import { describe, expect, it } from 'vitest';
import { LEAN_ABBREVIATIONS, matchAbbreviation } from './lean-abbreviations';

describe('LEAN_ABBREVIATIONS', () => {
  it('所有缩写都有非空符号，键不带反斜杠', () => {
    for (const [key, symbol] of Object.entries(LEAN_ABBREVIATIONS)) {
      expect(key.startsWith('\\')).toBe(false);
      expect(symbol.length).toBeGreaterThan(0);
    }
  });
});

describe('matchAbbreviation', () => {
  it('匹配行尾缩写并给出替换起点', () => {
    expect(matchAbbreviation('example : 1 \\to', 16)).toEqual({
      startColumn: 13,
      symbol: '→',
    });
    expect(matchAbbreviation('\\forall', 8)).toEqual({ startColumn: 1, symbol: '∀' });
    expect(matchAbbreviation('\\langle', 8)).toEqual({ startColumn: 1, symbol: '⟨' });
  });

  it('区分大小写', () => {
    expect(matchAbbreviation('\\gamma', 7)?.symbol).toBe('γ');
    expect(matchAbbreviation('\\Gamma', 7)?.symbol).toBe('Γ');
  });

  it('忽略不认识的缩写、正文中的缩写和行尾空格', () => {
    expect(matchAbbreviation('\\foo', 5)).toBeNull();
    expect(matchAbbreviation('x \\to y', 8)).toBeNull();
    expect(matchAbbreviation('\\to ', 5)).toBeNull();
  });
});
