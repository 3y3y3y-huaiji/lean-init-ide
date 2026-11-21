import type { LessonPage } from '../i18n/types';

/** 课程右侧 Goal 面板与左侧代码块逐行联动的单步结构。 */
export type LessonGoalStep = {
  /** 步骤核心 Goal 文本（上下文与 `⊢` 目标，不包含 `说明：` 等旁白注记）。 */
  goal: string;
  /** 可选的步骤补充说明，单独渲染在 Goal 文本框下方。 */
  note?: string;
  /** 绑定的正文代码块序号（从 0 开始）；无匹配代码块时为 null。 */
  codeIndex: number | null;
  /** 绑定的代码块内部行号（从 0 开始）；无法定位具体行时为 null。 */
  lineIndex: number | null;
};

type RawStepChunk = {
  goalLines: string[];
  noteLines: string[];
};

type IndexedCodeBlock = {
  blockIndex: number;
  codeIndex: number;
  code: string;
};

const NOTE_PREFIX_RE = /^(?:说明|注|解释|note|explanation)[:：]\s*(.+)$/i;
const GOAL_CONT_PREFIX_RE = /^(?:目标：|goal:|状态：|state:|⊢)/i;
const START_STEP_RE =
  /^(?:证明开始|推导开始|初始|开始|induction\s+\S+\s*前|cases\s+\S+\s*前|initial|start|before\s)/i;
const CLOSE_STEP_RE =
  /(?:没有剩余目标|没有目标|目标关闭|证明(?:已)?关闭|收尾|no remaining goals|no goals|goal closed|proof accepted)/i;

const TACTIC_KEYWORDS = [
  'intro',
  'rw',
  'simp only',
  'simp',
  'exact',
  'apply',
  'cases',
  'rcases',
  'induction',
  'constructor',
  'have',
  'refine',
  'obtain',
  'split',
  'calc',
  'by_contra',
  'contradiction',
  'sorry',
  'grind',
  'omega',
  'decide',
  'rfl',
  'trivial',
  '#print axioms',
  '#check',
  '#eval',
] as const;

const STOP_TOKENS = new Set([
  'Nat',
  'Prop',
  'Type',
  'True',
  'False',
  'with',
  'fun',
  'theorem',
  'lemma',
  'example',
  'def',
  'by',
  'the',
  'and',
  'for',
  'into',
  'goal',
  'Goal',
  'witness',
]);

const extractMatchTokens = (text: string): string[] => {
  const rawMatches = text.match(/#[a-z_]+(?:\s+axioms)?|[A-Za-z_][A-Za-z0-9_.']*/g) ?? [];
  const unique = new Set<string>();
  for (const token of rawMatches) {
    if (token.length < 2 || STOP_TOKENS.has(token)) continue;
    unique.add(token);
  }
  return [...unique];
};

const parseGoalBlockChunks = (text: string): Array<{ goal: string; note?: string }> => {
  const chunks: RawStepChunk[] = [];
  const rawLines = text.split('\n');
  let sawBlankLine = false;

  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = rawLines[i]!;
    const trimmed = raw.trim();
    if (!trimmed) {
      sawBlankLine = true;
      continue;
    }

    const noteMatch = NOTE_PREFIX_RE.exec(trimmed);
    if (noteMatch) {
      const noteText = noteMatch[1]!.trim();
      if (chunks.length > 0) {
        chunks[chunks.length - 1]!.noteLines.push(noteText);
      } else {
        chunks.push({ goalLines: [], noteLines: [noteText] });
      }
      sawBlankLine = false;
      continue;
    }

    if (
      sawBlankLine &&
      chunks.length > 0 &&
      !/[:：]$/.test(trimmed) &&
      !START_STEP_RE.test(trimmed) &&
      !/^[^。.!?;；]{1,40}[:：]/.test(trimmed) &&
      !/^⊢\s*[^。.!?；;]+$/.test(trimmed)
    ) {
      chunks[chunks.length - 1]!.noteLines.push(trimmed);
      sawBlankLine = false;
      continue;
    }
    sawBlankLine = false;

    if (chunks.length > 0 && (/^\s+/.test(raw) || GOAL_CONT_PREFIX_RE.test(trimmed))) {
      chunks[chunks.length - 1]!.goalLines.push(trimmed);
      continue;
    }

    if (/[:：]$/.test(trimmed) && i + 1 < rawLines.length) {
      const nextTrimmed = rawLines[i + 1]!.trim();
      if (nextTrimmed) {
        const nextNoteMatch = NOTE_PREFIX_RE.exec(nextTrimmed);
        if (nextNoteMatch) {
          chunks.push({ goalLines: [trimmed], noteLines: [nextNoteMatch[1]!.trim()] });
        } else {
          chunks.push({ goalLines: [trimmed, nextTrimmed], noteLines: [] });
        }
        i += 1;
        continue;
      }
    }

    chunks.push({ goalLines: [trimmed], noteLines: [] });
  }

  return chunks
    .map((chunk) => {
      const goal = chunk.goalLines.join('\n') || chunk.noteLines.join('\n');
      const note =
        chunk.goalLines.length > 0 && chunk.noteLines.length > 0
          ? chunk.noteLines.join('\n')
          : undefined;
      return note ? { goal, note } : { goal };
    })
    .filter((chunk) => chunk.goal.length > 0);
};

