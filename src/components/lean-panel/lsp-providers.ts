/**
 * LSP 编辑器语言服务与 Goal 面板控制器：
 * 注册 Hover / Completion / Definition，维护当前声明签名条与 `$/lean/plainGoal` 防抖重试轮询。
 */
import type * as monaco from 'monaco-editor/editor/editor.api';
import type { Messages } from '../../i18n/types';
import { findDeclaration } from '../../lean-declaration';
import { isGoalMethodNotFound, isTransientGoalError, stripGoalFence } from '../../lean-goal';
import { LEAN_LANGUAGE_ID } from '../../lean-language';
import { toMonacoCompletions, type LspCompletionResult } from '../../lsp-completion';

type HoverResult = {
  contents:
    string | { kind?: string; value: string } | Array<string | { kind?: string; value: string }>;
};

type LocationResult = {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};

export type LspProvidersOptions = {
  readonly uri: string;
  readonly t: Messages['playground'];
  readonly monacoApi: typeof monaco;
  readonly model: monaco.editor.ITextModel;
  readonly editor: monaco.editor.IStandaloneCodeEditor;
  readonly statementEl: HTMLElement;
  readonly setGoalText: (text: string) => void;
  readonly isSessionReady: () => boolean;
  readonly whenSessionReady: () => Promise<boolean>;
  readonly flushChange: () => void;
  readonly sessionRequest: <T>(method: string, params: unknown) => Promise<T | null>;
  readonly log: (message: string) => void;
};

export type LspProvidersController = {
  readonly updateStatement: () => void;
  readonly requestGoal: (attempt?: number) => Promise<void>;
  readonly scheduleGoal: (delayMs?: number) => void;
  readonly bumpGoalSeq: () => void;
  readonly resetGoalSupport: () => void;
  readonly dispose: () => void;
};

const GOAL_RETRY_DELAY_MS = 150;
const GOAL_MAX_RETRIES = 2;

