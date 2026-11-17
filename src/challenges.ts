/**
 * 趣味数学挑战的唯一数据源。
 *
 * 题目本身是双语内容（标题 / 背景 / 提示都带 zh 与 en），不拆进 i18n 语言包：
 * 这样 slug、骨架代码与参考解法只有一份，新增或修改题目时不会出现两种语言题号漂移。
 * UI 框架文案（按钮、进度、提示标题）仍然走 `src/i18n/`，由 locale-parity 测试守护。
 *
 * 约束：所有代码只使用 Lean 4.35.0 `Init`，不得引入 Mathlib / Lake / Std。
 */
import type { Locale } from './i18n';

export type LocalizedText = {
  zh: string;
  en: string;
};

export type ChallengeTactic = {
  /** 按钮上显示的文案，通常是 Lean 战术名。 */
  label: string;
  /** 点击后插入编辑器光标处的片段。 */
  insert: string;
};

export type Challenge = {
  /** URL 片段，同时用于草稿 key，必须为小写 ASCII 短横线组合。 */
  slug: string;
  title: LocalizedText;
  /** 卡片与 meta description 用的一句话说明。 */
  summary: LocalizedText;
  /** 面向非程序员的通俗题干背景。 */
  body: LocalizedText;
  hint: LocalizedText;
  /** 预填到编辑器里的骨架代码。 */
  starter: string;
  /** 标准参考解法，必须能在 Init 环境下零错误通过。 */
  solution: string;
  /** 编辑器旁的常用策略快捷按钮。 */
  tactics: readonly ChallengeTactic[];
};

const evenDef = 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k';
const oddDef = 'def Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1';