const scoreGoalBlockAgainstCode = (goalText: string, code: string): number => {
  let score = 0;
  for (const token of extractMatchTokens(goalText)) {
    if (code.includes(token)) {
      score += token.includes('.') ? 3 : 2;
    }
  }
  return score;
};

const resolveGoalCodeBlock = (
  goalBlockIndex: number,
  goalBlockText: string,
  codeBlocks: readonly IndexedCodeBlock[],
): IndexedCodeBlock | null => {
  if (codeBlocks.length === 0) return null;

  let prev: IndexedCodeBlock | null = null;
  let next: IndexedCodeBlock | null = null;
  for (const block of codeBlocks) {
    if (block.blockIndex < goalBlockIndex) prev = block;
    else if (block.blockIndex > goalBlockIndex && !next) next = block;
  }

  if (!prev) return next;
  if (!next || next.blockIndex - goalBlockIndex > 2) return prev;

  const prevScore = scoreGoalBlockAgainstCode(goalBlockText, prev.code);
  const nextScore = scoreGoalBlockAgainstCode(goalBlockText, next.code);
  return nextScore > prevScore ? next : prev;
};

const extractTacticHints = (stepGoal: string): string[] => {
  const firstLine = stepGoal.split('\n')[0] ?? stepGoal;
  const actionPart = firstLine.split(/[：:]/)[0] ?? firstLine;
  const hints: string[] = [];

  for (const match of actionPart.matchAll(/`([^`]+)`/g)) {
    hints.push(match[1]!.trim());
  }

  const rwMatch = /\brw\s*\[[^\]]+\]/.exec(firstLine);
  if (rwMatch) hints.push(rwMatch[0]);

  const simpOnlyMatch = /\bsimp only\s*\[[^\]]+\]/.exec(firstLine);
  if (simpOnlyMatch) hints.push(simpOnlyMatch[0]);

  for (const kw of TACTIC_KEYWORDS) {
    if (kw.startsWith('#')) {
      if (firstLine.includes(kw)) hints.push(kw);
      continue;
    }
    const escaped = kw.replace(/\s+/g, '\\s+');
    const fullMatch = new RegExp(`\\b${escaped}(?:\\s+[A-Za-z_][A-Za-z0-9_.]*)?`).exec(firstLine);
    if (fullMatch) hints.push(fullMatch[0]);
  }

  return hints;
};

const findMatchingBranchLine = (
  firstLine: string,
  lines: readonly string[],
  searchStart: number,
): number | null => {
  const branchMatch = /^(?:nil|cons|zero|succ|inl|inr)\b|\|\s*(nil|cons|zero|succ|inl|inr)\b/i.exec(
    firstLine,
  );
  if (branchMatch) {
    const branch = (branchMatch[1] ?? branchMatch[0]).toLowerCase();
    for (let i = searchStart; i < lines.length; i += 1) {
      if (new RegExp(`\\|\\s*${branch}\\b`).test(lines[i]!)) return i;
    }
    for (let i = 0; i < lines.length; i += 1) {
      if (new RegExp(`\\|\\s*${branch}\\b`).test(lines[i]!)) return i;
    }
  }

  if (/^(?:第[一1]个|first\s+(?:goal|branch)|branch\s*1|左边)/i.test(firstLine)) {
    for (let i = searchStart; i < lines.length; i += 1) {
      if (/^\s*[·•]/.test(lines[i]!)) return i;
    }
  }
  if (/^(?:第[二2两]个|second\s+(?:goal|branch)|branch\s*2|右边)/i.test(firstLine)) {
    const bullets = lines
      .map((line, index) => ({ line, index }))
      .filter((item) => /^\s*[·•]/.test(item.line));
    if (bullets[1]) return bullets[1].index;
    const fromCursor = bullets.find((item) => item.index >= searchStart);
    if (fromCursor) return fromCursor.index;
  }

  return null;
};

const scoreLineForStep = (
  line: string,
  hints: readonly string[],
  tokens: readonly string[],
): number => {
  let score = 0;
  for (const hint of hints) {
    if (line.includes(hint)) {
      score += hint.length + 6;
    } else {
      const keyword = hint.split(/\s+/)[0]!;
      if (keyword.length >= 2 && new RegExp(`\\b${keyword.replace('#', '')}\\b`).test(line)) {
        score += 3;
      }
    }
  }
  for (const token of tokens) {
    if (line.includes(token)) score += 1;
  }
  return score;
};

const matchGoalStepLine = (
  stepGoal: string,
  lines: readonly string[],
  minLine: number,
): number | null => {
  if (lines.length === 0) return null;
  if (lines.length === 1) return 0;

  const firstLine = stepGoal.split('\n')[0] ?? stepGoal;
  const searchStart = Math.min(minLine, lines.length - 1);
  const tokens = extractMatchTokens(stepGoal);

  if (START_STEP_RE.test(firstLine.trim())) {
    const declLines = lines
      .map((line, index) => ({ line, index }))
      .filter((item) => /^\s*(?:theorem|lemma|example|def)\b/.test(item.line));
    if (declLines.length === 1) return declLines[0]!.index;
    if (declLines.length > 1) {
      const forwardMatch = declLines.find(
        (item) => item.index >= minLine || tokens.some((token) => item.line.includes(token)),
      );
      return (forwardMatch ?? declLines[0]!).index;
    }
    return 0;
  }

  const branchLine = findMatchingBranchLine(firstLine.trim(), lines, searchStart);
  if (branchLine !== null) return branchLine;

  const hints = extractTacticHints(stepGoal);
  const pickBestLine = (start: number, end: number): { index: number; score: number } => {
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = start; i < end; i += 1) {
      const score = scoreLineForStep(lines[i]!, hints, tokens);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    return { index: bestIndex, score: bestScore };
  };

  if (hints.length > 0) {
    const forward = pickBestLine(searchStart, lines.length);
    if (forward.score >= 3) return forward.index;
    const anyLine = pickBestLine(0, lines.length);
    if (anyLine.score >= 3) return anyLine.index;
  }

  if (CLOSE_STEP_RE.test(stepGoal)) {
    for (let i = lines.length - 1; i >= searchStart; i -= 1) {
      if (
        lines[i]!.trim().length > 0 &&
        !/^\s*(?:theorem|lemma|example|def|import|open)\b/.test(lines[i]!)
      ) {
        return i;
      }
    }
  }

  const fallbackForward = pickBestLine(searchStart, lines.length);
  if (fallbackForward.index >= 0) return fallbackForward.index;
  const fallbackAny = pickBestLine(0, lines.length);
  if (fallbackAny.index >= 0) return fallbackAny.index;

  return searchStart;
};

/**
 * 将单步 structured Goal 格式化为兼容字符串（保留旧版 step 文本行为）。
 */
export const formatGoalStepText = (step: LessonGoalStep): string =>
  step.note ? `${step.goal}\n${step.note}` : step.goal;

/**
 * 从课程 `goal` 旁白块中提取结构化演练步骤，并绑定到左侧代码块的对应行。
 */
export const extractStructuredGoalSteps = (page: LessonPage): LessonGoalStep[] => {
  const codeBlocks: IndexedCodeBlock[] = [];
  let codeCounter = 0;
  for (let i = 0; i < page.blocks.length; i += 1) {
    const block = page.blocks[i]!;
    if (block.kind === 'code') {
      codeBlocks.push({ blockIndex: i, codeIndex: codeCounter, code: block.code });
      codeCounter += 1;
    }
  }

  const steps: LessonGoalStep[] = [];
  const cursorByCodeIndex = new Map<number, number>();

  for (let i = 0; i < page.blocks.length; i += 1) {
    const block = page.blocks[i]!;
    if (block.kind !== 'goal') continue;

    const targetCode = resolveGoalCodeBlock(i, block.text, codeBlocks);
    const lines = targetCode ? targetCode.code.split('\n') : [];
    const chunks = parseGoalBlockChunks(block.text);

    for (const chunk of chunks) {
      if (!targetCode) {
        steps.push({
          goal: chunk.goal,
          ...(chunk.note ? { note: chunk.note } : {}),
          codeIndex: null,
          lineIndex: null,
        });
        continue;
      }

      const minLine = cursorByCodeIndex.get(targetCode.codeIndex) ?? 0;
      const lineIndex = matchGoalStepLine(chunk.goal, lines, minLine);
      if (lineIndex !== null) {
        cursorByCodeIndex.set(
          targetCode.codeIndex,
          Math.min(lineIndex + 1, Math.max(0, lines.length - 1)),
        );
      }
      steps.push({
        goal: chunk.goal,
        ...(chunk.note ? { note: chunk.note } : {}),
        codeIndex: targetCode.codeIndex,
        lineIndex,
      });
    }
  }

  return steps;
};