export const createLspProvidersController = (
  options: LspProvidersOptions,
): LspProvidersController => {
  const {
    uri,
    t,
    monacoApi,
    model,
    editor,
    statementEl,
    setGoalText,
    isSessionReady,
    whenSessionReady,
    flushChange,
    sessionRequest,
    log,
  } = options;

  const disposables: monaco.IDisposable[] = [];

  const lspRequest = async <T>(method: string, params: unknown): Promise<T | null> => {
    try {
      return await sessionRequest<T>(method, params);
    } catch (error) {
      log(t.logRequestFailed(method, error instanceof Error ? error.message : String(error)));
      return null;
    }
  };

  const positionParams = (position: monaco.IPosition) => ({
    textDocument: { uri },
    position: { line: position.lineNumber - 1, character: position.column - 1 },
  });

  disposables.push(
    monacoApi.languages.registerHoverProvider(LEAN_LANGUAGE_ID, {
      provideHover: async (_model, position) => {
        if (!(await whenSessionReady())) return null;
        flushChange();
        const hover = await lspRequest<HoverResult>('textDocument/hover', positionParams(position));
        log(t.logHover(position.lineNumber, position.column, Boolean(hover)));
        if (!hover?.contents) return null;
        const contents = (Array.isArray(hover.contents) ? hover.contents : [hover.contents]).map(
          (entry) => (typeof entry === 'string' ? { value: entry } : { value: entry.value }),
        );
        return { contents };
      },
    }),
  );

  disposables.push(
    monacoApi.languages.registerCompletionItemProvider(LEAN_LANGUAGE_ID, {
      triggerCharacters: ['.'],
      provideCompletionItems: async (completionModel, position) => {
        if (!(await whenSessionReady())) return { suggestions: [], incomplete: false };
        flushChange();
        const result = await lspRequest<LspCompletionResult>(
          'textDocument/completion',
          positionParams(position),
        );
        const word = completionModel.getWordUntilPosition(position);
        const fallback = new monacoApi.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn,
        );
        const { suggestions, incomplete } = toMonacoCompletions(result, fallback);
        log(t.logCompletion(position.lineNumber, position.column, suggestions.length));
        return {
          suggestions: suggestions as unknown as monaco.languages.CompletionItem[],
          incomplete,
        };
      },
    }),
  );

  disposables.push(
    monacoApi.languages.registerDefinitionProvider(LEAN_LANGUAGE_ID, {
      provideDefinition: async (_model, position) => {
        if (!(await whenSessionReady())) return null;
        flushChange();
        const result = await lspRequest<LocationResult | LocationResult[]>(
          'textDocument/definition',
          positionParams(position),
        );
        if (!result) return null;
        const locations = Array.isArray(result) ? result : [result];
        return locations
          .filter((location) => location.uri.toLowerCase() === uri.toLowerCase())
          .map((location) => ({
            uri: monacoApi.Uri.parse(location.uri),
            range: new monacoApi.Range(
              location.range.start.line + 1,
              location.range.start.character + 1,
              location.range.end.line + 1,
              location.range.end.character + 1,
            ),
          }));
      },
    }),
  );

  let lastDeclVersion = -1;
  let lastDeclLine = -1;
  const updateStatement = () => {
    const position = editor.getPosition();
    if (!position) return;
    const version = model.getVersionId();
    if (version === lastDeclVersion && position.lineNumber === lastDeclLine) return;
    lastDeclVersion = version;
    lastDeclLine = position.lineNumber;
    const declaration = findDeclaration(model.getLinesContent(), position.lineNumber - 1);
    const text = declaration?.signature ?? '';
    if (statementEl.textContent !== text) {
      statementEl.textContent = text;
      statementEl.title = text;
    }
    statementEl.hidden = text === '';
  };
  updateStatement();

  let goalSupported = true;
  let goalTimer: number | undefined;
  let goalRetryTimer: number | undefined;
  let goalRequestSeq = 0;

  const requestGoal = async (attempt = 0): Promise<void> => {
    if (!isSessionReady() || !goalSupported) return;
    flushChange();
    const position = editor.getPosition();
    if (!position) return;
    const seq = ++goalRequestSeq;
    try {
      const result = await sessionRequest<{ rendered?: string; goals?: string[] }>(
        '$/lean/plainGoal',
        positionParams(position),
      );
      if (seq !== goalRequestSeq) return;
      const rendered = result?.rendered ? stripGoalFence(result.rendered) : '';
      const text = rendered || (result?.goals ?? []).join('\n\n').trim();
      if (text) {
        setGoalText(text);
        return;
      }
      const declaration = findDeclaration(model.getLinesContent(), position.lineNumber - 1);
      const atDeclarationHeader = declaration?.startLine === position.lineNumber - 1;
      const onSorryLine = /\bsorry\b/.test(model.getLineContent(position.lineNumber));
      setGoalText(
        onSorryLine
          ? t.goalSorryHint
          : atDeclarationHeader && /\bsorry\b/.test(model.getValue())
            ? t.goalHint
            : t.goalEmpty,
      );
    } catch (error) {
      if (seq !== goalRequestSeq) return;
      const message = error instanceof Error ? error.message : String(error);
      if (isGoalMethodNotFound(error)) {
        goalSupported = false;
        setGoalText(t.goalUnsupported);
        log(t.logGoalFailed(message));
        return;
      }
      if (isTransientGoalError(error) && attempt < GOAL_MAX_RETRIES) {
        window.clearTimeout(goalRetryTimer);
        goalRetryTimer = window.setTimeout(() => {
          goalRetryTimer = undefined;
          if (seq !== goalRequestSeq || !isSessionReady()) return;
          void requestGoal(attempt + 1);
        }, GOAL_RETRY_DELAY_MS);
        return;
      }
      log(t.logGoalFailed(message));
    }
  };

  const scheduleGoal = (delayMs = 250) => {
    window.clearTimeout(goalTimer);
    goalTimer = window.setTimeout(() => {
      goalTimer = undefined;
      void requestGoal();
    }, delayMs);
  };

  disposables.push(
    editor.onDidChangeCursorPosition(() => {
      updateStatement();
      scheduleGoal(250);
    }),
  );

  return {
    updateStatement,
    requestGoal,
    scheduleGoal,
    bumpGoalSeq: () => {
      goalRequestSeq += 1;
    },
    resetGoalSupport: () => {
      goalSupported = true;
      goalRequestSeq += 1;
      window.clearTimeout(goalTimer);
      window.clearTimeout(goalRetryTimer);
    },
    dispose: () => {
      window.clearTimeout(goalTimer);
      window.clearTimeout(goalRetryTimer);
      for (const disposable of disposables) disposable.dispose();
    },
  };
};
