/**
 * 趣味数学挑战的唯一数据源。
 *
 * 题目本身是双语内容（标题 / 背景 / 提示 / 代码注释都带 zh 与 en），不拆进 i18n 语言包：
 * 这样 slug 只有一份，新增或修改题目时不会出现两种语言题号漂移。
 *
 * 骨架与解法里的证明代码在中英文之间保持一致，只有「--」注释按语言翻译；
 * `challenges.test.ts` 会剥掉注释后逐题比对，防止两种语言悄悄写成不同的证明。
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
  /** 给零基础用户的一句话解释：这个策略在做什么。 */
  description: LocalizedText;
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
  /** 预填到编辑器里的骨架代码，带逐步讲解注释。 */
  starter: LocalizedText;
  /** 标准参考解法，必须能在 Init 环境下零错误通过。 */
  solution: LocalizedText;
  /** 编辑器旁的常用策略快捷按钮。 */
  tactics: readonly ChallengeTactic[];
};

/** 策略说明按名字复用：同一策略在不同题里含义一致，只是拆的对象不同。 */
const TACTIC_GUIDE = {
  rcases: {
    zh: '拆开「存在某个数」或「并且」的假设，把里面的数和一个等式拿出来用。',
    en: 'Unpack an “exists some number” or “and” assumption to get the number and its equation.',
  },
  exact: {
    zh: '手里已经有完全符合条件的证明时，直接交给 Lean 结束目标。',
    en: 'Hand Lean a proof that already matches the goal exactly.',
  },
  grind: {
    zh: '自动处理加减乘除等式与矛盾，通常放在最后一步收尾。',
    en: 'Automatically closes arithmetic equalities and contradictions; usually the last step.',
  },
  intro: {
    zh: '把「如果……那么……」的前提，或「不成立」的假设，引入成已知条件。',
    en: 'Bring an implication premise, or the assumption inside a negation, into scope.',
  },
  rw: {
    zh: '按一条等式改写目标，把左边换成右边。',
    en: 'Rewrite the goal with an equation, replacing one side by the other.',
  },
  simp: {
    zh: '用定义和现成引理自动化简目标。',
    en: 'Simplify the goal with definitions and existing lemmas.',
  },
  omega: {
    zh: '自动证明加减与乘常数的线性算术命题。',
    en: 'Prove linear arithmetic goals with addition, subtraction and constant multiplication.',
  },
  induction: {
    zh: '对自然数做归纳：先证 0 的情况，再假设 n 成立去证 n + 1。',
    en: 'Induct on a natural number: prove the base case, then assume n and prove n + 1.',
  },
  rfl: {
    zh: '两边按定义算出来一模一样时，用它直接结束目标。',
    en: 'Use it when both sides compute to the same thing by definition.',
  },
};

const tactic = (
  label: string,
  insert: string,
  guide: keyof typeof TACTIC_GUIDE,
): ChallengeTactic => ({
  label,
  insert,
  description: TACTIC_GUIDE[guide],
});

const evenDef = {
  zh: '-- Even n 表示「n 是偶数」：存在某个自然数 k，使 n = 2 * k\ndef Even (n : Nat) : Prop := ∃ k, n = 2 * k',
  en: '-- Even n means "n is even": there is a natural number k with n = 2 * k\ndef Even (n : Nat) : Prop := ∃ k, n = 2 * k',
};