export const CHALLENGES: readonly Challenge[] = [
  {
    slug: 'even-plus-even',
    title: { zh: '偶数 + 偶数还是偶数吗？', en: 'Is even + even always even?' },
    summary: {
      zh: '用「能被 2 整除」的定义，证明两个偶数相加仍然是偶数。',
      en: 'Use the definition of “divisible by 2” to prove that two even numbers add up to an even number.',
    },
    body: {
      zh: '偶数就是能写成 2 × 某个整数的数：2、4、6……都是偶数。现在把两个偶数加起来，比如 4 + 6 = 10，结果仍然是偶数。这不是巧合，而是一条对所有偶数都成立的规律。Lean 的任务，是让这条规律从定义里自动长出来。',
      en: 'An even number can be written as 2 × some integer: 2, 4, 6… are all even. Add two of them—4 + 6 = 10—and the result is still even. That is not a coincidence; it holds for every pair of even numbers. Your job is to make Lean derive that rule from the definition.',
    },
    hint: {
      zh: '先把两个「存在某个 k」拆开，得到 a = 2x、b = 2y。要证明 a + b 是偶数，只需要指出新的 k 是 x + y。',
      en: 'Unpack both “there exists some k” assumptions to get a = 2x and b = 2y. To show a + b is even, you only need to name the new k as x + y.',
    },
    starter: `${evenDef}

theorem even_plus_even (a b : Nat) (ha : Even a) (hb : Even b) :
    Even (a + b) := by
  sorry
`,
    solution: `${evenDef}

theorem even_plus_even (a b : Nat) (ha : Even a) (hb : Even b) :
    Even (a + b) := by
  rcases ha with ⟨x, rfl⟩
  rcases hb with ⟨y, rfl⟩
  exact ⟨x + y, by grind⟩
`,
    tactics: [
      { label: 'rcases', insert: 'rcases ' },
      { label: 'exact', insert: 'exact ' },
      { label: 'grind', insert: 'grind' },
    ],
  },
  {
    slug: 'odd-plus-odd',
    title: { zh: '奇数 + 奇数为什么变成偶数？', en: 'Why does odd + odd become even?' },
    summary: {
      zh: '每个奇数都差一个 1 就能被 2 整除，两个 1 合起来正好再凑一个 2。',
      en: 'Each odd number is one away from a multiple of 2; the two leftover ones combine into another 2.',
    },
    body: {
      zh: '3 + 5 = 8、7 + 9 = 16：两个奇数相加，结果总是偶数。直觉是每个奇数都多出一个 1，两个多出来的 1 又能凑成一个 2。Lean 要求把这个直觉写成精确的等式。',
      en: '3 + 5 = 8 and 7 + 9 = 16: add two odd numbers and the answer is always even. The intuition is that each odd number leaves a spare 1, and two spare ones make another 2. Lean asks you to turn that intuition into an exact equation.',
    },
    hint: {
      zh: '奇数写成 2x + 1 与 2y + 1。相加后是 2x + 2y + 2，也就是 2 × (x + y + 1)。',
      en: 'Write the odds as 2x + 1 and 2y + 1. Their sum is 2x + 2y + 2, which is 2 × (x + y + 1).',
    },
    starter: `${evenDef}
${oddDef}

theorem odd_plus_odd (a b : Nat) (ha : Odd a) (hb : Odd b) :
    Even (a + b) := by
  sorry
`,
    solution: `${evenDef}
${oddDef}

theorem odd_plus_odd (a b : Nat) (ha : Odd a) (hb : Odd b) :
    Even (a + b) := by
  rcases ha with ⟨x, rfl⟩
  rcases hb with ⟨y, rfl⟩
  exact ⟨x + y + 1, by grind⟩
`,
    tactics: [
      { label: 'rcases', insert: 'rcases ' },
      { label: 'exact', insert: 'exact ' },
      { label: 'grind', insert: 'grind' },
    ],
  },
  {
    slug: 'even-plus-odd',
    title: { zh: '偶数 + 奇数一定是奇数吗？', en: 'Must even + odd be odd?' },
    summary: {
      zh: '偶数提供一个整的 2，奇数留下一个孤零零的 1，结果只能落在奇数这一边。',
      en: 'The even number contributes whole 2s while the odd number leaves a lone 1, so the result must be odd.',
    },
    body: {
      zh: '4 + 3 = 7、10 + 5 = 15：偶数加奇数，结果总是奇数。可以把偶数看成「成双成对」，奇数看成「成双成对还多一个」，合在一起仍然多一个。',
      en: '4 + 3 = 7 and 10 + 5 = 15: an even plus an odd is always odd. Think of the even number as complete pairs and the odd number as complete pairs plus one; together there is still one left over.',
    },
    hint: {
      zh: '偶数写成 2x，奇数写成 2y + 1。相加后要证明它等于 2 × (x + y) + 1。',
      en: 'Write the even number as 2x and the odd number as 2y + 1. After adding, show the result equals 2 × (x + y) + 1.',
    },
    starter: `${evenDef}
${oddDef}

theorem even_plus_odd (a b : Nat) (ha : Even a) (hb : Odd b) :
    Odd (a + b) := by
  sorry
`,
    solution: `${evenDef}
${oddDef}

theorem even_plus_odd (a b : Nat) (ha : Even a) (hb : Odd b) :
    Odd (a + b) := by
  rcases ha with ⟨x, rfl⟩
  rcases hb with ⟨y, rfl⟩
  exact ⟨x + y, by grind⟩
`,
    tactics: [
      { label: 'rcases', insert: 'rcases ' },
      { label: 'exact', insert: 'exact ' },
      { label: 'grind', insert: 'grind' },
    ],
  },
  {
    slug: 'add-comm',
    title: { zh: '3 + 4 和 4 + 3 为什么一样？', en: 'Why is 3 + 4 the same as 4 + 3?' },
    summary: {
      zh: '用一条已经证明过的交换律，把 a + 2 直接改写成 2 + a。',
      en: 'Rewrite a + 2 into 2 + a with an already proven commutativity lemma.',
    },
    body: {
      zh: '把 3 个苹果和 4 个苹果放到一起，无论先数哪一堆，总数都是 7。这个「加法交换律」看似显然，数学上却需要证明。Lean 的 Init 已经替你证好了通用的版本，你只要学会调用它。',
      en: 'Put 3 apples and 4 apples together and the total is 7 no matter which pile you count first. This “commutativity of addition” looks obvious, yet mathematics still proves it. Lean’s Init already ships the general proof; you just need to invoke it.',
    },
    hint: {
      zh: '`Nat.add_comm a b` 的类型正是 `a + b = b + a`。用 `rw [Nat.add_comm]` 就能把目标改写成两边相同。',
      en: '`Nat.add_comm a b` has exactly the type `a + b = b + a`. Use `rw [Nat.add_comm]` to turn the goal into two identical sides.',
    },
    starter: `theorem add_two_swap (a : Nat) : a + 2 = 2 + a := by
  sorry
`,
    solution: `theorem add_two_swap (a : Nat) : a + 2 = 2 + a := by
  rw [Nat.add_comm]
`,
    tactics: [
      { label: 'rw [Nat.add_comm]', insert: 'rw [Nat.add_comm]' },
      { label: 'simp', insert: 'simp' },
      { label: 'omega', insert: 'omega' },
    ],
  },
  {
    slug: 'not-even-and-odd',
    title: { zh: '一个数能同时是奇数和偶数吗？', en: 'Can a number be odd and even at once?' },
    summary: {
      zh: '用反证法说明：若 n 同时等于 2x 与 2y + 1，等式两边会差出一个 1。',
      en: 'Argue by contradiction: if n equals both 2x and 2y + 1, the two expressions differ by exactly 1.',
    },
    body: {
      zh: '一个整数要么是奇数，要么是偶数，不可能两边都占。这个「显然」的事实，恰好是练习反证法的好例子：先假设它同时成立，再让 Lean 发现矛盾。',
      en: 'An integer is either odd or even, never both. This “obvious” fact is a perfect exercise in proof by contradiction: assume both hold, then let Lean expose the contradiction.',
    },
    hint: {
      zh: '先用 `intro` 把「同时成立」的假设拿进来，再 `rcases` 拆出两条等式，最后交给 `grind` 处理整数矛盾。',
      en: 'Use `intro` to bring the “both hold” assumption into scope, `rcases` it into the two equations, then hand the arithmetic contradiction to `grind`.',
    },
    starter: `${evenDef}
${oddDef}

theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  sorry
`,
    solution: `${evenDef}
${oddDef}

theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  intro h
  rcases h with ⟨⟨x, hx⟩, ⟨y, hy⟩⟩
  grind
`,
    tactics: [
      { label: 'intro', insert: 'intro ' },
      { label: 'rcases', insert: 'rcases ' },
      { label: 'grind', insert: 'grind' },
    ],
  },
  {
    slug: 'double-induction',
    title: {
      zh: '翻倍 n 次，真的等于 2 × n 吗？',
      en: 'Does doubling n times really equal 2 × n?',
    },
    summary: {
      zh: '从 0 开始每次加 2，用归纳法证明走 n 步后正好是 2n。',
      en: 'Starting at 0 and adding 2 each step, prove by induction that n steps land exactly on 2n.',
    },
    body: {
      zh: '把「翻倍」定义成一个过程：从 0 开始，每走一步就加 2。走 3 步得到 6，走 10 步得到 20。对任意步数 n，结果都应该是 2n。这类「一步一步走」的规律，最适合用归纳法证明。',
      en: 'Define “doubling” as a process: start at 0 and add 2 at every step. Three steps give 6; ten steps give 20. For any number of steps n the result should be 2n. Rules about “one step after another” are exactly what induction is for.',
    },
    hint: {
      zh: '对 n 做归纳。n = 0 时两边都是 0；n + 1 时，先展开一步得到 `double n + 2`，再用归纳假设替换 `double n`。',
      en: 'Induct on n. At n = 0 both sides are 0; at n + 1, unfold one step to get `double n + 2`, then replace `double n` with the induction hypothesis.',
    },
    starter: `-- 翻倍过程：从 0 开始，每走一步加 2
def double : Nat → Nat
  | 0 => 0
  | n + 1 => double n + 2

theorem double_eq_two_mul (n : Nat) : double n = 2 * n := by
  sorry
`,
    solution: `-- 翻倍过程：从 0 开始，每走一步加 2
def double : Nat → Nat
  | 0 => 0
  | n + 1 => double n + 2

theorem double_eq_two_mul (n : Nat) : double n = 2 * n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    have h : double (n + 1) = double n + 2 := rfl
    rw [h, ih]
    omega
`,
    tactics: [
      { label: 'induction', insert: 'induction n with\n  | zero => rfl\n  | succ n ih =>\n    ' },
      { label: 'rfl', insert: 'rfl' },
      { label: 'rw', insert: 'rw [' },
      { label: 'omega', insert: 'omega' },
    ],
  },
];

const CHALLENGE_BY_SLUG = new Map(CHALLENGES.map((challenge) => [challenge.slug, challenge]));

export const challengeBySlug = (slug: string | undefined): Challenge | undefined =>
  slug === undefined ? undefined : CHALLENGE_BY_SLUG.get(slug);

/** 挑战列表页路径。 */
export const challengesPath = (locale: Locale): string => `/${locale}/challenges`;

/** 单个挑战的分享直达路径。 */
export const challengePath = (locale: Locale, slug: string): string =>
  `/${locale}/challenges/${encodeURIComponent(slug)}`;

/** Playground 的 `?challenge=` 参数解析；未知或缺失都返回 undefined。 */
export const resolveChallengeParam = (search: string): Challenge | undefined => {
  const slug = new URLSearchParams(search).get('challenge');
  return challengeBySlug(slug ?? undefined);
};
