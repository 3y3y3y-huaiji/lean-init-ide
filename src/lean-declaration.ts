/**
 * 从源码里定位光标所在的声明，并还原它的签名。
 *
 * Goal 面板要区分两件事：
 *   - 这段代码要证明什么 → 声明签名，稳定，与光标位置无关
 *   - 此刻光标处是什么状态 → LSP 的 $/lean/plainGoal，随光标变化
 *
 * 只做纯文本解析，不依赖 LSP，所以可以脱离编辑器单测。
 */
export type Declaration = {
  /** 0-based 行号，声明起始行。 */
  startLine: number;
  /** 压平空白后的签名，已截去 `:=` / `by` / `where` 之后的部分。 */
  signature: string;
};

const KEYWORDS = [
  'theorem',
  'lemma',
  'example',
  'def',
  'abbrev',
  'instance',
  'structure',
  'inductive',
  'class',
  'opaque',
];

const DECLARATION_PATTERN = new RegExp(`^\\s*(?:${KEYWORDS.join('|')})\\b`);
const TERMINATOR = /:=|\bby\b|\bwhere\b/;

/** 签名最多跨这么多行；再长就截断，避免占满面板。 */
const MAX_SIGNATURE_LINES = 6;

export const findDeclaration = (
  lines: readonly string[],
  cursorLine: number,
): Declaration | null => {
  if (lines.length === 0) return null;

  const cursor = Math.min(Math.max(cursorLine, 0), lines.length - 1);

  // 向上找最近的声明起始行；没有就说明光标在文件头的 import / open 区。
  let startLine = -1;
  for (let line = cursor; line >= 0; line -= 1) {
    if (DECLARATION_PATTERN.test(lines[line] ?? '')) {
      startLine = line;
      break;
    }
  }
  if (startLine === -1) return null;

  const parts: string[] = [];
  const last = Math.min(startLine + MAX_SIGNATURE_LINES - 1, lines.length - 1);

  for (let line = startLine; line <= last; line += 1) {
    const text = (lines[line] ?? '').trim();
    if (text === '') break;

    // 模式匹配分支（| 0 => 0）属于定义体，不属于签名。
    if (line > startLine && text.startsWith('|')) break;

    const cut = text.search(TERMINATOR);
    if (cut >= 0) {
      parts.push(text.slice(0, cut));
      break;
    }
    parts.push(text);
  }

  const collapsed = parts.join(' ').replace(/\s+/gu, ' ').trim();

  return {
    startLine,
    signature: collapsed || (lines[startLine] ?? '').trim(),
  };
};
