import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as monaco from 'monaco-editor/editor/editor.api';
import { zh } from '../../i18n/zh';
import { createLspProvidersController } from './lsp-providers';

const URI = 'file:///workspace/Main.lean';

const setup = (lines: string[]) => {
  const registered: {
    hover?: monaco.languages.HoverProvider;
    completion?: monaco.languages.CompletionItemProvider;
    definition?: monaco.languages.DefinitionProvider;
  } = {};
  const cursorListeners: Array<() => void> = [];
  const disposables = Array.from({ length: 4 }, () => ({ dispose: vi.fn() }));
  let cursor = { lineNumber: 1, column: 3 };
  const text = lines.join('\n');

  const monacoApi = {
    Range: class {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number,
      ) {}
    },
    Uri: { parse: (raw: string) => raw },
    languages: {
      registerHoverProvider: (_id: string, provider: monaco.languages.HoverProvider) => {
        registered.hover = provider;
        return disposables[0]!;
      },
      registerCompletionItemProvider: (
        _id: string,
        provider: monaco.languages.CompletionItemProvider,
      ) => {
        registered.completion = provider;
        return disposables[1]!;
      },
      registerDefinitionProvider: (_id: string, provider: monaco.languages.DefinitionProvider) => {
        registered.definition = provider;
        return disposables[2]!;
      },
    },
  } as unknown as typeof monaco;

  const model = {
    getVersionId: () => 1,
    getLinesContent: () => lines,
    getLineContent: (ln: number) => lines[ln - 1] ?? '',
    getValue: () => text,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 3 }),
  } as unknown as monaco.editor.ITextModel;

  const editor = {
    getPosition: () => cursor,
    onDidChangeCursorPosition: (cb: () => void) => {
      cursorListeners.push(cb);
      return disposables[3]!;
    },
  } as unknown as monaco.editor.IStandaloneCodeEditor;

  return {
    monacoApi,
    model,
    editor,
    registered,
    disposables,
    setLine: (ln: number) => {
      cursor = { lineNumber: ln, column: 3 };
      for (const cb of cursorListeners) cb();
    },
  };
};

describe('createLspProvidersController', () => {
  const t = zh.playground;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('注册 Hover/Completion/Definition 并转发 LSP，dispose 时全数注销', async () => {
    const statementEl = document.createElement('div');
    const goalTexts: string[] = [];
    const logs: string[] = [];
    const env = setup(['theorem demo : True := by', '  sorry']);
    const sessionRequest = vi.fn(async (method: string) => {
      if (method === 'textDocument/hover') return { contents: { value: 'True : Prop' } };
      if (method === 'textDocument/completion') {
        return { items: [{ label: 'Nat.add_comm', kind: 3 }] };
      }
      if (method === 'textDocument/definition') {
        return [
          { uri: URI, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } } },
          {
            uri: 'file:///other.lean',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          },
        ];
      }
      return {};
    });

    const controller = createLspProvidersController({
      uri: URI,
      t,
      monacoApi: env.monacoApi,
      model: env.model,
      editor: env.editor,
      statementEl,
      setGoalText: (text) => goalTexts.push(text),
      isSessionReady: () => true,
      whenSessionReady: async () => true,
      flushChange: () => {},
      sessionRequest: sessionRequest as never,
      log: (m) => logs.push(m),
    });

    expect(statementEl.textContent).toContain('theorem demo');

    const hover = await env.registered.hover!.provideHover(
      env.model,
      { lineNumber: 1, column: 1 } as monaco.Position,
      {} as never,
    );
    expect(hover?.contents).toEqual([{ value: 'True : Prop' }]);

    const comp = await env.registered.completion!.provideCompletionItems(
      env.model,
      { lineNumber: 1, column: 3 } as monaco.Position,
      {} as never,
      {} as never,
    );
    expect(comp?.suggestions).toHaveLength(1);

    const defs = (await env.registered.definition!.provideDefinition(
      env.model,
      { lineNumber: 1, column: 3 } as monaco.Position,
      {} as never,
    )) as unknown[];
    expect(defs).toHaveLength(1);

    controller.dispose();
    for (const d of env.disposables) expect(d.dispose).toHaveBeenCalledTimes(1);
  });

  it('正确处理 plainGoal 渲染、sorry 行提示、瞬态重试与 MethodNotFound 禁用', async () => {
    vi.useFakeTimers();
    const statementEl = document.createElement('div');
    const goalTexts: string[] = [];
    const env = setup(['theorem demo : True := by', '  sorry']);
    let mode: 'rendered' | 'empty' | 'transient' | 'not-found' = 'rendered';
    const sessionRequest = vi.fn(async () => {
      if (mode === 'rendered') return { rendered: '```lean\n⊢ True\n```' };
      if (mode === 'empty') return { goals: [] };
      if (mode === 'transient') {
        mode = 'rendered';
        throw new Error('Request cancelled');
      }
      throw { code: -32601, message: 'Method not found' };
    });

    const controller = createLspProvidersController({
      uri: URI,
      t,
      monacoApi: env.monacoApi,
      model: env.model,
      editor: env.editor,
      statementEl,
      setGoalText: (text) => goalTexts.push(text),
      isSessionReady: () => true,
      whenSessionReady: async () => true,
      flushChange: () => {},
      sessionRequest: sessionRequest as never,
      log: () => {},
    });

    await controller.requestGoal();
    expect(goalTexts.at(-1)).toBe('⊢ True');

    // 光标落到 sorry 行且空目标时给出 sorry 专属提示。
    env.setLine(2);
    mode = 'empty';
    await controller.requestGoal();
    expect(goalTexts.at(-1)).toBe(t.goalSorryHint);

    // 瞬态错误在 150ms 后自动重试成功。
    mode = 'transient';
    await controller.requestGoal();
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();
    expect(goalTexts.at(-1)).toBe('⊢ True');

    // MethodNotFound 后永久切换不支持文案并停止发请求。
    mode = 'not-found';
    await controller.requestGoal();
    expect(goalTexts.at(-1)).toBe(t.goalUnsupported);
    const countBefore = sessionRequest.mock.calls.length;
    await controller.requestGoal();
    expect(sessionRequest.mock.calls.length).toBe(countBefore);

    controller.dispose();
  });
});
