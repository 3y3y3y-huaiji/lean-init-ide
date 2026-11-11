import { describe, expect, it, vi } from 'vitest';
import { LEAN_LANGUAGE_ID, registerLean } from './lean-language';

type MonacoStub = Parameters<typeof registerLean>[0];

const createMonaco = (existing: string[] = []) => {
  const register = vi.fn();
  const setLanguageConfiguration = vi.fn();
  const setMonarchTokensProvider = vi.fn();

  const monaco = {
    languages: {
      getLanguages: () => existing.map((id) => ({ id })),
      register,
      setLanguageConfiguration,
      setMonarchTokensProvider,
    },
  } as unknown as MonacoStub;

  return { monaco, register, setLanguageConfiguration, setMonarchTokensProvider };
};

describe('Lean 语言注册', () => {
  it('语言 id 稳定，Monaco 侧靠它关联模型', () => {
    expect(LEAN_LANGUAGE_ID).toBe('lean4');
  });

  it('已注册时直接返回，不重复覆盖配置', () => {
    const { monaco, register, setLanguageConfiguration, setMonarchTokensProvider } = createMonaco([
      LEAN_LANGUAGE_ID,
    ]);

    registerLean(monaco);

    expect(register).not.toHaveBeenCalled();
    expect(setLanguageConfiguration).not.toHaveBeenCalled();
    expect(setMonarchTokensProvider).not.toHaveBeenCalled();
  });

  it('首次注册声明 .lean 扩展名与别名', () => {
    const { monaco, register, setLanguageConfiguration } = createMonaco();

    registerLean(monaco);

    expect(register).toHaveBeenCalledWith({
      id: LEAN_LANGUAGE_ID,
      extensions: ['.lean'],
      aliases: ['Lean 4', 'lean'],
    });
    expect(setLanguageConfiguration).toHaveBeenCalledTimes(1);
    expect(setLanguageConfiguration.mock.calls[0]?.[0]).toBe(LEAN_LANGUAGE_ID);
  });

  it('语言配置支持 Lean 的两种注释与 Unicode 括号', () => {
    const { monaco, setLanguageConfiguration } = createMonaco();

    registerLean(monaco);

    const config = setLanguageConfiguration.mock.calls[0]?.[1] as {
      comments: { lineComment: string; blockComment: [string, string] };
      brackets: Array<[string, string]>;
      autoClosingPairs: Array<{ open: string }>;
    };

    expect(config.comments.lineComment).toBe('--');
    expect(config.comments.blockComment).toEqual(['/-', '-/']);
    expect(config.brackets).toContainEqual(['⟨', '⟩']);
    expect(config.autoClosingPairs.map((pair) => pair.open)).toContain('⟨');
  });

  it('Monarch 词法覆盖关键字、tactic 与嵌套注释状态', () => {
    const { monaco, setMonarchTokensProvider } = createMonaco();

    registerLean(monaco);

    const provider = setMonarchTokensProvider.mock.calls[0]?.[1] as {
      keywords: string[];
      tactics: string[];
      tokenizer: Record<string, unknown>;
    };

    for (const keyword of ['theorem', 'def', 'inductive', 'by']) {
      expect(provider.keywords).toContain(keyword);
    }
    for (const tactic of ['simp', 'rw', 'induction']) {
      expect(provider.tactics).toContain(tactic);
    }
    expect(Object.keys(provider.tokenizer)).toEqual(
      expect.arrayContaining(['root', 'comment', 'rawstring']),
    );
  });
});
