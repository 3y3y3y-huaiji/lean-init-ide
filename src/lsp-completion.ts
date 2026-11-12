import * as monaco from 'monaco-editor/editor/editor.api';

/** LSP 的 CompletionItem 子集，只保留 Lean 服务实际会返回、我们也用得到的字段。 */
export type LspPosition = { line: number; character: number };
export type LspRange = { start: LspPosition; end: LspPosition };
export type LspTextEdit = { range: LspRange; newText: string };
export type LspCompletionItem = {
  label: string | { label: string };
  kind?: number;
  detail?: string;
  documentation?: string | { value: string };
  insertText?: string;
  insertTextFormat?: number;
  textEdit?: LspTextEdit | { insert: LspTextEdit; replace: LspTextEdit };
  sortText?: string;
  filterText?: string;
  preselect?: boolean;
};
export type LspCompletionResult =
  LspCompletionItem[] | { isIncomplete?: boolean; items?: LspCompletionItem[] } | null;

const KIND: Record<number, monaco.languages.CompletionItemKind> = {
  1: monaco.languages.CompletionItemKind.Text,
  2: monaco.languages.CompletionItemKind.Method,
  3: monaco.languages.CompletionItemKind.Function,
  4: monaco.languages.CompletionItemKind.Constructor,
  5: monaco.languages.CompletionItemKind.Field,
  6: monaco.languages.CompletionItemKind.Variable,
  7: monaco.languages.CompletionItemKind.Class,
  8: monaco.languages.CompletionItemKind.Interface,
  9: monaco.languages.CompletionItemKind.Module,
  10: monaco.languages.CompletionItemKind.Property,
  11: monaco.languages.CompletionItemKind.Unit,
  12: monaco.languages.CompletionItemKind.Value,
  13: monaco.languages.CompletionItemKind.Enum,
  14: monaco.languages.CompletionItemKind.Keyword,
  15: monaco.languages.CompletionItemKind.Snippet,
  16: monaco.languages.CompletionItemKind.Color,
  17: monaco.languages.CompletionItemKind.File,
  18: monaco.languages.CompletionItemKind.Reference,
  19: monaco.languages.CompletionItemKind.Folder,
  20: monaco.languages.CompletionItemKind.EnumMember,
  21: monaco.languages.CompletionItemKind.Constant,
  22: monaco.languages.CompletionItemKind.Struct,
  23: monaco.languages.CompletionItemKind.Event,
  24: monaco.languages.CompletionItemKind.Operator,
  25: monaco.languages.CompletionItemKind.TypeParameter,
};

const kindOf = (kind?: number): monaco.languages.CompletionItemKind =>
  KIND[kind ?? 1] ?? monaco.languages.CompletionItemKind.Text;

const rangeOf = (range: LspRange): monaco.Range =>
  new monaco.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1,
  );

const labelOf = (label: LspCompletionItem['label']): string =>
  typeof label === 'string' ? label : label.label;

/**
 * 把 LSP CompletionItem 转成 Monaco 的补全项。
 *
 * 优先采用服务端给的 textEdit 范围：字段补全时 Lean 会把 `.` 一起纳入替换范围，
 * 只用当前单词的范围会插出 `Nat.Nat.add` 这类重复前缀。
 */
export const toMonacoCompletion = (
  item: LspCompletionItem,
  fallbackRange: monaco.Range,
): monaco.languages.CompletionItem => {
  const edit = item.textEdit;
  const textEdit = edit && 'insert' in edit ? edit.insert : edit;
  const insertText = textEdit?.newText ?? item.insertText ?? labelOf(item.label);

  return {
    label: labelOf(item.label),
    kind: kindOf(item.kind),
    insertText,
    range: textEdit ? rangeOf(textEdit.range) : fallbackRange,
    insertTextRules:
      item.insertTextFormat === 2
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
    detail: item.detail,
    documentation:
      typeof item.documentation === 'string' ? item.documentation : item.documentation?.value,
    sortText: item.sortText,
    filterText: item.filterText,
    preselect: item.preselect,
  };
};

export const toMonacoCompletions = (
  result: LspCompletionResult,
  fallbackRange: monaco.Range,
): { suggestions: monaco.languages.CompletionItem[]; incomplete: boolean } => {
  if (!result) return { suggestions: [], incomplete: false };
  const items = Array.isArray(result) ? result : (result.items ?? []);
  return {
    suggestions: items.map((item) => toMonacoCompletion(item, fallbackRange)),
    incomplete: Array.isArray(result) ? false : (result.isIncomplete ?? false),
  };
};
