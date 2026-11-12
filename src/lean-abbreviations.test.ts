import { describe, expect, it } from 'vitest';
import {
  LEAN_ABBREVIATIONS,
  abbreviationSuggestions,
  findAbbreviationQuery,
  matchAbbreviation,
} from './lean-abbreviations';

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

  it('支持 \\< 与 \\> 括号缩写', () => {
    expect(matchAbbreviation('\\<', 3)).toEqual({ startColumn: 1, symbol: '⟨' });
    expect(matchAbbreviation('\\>', 3)).toEqual({ startColumn: 1, symbol: '⟩' });
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

describe('findAbbreviationQuery', () => {
  it('光标在反斜杠后时进入候选模式', () => {
    expect(findAbbreviationQuery('', 1)).toBeNull();
    expect(findAbbreviationQuery('\\', 2)).toEqual({ startColumn: 1, query: '' });
    expect(findAbbreviationQuery('x \\for', 7)).toEqual({ startColumn: 3, query: 'for' });
    expect(findAbbreviationQuery('\\<', 3)).toEqual({ startColumn: 1, query: '<' });
  });

  it('只认行尾且不跨过空格', () => {
    expect(findAbbreviationQuery('x \\to y', 8)).toBeNull();
    expect(findAbbreviationQuery('\\to ', 5)).toBeNull();
  });
});

describe('abbreviationSuggestions', () => {
  it('空前缀返回整张表，常用符号保持表内顺序', () => {
    const all = abbreviationSuggestions('');
    expect(all.length).toBe(Object.keys(LEAN_ABBREVIATIONS).length);
    expect(all[0]).toEqual({ name: 'to', symbol: '→' });
    expect(abbreviationSuggestions('to')[0]).toEqual({ name: 'to', symbol: '→' });
  });

  it('按前缀筛选并保留大小写', () => {
    expect(abbreviationSuggestions('Ga')).toEqual([{ name: 'Gamma', symbol: 'Γ' }]);
    expect(abbreviationSuggestions('zzz')).toEqual([]);
  });
});
