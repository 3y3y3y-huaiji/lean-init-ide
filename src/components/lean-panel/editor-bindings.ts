/**
 * Monaco 编辑器实例挂载与本地交互绑定：
 * 负责 Worker 注册、主题同步、触屏剪贴板、Lean `\` 缩写展开/补全、重置、导入/导出 `.lean` 与草稿持久化。
 */
// editor.api 只带编辑器内核，不注册 80 多种内置语言，主包和内存都小得多。
import * as monaco from 'monaco-editor/editor/editor.api';
// 补全、悬停、查找等交互能力需要单独引入。
import '../../monaco-contrib';
import editorWorker from '../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { clearDraft, readDraft, saveDraft } from '../../draft';
import type { Messages } from '../../i18n/types';
import {
  abbreviationSuggestions,
  findAbbreviationQuery,
  matchAbbreviation,
} from '../../lean-abbreviations';
import { LEAN_LANGUAGE_ID, registerLean } from '../../lean-language';
import type { LspDiagnostic } from '../../lean-session';
import { getResolvedTheme, onResolvedThemeChange } from '../../theme';

(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

registerLean(monaco);

const IMPORT_MAX_BYTES = 256 * 1024;

export type EditorBindingsOptions = {
  readonly host: HTMLElement;
  readonly uri: string;
  readonly starterCode: string;
  readonly lessonSlug?: string;
  readonly draftKey?: string;
  readonly t: Messages['playground'];
  readonly log: (message: string) => void;
  readonly onContentChange: () => void;
};

const severityOf = (s?: number): monaco.MarkerSeverity =>
  s === 2
    ? monaco.MarkerSeverity.Warning
    : s === 3
      ? monaco.MarkerSeverity.Info
      : s === 4
        ? monaco.MarkerSeverity.Hint
        : monaco.MarkerSeverity.Error;

export const createEditorBindings = (options: EditorBindingsOptions) => {
  const { host, uri, starterCode, lessonSlug, draftKey, t, log, onContentChange } = options;
  const draft = draftKey ? readDraft(draftKey) : null;
  const cleanups: Array<() => void> = [];
  const disposables: monaco.IDisposable[] = [];

  const model = monaco.editor.createModel(
    draft?.code ?? starterCode,
    LEAN_LANGUAGE_ID,
    monaco.Uri.parse(uri),
  );
  const editor = monaco.editor.create(host.querySelector<HTMLElement>('[data-role="editor"]')!, {
    model,
    theme: getResolvedTheme() === 'light' ? 'vs' : 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 15,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: 24,
    scrollBeyondLastLine: false,
    padding: { top: 16, bottom: 16 },
    renderLineHighlight: 'all',
    tabSize: 2,
    wordWrap: 'on',
    fixedOverflowWidgets: true,
    acceptSuggestionOnEnter: 'on',
    suggestOnTriggerCharacters: true,
    quickSuggestions: { other: true, comments: false, strings: false },
    suggest: { selectionMode: 'always' },
  });
  editor.layout();
  host.querySelector('[data-role="editor-loading"]')?.remove();

  const acceptSuggestionWithEnter = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    const widget = document.querySelector<HTMLElement>('.suggest-widget.visible');
    if (!widget?.querySelector('.monaco-list-row.focused')) return;
    event.preventDefault();
    event.stopPropagation();
    editor.trigger('keyboard', 'acceptSelectedSuggestion', {});
  };
  host.addEventListener('keydown', acceptSuggestionWithEnter, true);
  cleanups.push(() => host.removeEventListener('keydown', acceptSuggestionWithEnter, true));

  const mobileActions = host.querySelector<HTMLElement>('[data-role="mobile-actions"]');
  if (mobileActions) {
    const pick = <T extends HTMLElement>(role: string) =>
      mobileActions.querySelector<T>(`[data-role="${role}"]`);
    const copyEl = pick<HTMLButtonElement>('copy-selection');
    const hintEl = pick<HTMLElement>('clip-hint');
    let hintTimer = 0;
    cleanups.push(() => window.clearTimeout(hintTimer));
    const showHint = (text: string) => {
      if (!hintEl) return;
      hintEl.textContent = text;
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => {
        hintEl.textContent = '';
      }, 2400);
    };
    const syncCopyState = () => {
      const selection = editor.getSelection();
      if (copyEl) copyEl.disabled = selection === null || selection.isEmpty();
    };
    syncCopyState();
    disposables.push(editor.onDidChangeCursorSelection(syncCopyState));

    pick<HTMLButtonElement>('select-all')?.addEventListener('click', () => {
      editor.setSelection(model.getFullModelRange());
      editor.focus();
    });
    copyEl?.addEventListener('click', async () => {
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) return;
      try {
        await navigator.clipboard.writeText(model.getValueInRange(selection));
        showHint(t.copied);
      } catch {
        showHint(t.clipboardFailed);
      }
    });
    pick<HTMLButtonElement>('paste')?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        const selection = editor.getSelection() ?? new monaco.Selection(1, 1, 1, 1);
        editor.executeEdits('mobile-paste', [{ range: selection, text, forceMoveMarkers: true }]);
        editor.focus();
        showHint(t.pasted);
      } catch {
        showHint(t.clipboardFailed);
      }
    });
  }

  cleanups.push(
    onResolvedThemeChange((theme) => monaco.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark')),
  );

  const expandAbbreviation = (offset: number): boolean => {
    const pos = editor.getPosition();
    if (!pos) return false;
    const targetColumn = pos.column - offset;
    const match = matchAbbreviation(model.getLineContent(pos.lineNumber), targetColumn);
    if (!match) return false;
    editor.executeEdits('lean-abbreviations', [
      {
        range: new monaco.Range(pos.lineNumber, match.startColumn, pos.lineNumber, targetColumn),
        text: match.symbol,
        forceMoveMarkers: true,
      },
    ]);
    if (offset === 0) {
      editor.setPosition({
        lineNumber: pos.lineNumber,
        column: match.startColumn + match.symbol.length,
      });
    }
    return true;
  };

  disposables.push(
    editor.onKeyDown((event) => {
      if (event.keyCode === monaco.KeyCode.Tab && expandAbbreviation(0)) {
        event.preventDefault();
      }
    }),
  );

  let spaceTimer: number | undefined;
  let draftTimer: number | undefined;
  cleanups.push(() => {
    window.clearTimeout(spaceTimer);
    window.clearTimeout(draftTimer);
  });
  const scheduleDraftSave = () => {
    if (!draftKey) return;
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => saveDraft(draftKey, model.getValue()), 400);
  };
  const saveDraftNow = () => {
    if (!draftKey) return;
    window.clearTimeout(draftTimer);
    saveDraft(draftKey, model.getValue());
  };

  disposables.push(
    monaco.languages.registerCompletionItemProvider(LEAN_LANGUAGE_ID, {
      triggerCharacters: ['\\'],
      provideCompletionItems: (completionModel, position) => {
        const line = completionModel.getLineContent(position.lineNumber);
        const query = findAbbreviationQuery(line, position.column);
        if (!query) return { suggestions: [] };
        const range = new monaco.Range(
          position.lineNumber,
          query.startColumn,
          position.lineNumber,
          position.column,
        );
        return {
          suggestions: abbreviationSuggestions(query.query).map(({ name, symbol }, index) => ({
            label: {
              label: `\\${name}`,
              description: `${symbol}\u2003\u2003${t.abbreviationDetail}`,
            },
            kind: monaco.languages.CompletionItemKind.Text,
            insertText: symbol,
            range,
            sortText: String(index).padStart(3, '0'),
          })),
        };
      },
    }),
  );

  const resetEl = host.querySelector<HTMLButtonElement>('[data-role="reset"]');
  const exportEl = host.querySelector<HTMLButtonElement>('[data-role="export"]');
  const importEl = host.querySelector<HTMLButtonElement>('[data-role="import"]');
  const importInputEl = host.querySelector<HTMLInputElement>('[data-role="import-input"]');
  const passedEl = host.querySelector<HTMLElement>('[data-role="passed"]');

  const replaceContentAtStart = (next: string, shouldFocus = true) => {
    model.setValue(next);
    editor.setPosition({ lineNumber: 1, column: 1 });
    editor.revealLine(1);
    if (shouldFocus) editor.focus();
  };

  let resetArmed = false;
  let resetArmTimer: number | undefined;
  cleanups.push(() => window.clearTimeout(resetArmTimer));
  const disarmReset = () => {
    window.clearTimeout(resetArmTimer);
    resetArmed = false;
    if (!resetEl) return;
    delete resetEl.dataset.armed;
    resetEl.textContent = t.resetCode;
  };
  resetEl?.addEventListener('click', () => {
    if (!resetArmed) {
      if (model.getValue() === starterCode) return;
      resetArmed = true;
      resetEl.dataset.armed = 'true';
      resetEl.textContent = t.resetConfirmAction;
      window.clearTimeout(resetArmTimer);
      resetArmTimer = window.setTimeout(disarmReset, 3000);
      return;
    }
    disarmReset();
    if (draftKey) clearDraft(draftKey);
    if (passedEl) passedEl.hidden = true;
    replaceContentAtStart(starterCode);
  });
  const onResetOutsideClick = (event: MouseEvent) => {
    if (!resetArmed) return;
    if (event.target instanceof Node && resetEl?.contains(event.target)) return;
    disarmReset();
  };
  if (resetEl) {
    document.addEventListener('click', onResetOutsideClick);
    cleanups.push(() => document.removeEventListener('click', onResetOutsideClick));
  }

  exportEl?.addEventListener('click', () => {
    const url = URL.createObjectURL(
      new Blob([model.getValue()], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${lessonSlug ?? 'playground'}.lean`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  importEl?.addEventListener('click', () => importInputEl?.click());
  importInputEl?.addEventListener('change', () => {
    const file = importInputEl.files?.[0];
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      log(t.logImportFailed(`${Math.ceil(file.size / 1024)} KB > 256 KB`));
      importInputEl.value = '';
      return;
    }
    file
      .text()
      .then((text) => {
        replaceContentAtStart(text);
        saveDraftNow();
        log(t.logCodeImported(file.name));
      })
      .catch((error: unknown) => {
        log(t.logImportFailed(error instanceof Error ? error.message : String(error)));
      })
      .finally(() => {
        importInputEl.value = '';
      });
  });

  disposables.push(
    model.onDidChangeContent((event) => {
      if (event.changes.length === 1) {
        const change = event.changes[0];
        if (change?.text === ' ' && change.rangeLength === 0) {
          window.clearTimeout(spaceTimer);
          spaceTimer = window.setTimeout(() => expandAbbreviation(1), 0);
        }
      }
      scheduleDraftSave();
      disarmReset();
      onContentChange();
    }),
  );

  return {
    monacoApi: monaco,
    editor,
    model,
    hadRestoredDraft: Boolean(draft),
    getCode: () => model.getValue(),
    setCode: (next: string, setOpts?: { focus?: boolean }) =>
      replaceContentAtStart(next, setOpts?.focus ?? true),
    insert: (text: string) => {
      const selection = editor.getSelection();
      if (!selection) return;
      editor.executeEdits('challenge-tactic', [{ range: selection, text, forceMoveMarkers: true }]);
      editor.focus();
    },
    focus: () => editor.focus(),
    revealLocation: (lineNumber: number, column: number) => {
      const position = { lineNumber, column };
      editor.setPosition(position);
      editor.revealPositionInCenter(position);
      editor.focus();
    },
    setModelMarkers: (diagnostics: readonly LspDiagnostic[]) => {
      monaco.editor.setModelMarkers(
        model,
        LEAN_LANGUAGE_ID,
        diagnostics.map((diagnostic) => ({
          severity: severityOf(diagnostic.severity),
          message: diagnostic.message,
          source: diagnostic.source ?? 'Lean',
          startLineNumber: diagnostic.range.start.line + 1,
          startColumn: diagnostic.range.start.character + 1,
          endLineNumber: diagnostic.range.end.line + 1,
          endColumn: diagnostic.range.end.character + 1,
        })),
      );
    },
    saveDraftNow,
    dispose: () => {
      saveDraftNow();
      for (const cleanup of cleanups) cleanup();
      for (const disposable of disposables) disposable.dispose();
      model.dispose();
      editor.dispose();
    },
  };
};
