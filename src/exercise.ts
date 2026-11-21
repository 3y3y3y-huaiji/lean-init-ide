/**
 * 练习通关判定：只声明「无 sorry + 无 Error」不够，清空编辑器也会被误判成通关。
 * 这里额外要求 starter 里声明的定理/定义名称仍然存在。
 */
export type DiagnosticLike = { severity?: number; message?: string };

const NAMED_DECLARATION =
  /\b(?:theorem|lemma|def|structure|inductive|class|abbrev|opaque|instance)\s+([A-Za-z_][A-Za-z0-9_']*)/g;

const THEOREM_HEADER =
  /\b(?:theorem|lemma)\s+[A-Za-z_][A-Za-z0-9_']*(?:(?!\b(?:theorem|lemma)\b)[\s\S])*?:=/g;

const CHEAT_TACTIC_OR_AXIOM = /\b(?:sorry|admit|axiom|unsafe|opaque)\b/;
const SORRY_DIAGNOSTIC = /uses\s+'sorry'|sorryAx/i;

/** 证明流派：同一个结论可以有完全不同的写法。 */
export type ProofBadge = 'automation' | 'handcrafted' | 'term-mode';

/** 流派识别结果；`codeChars` 用于证明高尔夫的最短纪录。 */
export type ProofStyle = {
  badges: ProofBadge[];
  codeChars: number;
};

/** 挑战判题模式：经典、真假审判、契约修复、多层悬赏。 */
export type ChallengeMode = 'classic' | 'verdict' | 'bugfix' | 'bounty';

/** 悬赏厅的三层槽位。 */
export type ChallengeTier = 'bronze' | 'silver' | 'legend';

const AUTOMATION_TACTIC = /\b(?:omega|grind|decide|simp)\b/;
const THEOREM_PROOF =
  /\b(?:theorem|lemma)\s+([A-Za-z_][A-Za-z0-9_']*)(?:(?!\b(?:theorem|lemma|def|opaque|structure|inductive|class|abbrev|instance)\b)[\s\S])*?:=\s*/g;
const DECLARATION_START =
  /\b(?:theorem|lemma|def|opaque|structure|inductive|class|abbrev|instance)\s+([A-Za-z_][A-Za-z0-9_']*)/g;

/** 提取 starter 里所有具名声明的名字；`example` 没有名字，不参与通关判定。 */
export const declarationNames = (code: string): string[] => {
  const names = new Set<string>();
  for (const match of code.matchAll(NAMED_DECLARATION)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
};

const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** 提取代码中每条 theorem / lemma 到 `:=` 为止的归一化签名（用于防止篡改结论绕过判题）。 */
export const theoremHeaders = (code: string): string[] => {
  const clean = stripComments(code);
  const headers: string[] = [];
  for (const match of clean.matchAll(THEOREM_HEADER)) {
    headers.push(normalizeWhitespace(match[0]));
  }
  return headers;
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
  if (CHEAT_TACTIC_OR_AXIOM.test(active)) return false;
  if (!names.every((name) => hasIdentifier(active, name))) return false;

  const headers = theoremHeaders(starter);
  if (headers.length > 0) {
    const normalizedCurrent = normalizeWhitespace(active);
    if (!headers.every((header) => normalizedCurrent.includes(header))) return false;
  }

  return !diagnostics.some(
    (item) => (item.severity ?? 1) === 1 || SORRY_DIAGNOSTIC.test(item.message ?? ''),
  );
};

/** 只把真正的错误诊断算失败；悬赏厅允许其它槽位暂时留着 sorry 警告。 */
const hasErrorDiagnostic = (diagnostics: readonly DiagnosticLike[]): boolean =>
  diagnostics.some((item) => (item.severity ?? 1) === 1);

/**
 * 识别证明流派并计算有效代码字符数。
 *
 * - `automation`：用了 omega / grind / decide / simp；
 * - `handcrafted`：用了 by 战术块，但没有借助上述自动化；
 * - `term-mode`：定理直接给出证明项（`:= rfl`、`⟨...⟩` 等），没有 by 战术块。
 */
export const analyzeProofStyle = (code: string): ProofStyle => {
  const active = stripComments(code);
  const badges: ProofBadge[] = [];
  const automatic = AUTOMATION_TACTIC.test(active);
  if (automatic) badges.push('automation');

  const proofStarts: string[] = [];
  for (const match of active.matchAll(THEOREM_PROOF)) {
    proofStarts.push(active.slice((match.index ?? 0) + match[0].length));
  }
  const usesTacticBlock = proofStarts.some((proof) => /^by\b/.test(proof));
  if (proofStarts.length > 0 && !usesTacticBlock) badges.push('term-mode');
  if (usesTacticBlock && !automatic) badges.push('handcrafted');

  return {
    badges,
    codeChars: [...active.replace(/\s+/g, '')].length,
  };
};

/** 抽取某个具名声明的源码片段，供悬赏厅逐层判定「这一层删掉 sorry 了吗」。 */
const declarationSnippet = (code: string, name: string): string | undefined => {
  let start = -1;
  for (const match of code.matchAll(DECLARATION_START)) {
    if (match[1] === name) {
      start = match.index ?? 0;
      break;
    }
  }
  if (start < 0) return undefined;

  let end = code.length;
  for (const match of code.matchAll(DECLARATION_START)) {
    const index = match.index ?? 0;
    if (index > start) {
      end = index;
      break;
    }
  }
  return code.slice(start, end);
};

/** 悬赏厅：独立判断三层槽位各自是否已经消除 sorry。 */
export const solvedChallengeTiers = (
  spec: ChallengeSpec,
  current: string,
  diagnostics: readonly DiagnosticLike[],
): ChallengeTier[] => {
  if (!spec.bounty || hasErrorDiagnostic(diagnostics)) return [];
  const active = stripComments(current);
  const slots: Array<[ChallengeTier, string]> = [
    ['bronze', spec.bounty.bronze],
    ['silver', spec.bounty.silver],
    ['legend', spec.bounty.legend],
  ];
  return slots
    .filter(([, name]) => {
      const snippet = declarationSnippet(active, name);
      return snippet !== undefined && !CHEAT_TACTIC_OR_AXIOM.test(snippet);
    })
    .map(([tier]) => tier);
};

/** 挑战数据里参与判题的最小结构；避免 `exercise.ts` 反向依赖整个挑战表。 */
export type ChallengeSpec = {
  mode: ChallengeMode;
  /** 当前语言的骨架，用于经典模式的签名保护。 */
  starter: string;
  /** 真假审判庭：正确候选与错误候选的定理名。 */
  verdict?: { correct: string; wrong: string };
  /** 契约漏洞猎人：必须原样保留的核心结论片段。 */
  requiredConclusion?: string;
  /** 悬赏厅：三层槽位的定理名。 */
  bounty?: { bronze: string; silver: string; legend: string };
};

const keepsRequiredConclusion = (active: string, required: string | undefined): boolean =>
  required === undefined || normalizeWhitespace(active).includes(normalizeWhitespace(required));

/**
 * 挑战统一判题入口。
 *
 * 经典模式直接复用课程练习的签名保护；其它模式只要求「无作弊 + 零 Error」，
 * 再按各自的通关契约检查正确候选或受保护结论。
 */
export const isChallengeSolved = (
  spec: ChallengeSpec,
  current: string,
  diagnostics: readonly DiagnosticLike[],
): boolean => {
  if (spec.mode === 'classic') return isExerciseSolved(spec.starter, current, diagnostics);
  if (spec.mode === 'bounty') {
    const tiers = solvedChallengeTiers(spec, current, diagnostics);
    return tiers.includes('bronze') || tiers.includes('silver');
  }

  const active = stripComments(current);
  if (CHEAT_TACTIC_OR_AXIOM.test(active) || hasErrorDiagnostic(diagnostics)) return false;
  if (!keepsRequiredConclusion(active, spec.requiredConclusion)) return false;

  if (spec.mode === 'verdict') {
    return spec.verdict !== undefined && hasIdentifier(active, spec.verdict.correct);
  }
  return true;
};
