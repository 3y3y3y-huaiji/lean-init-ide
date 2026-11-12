/**
 * 练习通关判定：只声明「无 sorry + 无 Error」不够，清空编辑器也会被误判成通关。
 * 这里额外要求 starter 里声明的定理/定义名称仍然存在。
 */
export type DiagnosticLike = { severity?: number };

const NAMED_DECLARATION =
  /\b(?:theorem|lemma|def|structure|inductive|class|abbrev|opaque|instance)\s+([A-Za-z_][A-Za-z0-9_']*)/g;

/** 提取 starter 里所有具名声明的名字；`example` 没有名字，不参与通关判定。 */
export const declarationNames = (code: string): string[] => {
  const names = new Set<string>();
  for (const match of code.matchAll(NAMED_DECLARATION)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 注释里的定理名和 sorry 不算数，先粗剥掉行注释与块注释。 */
const stripComments = (code: string): string =>
  code.replace(/\/-[\s\S]*?-\//g, ' ').replace(/--[^\n]*/g, ' ');

/** 名称必须作为完整标识符出现，避免 `add_zero` 被 `add_zero_twice` 蹭到。 */
const hasIdentifier = (code: string, name: string): boolean =>
  new RegExp(`(?<![A-Za-z0-9_'])${escapeRegExp(name)}(?![A-Za-z0-9_'])`).test(code);

/** 只有带 sorry 且声明了具名定理的练习模板才需要通关徽章。 */
export const isExerciseStarter = (starter: string): boolean =>
  /\bsorry\b/.test(stripComments(starter)) && declarationNames(starter).length > 0;

export const isExerciseSolved = (
  starter: string,
  current: string,
  diagnostics: readonly DiagnosticLike[],
): boolean => {
  const names = declarationNames(starter);
  if (names.length === 0) return false;
  const active = stripComments(current);
  if (/\bsorry\b/.test(active)) return false;
  if (!names.every((name) => hasIdentifier(active, name))) return false;
  return !diagnostics.some((item) => (item.severity ?? 1) === 1);
};
