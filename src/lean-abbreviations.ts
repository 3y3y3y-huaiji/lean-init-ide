/**
 * Lean 4 常用 Unicode 缩写。键不含反斜杠，大小写敏感：
 * `\gamma` 是 γ，`\Gamma` 是 Γ。
 *
 * 只收录 Lean 里确实存在、入门课会用到的符号；不追求覆盖 VS Code 插件的全表。
 */
export const LEAN_ABBREVIATIONS: Readonly<Record<string, string>> = {
  // 箭头与逻辑
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  gets: '←',
  mapsto: '↦',
  implies: '⇒',
  Rightarrow: '⇒',
  iff: '↔',
  leftrightarrow: '↔',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  and: '∧',
  land: '∧',
  or: '∨',
  lor: '∨',
  not: '¬',
  neg: '¬',
  // 关系
  ne: '≠',
  neq: '≠',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  equiv: '≡',
  approx: '≈',
  sim: '∼',
  propto: '∝',
  mid: '∣',
  nmid: '∤',
  // 集合
  in: '∈',
  notin: '∉',
  subseteq: '⊆',
  subset: '⊂',
  supseteq: '⊇',
  supset: '⊃',
  cup: '∪',
  cap: '∩',
  empty: '∅',
  emptyset: '∅',
  // 括号与分隔
  langle: '⟨',
  rangle: '⟩',
  '<': '⟨',
  '>': '⟩',
  lfloor: '⌊',
  rfloor: '⌋',
  lceil: '⌈',
  rceil: '⌉',
  colon: ':',
  coloneqq: '≔',
  defeq: '≔',
  // 常用运算
  times: '×',
  cdot: '·',
  circ: '∘',
  star: '⋆',
  top: '⊤',
  bot: '⊥',
  vdash: '⊢',
  models: '⊨',
  pm: '±',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  sum: '∑',
  prod: '∏',
  int: '∫',
  sqrt: '√',
  angle: '∠',
  degree: '°',
  prime: '′',
  cdots: '⋯',
  dots: '…',
  // 希腊字母
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  lam: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

export type AbbreviationMatch = {
  /** 替换起点的 Monaco 列号（1 基，含反斜杠）。 */
  startColumn: number;
  symbol: string;
};

/**
 * 在光标前匹配 `\name`。`lineText` 是整行，`column` 是 Monaco 光标列（1 基）。
 * 只匹配行尾，避免把正文里的 `\to` 误替换。`\<` / `\>` 这类符号缩写也走同一张表。
 */
export const matchAbbreviation = (lineText: string, column: number): AbbreviationMatch | null => {
  const before = lineText.slice(0, Math.max(0, column - 1));
  const match = /\\+([A-Za-z<>]+)$/.exec(before);
  if (!match?.[1]) return null;
  const symbol = LEAN_ABBREVIATIONS[match[1]];
  if (!symbol) return null;
  return { startColumn: column - match[0].length, symbol };
};

export type AbbreviationQuery = {
  /** 替换起点的 Monaco 列号（1 基，含反斜杠）。 */
  startColumn: number;
  /** 反斜杠之后已输入的部分，可能为空。 */
  query: string;
};

/** 光标前一串字符是否构成 `\query`，供 `\` 候选补全使用。 */
export const findAbbreviationQuery = (
  lineText: string,
  column: number,
): AbbreviationQuery | null => {
  const before = lineText.slice(0, Math.max(0, column - 1));
  const match = /\\+([A-Za-z<>]*)$/.exec(before);
  if (!match) return null;
  return { startColumn: column - match[0].length, query: match[1] ?? '' };
};

/** 按前缀筛选缩写；完全匹配的键排在前面，其余保留表中的常用顺序。 */
export const abbreviationSuggestions = (query: string): Array<{ name: string; symbol: string }> =>
  Object.entries(LEAN_ABBREVIATIONS)
    .filter(([name]) => name.startsWith(query))
    .sort(([a], [b]) => (a === query ? -1 : b === query ? 1 : 0))
    .map(([name, symbol]) => ({ name, symbol }));
