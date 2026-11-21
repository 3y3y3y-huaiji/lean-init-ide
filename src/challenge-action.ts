import type { ChallengeTactic } from './challenges';
import type { Locale } from './i18n';

/**
 * 把 Lean 源码里的注释替换成空格（换行保留），
 * 这样可以在与原串等长的遮罩上定位 `sorry`，又不会误伤注释里的示例文字。
 */
const maskComments = (code: string): string => {
  let output = '';
  let index = 0;
  let blockDepth = 0;
  while (index < code.length) {
    if (blockDepth > 0) {
      if (code.startsWith('/-', index)) {
        blockDepth += 1;
        output += '  ';
        index += 2;
        continue;
      }
      if (code.startsWith('-/', index)) {
        blockDepth -= 1;
        output += '  ';
        index += 2;
        continue;
      }
      output += code[index] === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }
    if (code.startsWith('/-', index)) {
      blockDepth = 1;
      output += '  ';
      index += 2;
      continue;
    }
    if (code.startsWith('--', index)) {
      while (index < code.length && code[index] !== '\n') {
        output += ' ';
        index += 1;
      }
      continue;
    }
    output += code[index];
    index += 1;
  }
  return output;
};

const SORRY_TOKEN = /\bsorry\b/;

const replaceFirstSorry = (code: string, replacement: string): string | undefined => {
  const match = SORRY_TOKEN.exec(maskComments(code));
  if (match === null) return undefined;
  return code.slice(0, match.index) + replacement + code.slice(match.index + match[0].length);
};

const THEOREM_DECLARATION = /\b(?:theorem|lemma)\b/g;
const NEXT_DECLARATION = /\n(?=(?:theorem|lemma|def|abbrev|example|instance)\b)/g;

/** 找到最后一条 theorem/lemma 的起始位置（注释已遮罩）。 */
const lastTheoremStart = (masked: string): number => {
  let start = -1;
  THEOREM_DECLARATION.lastIndex = 0;
  let match: RegExpExecArray | null = THEOREM_DECLARATION.exec(masked);
  while (match !== null) {
    start = match.index;
    match = THEOREM_DECLARATION.exec(masked);
  }
  return start;
};

const nextDeclarationStart = (masked: string, from: number): number => {
  NEXT_DECLARATION.lastIndex = from;
  const match = NEXT_DECLARATION.exec(masked);
  return match === null ? masked.length : match.index;
};

/**
 * 代码里已经没有 sorry 时，把最后一条定理的证明部分换成新的证明片段。
 * 片段约定：第一行不带缩进，后续行自带相对于 `by` 块的缩进。
 */
const replaceLastProof = (code: string, proof: string): string | undefined => {
  const masked = maskComments(code);
  const theoremStart = lastTheoremStart(masked);
  if (theoremStart < 0) return undefined;
  const assignment = masked.indexOf(':=', theoremStart);
  if (assignment < 0) return undefined;
  const end = nextDeclarationStart(masked, assignment + 2);
  const body = proof.trim();
  return `${code.slice(0, assignment)}:= by\n  ${body}${code.slice(end)}`;
};

/**
 * 出招卡落到编辑器上的唯一入口。
 *
 * - `set-code`：载入一张完整的 Lean 文件，直接覆盖编辑器；
 * - `replace-sorry`：优先替换第一个未注释的 `sorry`；
 *   如果没有 sorry，则智能替换最后一条定理的证明部分，避免把文件插坏。
 */
export const applyChallengeTactic = (
  code: string,
  tactic: ChallengeTactic,
  locale: Locale,
): string => {
  const snippet = tactic.insert[locale];
  if (tactic.action === 'set-code') return snippet;
  return replaceFirstSorry(code, snippet) ?? replaceLastProof(code, snippet) ?? snippet;
};

export const challengeTacticAction = (
  tactic: ChallengeTactic,
): NonNullable<ChallengeTactic['action']> => tactic.action ?? 'replace-sorry';
