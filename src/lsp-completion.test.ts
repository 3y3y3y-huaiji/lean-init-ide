import * as monaco from 'monaco-editor/editor/editor.api';
import { describe, expect, it } from 'vitest';
import { toMonacoCompletions } from './lsp-completion';

const fallback = new monaco.Range(1, 1, 1, 1);

describe('toMonacoCompletions', () => {
  it('把标签、类型、详情和文档转成 Monaco 结构', () => {
    const { suggestions, incomplete } = toMonacoCompletions(
      {
        isIncomplete: true,
        items: [
          {
            label: 'add',
            kind: 3,
            detail: 'Nat → Nat → Nat',
            documentation: { value: '加法' },
            insertText: 'add',
            sortText: 'a',
            filterText: 'add',
            preselect: true,
          },
        ],
      },
      fallback,
    );

    expect(incomplete).toBe(true);
    expect(suggestions[0]).toMatchObject({
      label: 'add',
      kind: monaco.languages.CompletionItemKind.Function,
      detail: 'Nat → Nat → Nat',
      documentation: '加法',
      insertText: 'add',
      sortText: 'a',
      filterText: 'add',
      preselect: true,
    });
  });

  it('优先使用服务端 textEdit 的范围', () => {
    const { suggestions } = toMonacoCompletions(
      [
        {
          label: 'add',
          textEdit: {
            range: {
              start: { line: 2, character: 3 },
              end: { line: 2, character: 5 },
            },
            newText: 'Nat.add',
          },
        },
      ],
      fallback,
    );

    expect(suggestions[0]?.insertText).toBe('Nat.add');
    expect(suggestions[0]?.range).toEqual(new monaco.Range(3, 4, 3, 6));
  });

  it('兼容 InsertReplaceEdit 的 insert 分支与 snippet 格式', () => {
    const { suggestions } = toMonacoCompletions(
      [
        {
          label: 'induction',
          insertTextFormat: 2,
          textEdit: {
            insert: {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } },
              newText: 'induction ${1:n}',
            },
            replace: {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 9 } },
              newText: 'induction ${1:n}',
            },
          },
        },
      ],
      fallback,
    );

    expect(suggestions[0]?.insertText).toBe('induction ${1:n}');
    expect(suggestions[0]?.insertTextRules).toBe(
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    );
    expect(suggestions[0]?.range).toEqual(new monaco.Range(1, 1, 1, 3));
  });

  it('空结果返回空列表', () => {
    expect(toMonacoCompletions(null, fallback)).toEqual({ suggestions: [], incomplete: false });
    expect(toMonacoCompletions([], fallback)).toEqual({ suggestions: [], incomplete: false });
  });
});