const oddDef = {
  zh: '-- Odd n 表示「n 是奇数」：存在某个自然数 k，使 n = 2 * k + 1\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1',
  en: '-- Odd n means "n is odd": there is a natural number k with n = 2 * k + 1\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1',
};

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
    starter: {
      zh: `${evenDef.zh}

-- 要证明：两个偶数相加仍然是偶数
-- ha : Even a 读作「a 是偶数」；hb : Even b 同理
theorem even_plus_even (a b : Nat) (ha : Even a) (hb : Even b) :
    Even (a + b) := by
  -- 目标：⊢ Even (a + b)
  -- 第 1 步：用 rcases 拆开 ha，把 a 写成 2 * x
  -- 第 2 步：再用 rcases 拆开 hb，把 b 写成 2 * y
  -- 第 3 步：用 exact 说明新的 k 取 x + y
  sorry
`,
      en: `${evenDef.en}

-- Goal: prove that the sum of two even numbers is still even
-- ha : Even a reads "a is even"; hb : Even b is the same for b
theorem even_plus_even (a b : Nat) (ha : Even a) (hb : Even b) :
    Even (a + b) := by
  -- Goal: ⊢ Even (a + b)
  -- Step 1: use rcases on ha to write a as 2 * x
  -- Step 2: use rcases on hb to write b as 2 * y
  -- Step 3: use exact to say the new k is x + y
  sorry
`,
    },
    solution: {
      zh: `${evenDef.zh}

theorem even_plus_even (a b : Nat) (ha : Even a) (hb : Even b) :
    Even (a + b) := by
  -- 拆开 ha：把 a 替换成 2 * x
  rcases ha with ⟨x, rfl⟩
  -- 拆开 hb：把 b 替换成 2 * y
  rcases hb with ⟨y, rfl⟩
  -- 目标变成 Even (2 * x + 2 * y)，新的 k 取 x + y
  -- 剩下的等式 2 * x + 2 * y = 2 * (x + y) 交给 grind
  exact ⟨x + y, by grind⟩
`,
      en: `${evenDef.en}

theorem even_plus_even (a b : Nat) (ha : Even a) (hb : Even b) :
    Even (a + b) := by
  -- Unpack ha: replace a with 2 * x
  rcases ha with ⟨x, rfl⟩
  -- Unpack hb: replace b with 2 * y
  rcases hb with ⟨y, rfl⟩
  -- The goal is now Even (2 * x + 2 * y), so the new k is x + y
  -- grind finishes the equality 2 * x + 2 * y = 2 * (x + y)
  exact ⟨x + y, by grind⟩
`,
    },
    tactics: [
      tactic('rcases', 'rcases ', 'rcases'),
      tactic('exact', 'exact ', 'exact'),
      tactic('grind', 'grind', 'grind'),
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
    starter: {
      zh: `${evenDef.zh}
${oddDef.zh}

-- 要证明：两个奇数相加会变成偶数
theorem odd_plus_odd (a b : Nat) (ha : Odd a) (hb : Odd b) :
    Even (a + b) := by
  -- 目标：⊢ Even (a + b)
  -- 把两个奇数都写成「2 的倍数 + 1」
  -- 两个 +1 合起来正好再凑一个 2，新的 k 取 x + y + 1
  sorry
`,
      en: `${evenDef.en}
${oddDef.en}

-- Goal: prove that two odd numbers add up to an even number
theorem odd_plus_odd (a b : Nat) (ha : Odd a) (hb : Odd b) :
    Even (a + b) := by
  -- Goal: ⊢ Even (a + b)
  -- Write both odd numbers as "a multiple of 2, plus 1"
  -- The two +1s combine into another 2, so the new k is x + y + 1
  sorry
`,
    },
    solution: {
      zh: `${evenDef.zh}
${oddDef.zh}

theorem odd_plus_odd (a b : Nat) (ha : Odd a) (hb : Odd b) :
    Even (a + b) := by
  -- 拆开 ha：a 变成 2 * x + 1
  rcases ha with ⟨x, rfl⟩
  -- 拆开 hb：b 变成 2 * y + 1
  rcases hb with ⟨y, rfl⟩
  -- (2x + 1) + (2y + 1) = 2 * (x + y + 1)，新的 k 取 x + y + 1
  exact ⟨x + y + 1, by grind⟩
`,
      en: `${evenDef.en}
${oddDef.en}

theorem odd_plus_odd (a b : Nat) (ha : Odd a) (hb : Odd b) :
    Even (a + b) := by
  -- Unpack ha: a becomes 2 * x + 1
  rcases ha with ⟨x, rfl⟩
  -- Unpack hb: b becomes 2 * y + 1
  rcases hb with ⟨y, rfl⟩
  -- (2x + 1) + (2y + 1) = 2 * (x + y + 1), so the new k is x + y + 1
  exact ⟨x + y + 1, by grind⟩
`,
    },
    tactics: [
      tactic('rcases', 'rcases ', 'rcases'),
      tactic('exact', 'exact ', 'exact'),
      tactic('grind', 'grind', 'grind'),
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
    starter: {
      zh: `${evenDef.zh}
${oddDef.zh}

-- 要证明：偶数加奇数一定是奇数
theorem even_plus_odd (a b : Nat) (ha : Even a) (hb : Odd b) :
    Odd (a + b) := by
  -- 目标：⊢ Odd (a + b)
  -- 偶数写成 2 * x，奇数写成 2 * y + 1
  -- 相加后仍然多出一个 1，所以新的 k 取 x + y
  sorry
`,
      en: `${evenDef.en}
${oddDef.en}

-- Goal: prove that an even number plus an odd number must be odd
theorem even_plus_odd (a b : Nat) (ha : Even a) (hb : Odd b) :
    Odd (a + b) := by
  -- Goal: ⊢ Odd (a + b)
  -- Write the even number as 2 * x and the odd one as 2 * y + 1
  -- The sum still leaves a spare 1, so the new k is x + y
  sorry
`,
    },
    solution: {
      zh: `${evenDef.zh}
${oddDef.zh}

theorem even_plus_odd (a b : Nat) (ha : Even a) (hb : Odd b) :
    Odd (a + b) := by
  -- 拆开 ha：a 变成 2 * x
  rcases ha with ⟨x, rfl⟩
  -- 拆开 hb：b 变成 2 * y + 1
  rcases hb with ⟨y, rfl⟩
  -- 目标是 Odd (2 * x + 2 * y + 1)，新的 k 取 x + y
  exact ⟨x + y, by grind⟩
`,
      en: `${evenDef.en}
${oddDef.en}

theorem even_plus_odd (a b : Nat) (ha : Even a) (hb : Odd b) :
    Odd (a + b) := by
  -- Unpack ha: a becomes 2 * x
  rcases ha with ⟨x, rfl⟩
  -- Unpack hb: b becomes 2 * y + 1
  rcases hb with ⟨y, rfl⟩
  -- The goal is Odd (2 * x + 2 * y + 1), so the new k is x + y
  exact ⟨x + y, by grind⟩
`,
    },
    tactics: [
      tactic('rcases', 'rcases ', 'rcases'),
      tactic('exact', 'exact ', 'exact'),
      tactic('grind', 'grind', 'grind'),
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
    starter: {
      zh: `-- 目标：证明 a + 2 = 2 + a
-- 这只是加法交换律的一个特例：Lean 的 Init 已经证好了通用版本
theorem add_two_swap (a : Nat) : a + 2 = 2 + a := by
  -- rw 是 rewrite（改写）：把一条等式套到目标上
  -- 这里用 Nat.add_comm，把 a + 2 改写成 2 + a
  sorry
`,
      en: `-- Goal: prove a + 2 = 2 + a
-- This is a special case of commutativity; Lean's Init already proves the general version
theorem add_two_swap (a : Nat) : a + 2 = 2 + a := by
  -- rw means rewrite: apply an equation to the goal
  -- Use Nat.add_comm here to turn a + 2 into 2 + a
  sorry
`,
    },
    solution: {
      zh: `-- 参考解法：只调用一次已经证好的交换律
theorem add_two_swap (a : Nat) : a + 2 = 2 + a := by
  -- Nat.add_comm 说 a + b = b + a；改写后两边相同，目标自动关闭
  rw [Nat.add_comm]
`,
      en: `-- Reference solution: call the already proven commutativity lemma once
theorem add_two_swap (a : Nat) : a + 2 = 2 + a := by
  -- Nat.add_comm says a + b = b + a; after rewriting, both sides are identical
  rw [Nat.add_comm]
`,
    },
    tactics: [
      tactic('rw [Nat.add_comm]', 'rw [Nat.add_comm]', 'rw'),
      tactic('simp', 'simp', 'simp'),
      tactic('omega', 'omega', 'omega'),
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
    starter: {
      zh: `${evenDef.zh}
${oddDef.zh}

-- ¬ P 读作「P 不成立」：先假设 P，再推出矛盾
-- Even n ∧ Odd n 读作「n 既是偶数又是奇数」
theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  -- 第 1 步：intro h，把「假设它同时成立」拿进来
  -- 第 2 步：rcases h，拆出 n = 2 * x 与 n = 2 * y + 1
  -- 第 3 步：grind 会发现这两个等式不可能同时成立
  sorry
`,
      en: `${evenDef.en}
${oddDef.en}

-- ¬ P reads "P does not hold": assume P, then derive a contradiction
-- Even n ∧ Odd n reads "n is both even and odd"
theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  -- Step 1: intro h, bringing the "both hold" assumption into scope
  -- Step 2: rcases h into n = 2 * x and n = 2 * y + 1
  -- Step 3: grind will show the two equations cannot both hold
  sorry
`,
    },
    solution: {
      zh: `${evenDef.zh}
${oddDef.zh}

theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  -- 假设「n 同时是偶数和奇数」
  intro h
  -- 拆成 n = 2 * x 与 n = 2 * y + 1
  rcases h with ⟨⟨x, hx⟩, ⟨y, hy⟩⟩
  -- 两个等式不可能同时成立，grind 负责找出矛盾
  grind
`,
      en: `${evenDef.en}
${oddDef.en}

theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  -- Assume "n is both even and odd"
  intro h
  -- Split it into n = 2 * x and n = 2 * y + 1
  rcases h with ⟨⟨x, hx⟩, ⟨y, hy⟩⟩
  -- The two equations cannot both hold; grind finds the contradiction
  grind
`,
    },
    tactics: [
      tactic('intro', 'intro ', 'intro'),
      tactic('rcases', 'rcases ', 'rcases'),
      tactic('grind', 'grind', 'grind'),
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
    starter: {
      zh: `-- 自定义「翻倍」过程：走 0 步结果是 0，每多走一步就加 2
def double : Nat → Nat
  | 0 => 0
  | n + 1 => double n + 2

-- 目标：走 n 步之后，结果正好是 2 * n
theorem double_eq_two_mul (n : Nat) : double n = 2 * n := by
  -- 对 n 做归纳法：
  --   起点 n = 0：double 0 = 0，右边 2 * 0 也算出 0，用 rfl
  --   递推：假设 double n = 2 * n，去证 double (n + 1) = 2 * (n + 1)
  sorry
`,
      en: `-- A custom "doubling" process: 0 steps give 0, each extra step adds 2
def double : Nat → Nat
  | 0 => 0
  | n + 1 => double n + 2

-- Goal: after n steps the result is exactly 2 * n
theorem double_eq_two_mul (n : Nat) : double n = 2 * n := by
  -- Induct on n:
  --   base n = 0: double 0 = 0, and 2 * 0 also computes to 0, so rfl
  --   step: assume double n = 2 * n, prove double (n + 1) = 2 * (n + 1)
  sorry
`,
    },
    solution: {
      zh: `-- 自定义「翻倍」过程：走 0 步结果是 0，每多走一步就加 2
def double : Nat → Nat
  | 0 => 0
  | n + 1 => double n + 2

theorem double_eq_two_mul (n : Nat) : double n = 2 * n := by
  induction n with
  | zero =>
    -- 起点：两边都按定义算成 0
    rfl
  | succ n ih =>
    -- 先展开一步：double (n + 1) = double n + 2
    have h : double (n + 1) = double n + 2 := rfl
    -- 用归纳假设 ih 把 double n 换成 2 * n
    rw [h, ih]
    -- 剩下的算术交给 omega
    omega
`,
      en: `-- A custom "doubling" process: 0 steps give 0, each extra step adds 2
def double : Nat → Nat
  | 0 => 0
  | n + 1 => double n + 2

theorem double_eq_two_mul (n : Nat) : double n = 2 * n := by
  induction n with
  | zero =>
    -- Base case: both sides compute to 0 by definition
    rfl
  | succ n ih =>
    -- Unfold one step: double (n + 1) = double n + 2
    have h : double (n + 1) = double n + 2 := rfl
    -- Use the induction hypothesis ih to replace double n with 2 * n
    rw [h, ih]
    -- omega finishes the remaining arithmetic
    omega
`,
    },
    tactics: [
      tactic('induction', 'induction n with\n  | zero => rfl\n  | succ n ih =>\n    ', 'induction'),
      tactic('rfl', 'rfl', 'rfl'),
      tactic('rw', 'rw [', 'rw'),
      tactic('omega', 'omega', 'omega'),
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
