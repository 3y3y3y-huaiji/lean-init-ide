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
import type { ChallengeMode } from './exercise';
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

export type ChallengeBountySlots = {
  bronze: string;
  silver: string;
  legend: string;
};

export type Challenge = {
  /** URL 片段，同时用于草稿 key，必须为小写 ASCII 短横线组合。 */
  slug: string;
  /** 四大主题区对应四种判题模式。 */
  mode: ChallengeMode;
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
  /** 真假审判庭：正确候选与错误候选的定理名。 */
  verdict?: { correct: string; wrong: string };
  /** 契约漏洞猎人：必须原样保留的核心结论片段。 */
  requiredConclusion?: string;
  /** 悬赏厅：三层槽位的定理名。 */
  bounty?: ChallengeBountySlots;
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
  decide: {
    zh: '把具体数值的判定交给编译器逐项算完，适合验证小例子。',
    en: 'Let the compiler compute a concrete decision; ideal for checking small examples.',
  },
  unfold: {
    zh: '把一个定义原地展开，让目标露出真正的 if / 分支结构。',
    en: 'Unfold a definition in place so the goal exposes its real if / branch structure.',
  },
  by_cases: {
    zh: '按一个条件是否成立分成两路，分别证明两条分支都满足目标。',
    en: 'Split into the cases where a condition holds or fails, then prove the goal in each.',
  },
  refine: {
    zh: '先交出证明骨架里的关键参数，剩下的子目标稍后再补。',
    en: 'Hand over the key arguments of a proof skeleton first and fill the remaining subgoals later.',
  },
  constructor: {
    zh: '目标是一个「并且」时，把它拆成两个子目标分别证明。',
    en: 'When the goal is an “and”, split it into two subgoals and prove each.',
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
    mode: 'classic',
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
    slug: 'add-comm',
    mode: 'classic',
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
    mode: 'classic',
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
    mode: 'classic',
    title: {
      zh: '每步跨 2 级台阶，走 n 步后一定在 2n 级吗？',
      en: 'Climbing two steps at a time: does n steps land on 2n?',
    },
    summary: {
      zh: '从 0 级开始，每步跨 2 级；用归纳法证明走 n 步后正好在 2n 级。',
      en: 'Start at step 0 and climb two at a time; prove by induction that n steps land exactly on 2n.',
    },
    body: {
      zh: '站在 0 级台阶上，每步跨 2 级：走 1 步到 2，走 3 步到 6。对任意步数 n，位置都应该是 2n。这种「一步一步走」的规律，最适合用归纳法证明。',
      en: 'Stand on step 0 and climb two steps at a time: one step lands on 2, three steps land on 6. For any number of steps n the position should be 2n. Rules about “one step after another” are exactly what induction is for.',
    },
    hint: {
      zh: '对 n 做归纳。n = 0 时两边都是 0；n + 1 时，先展开一步得到 `double n + 2`，再用归纳假设替换 `double n`。',
      en: 'Induct on n. At n = 0 both sides are 0; at n + 1, unfold one step to get `double n + 2`, then replace `double n` with the induction hypothesis.',
    },
    starter: {
      zh: `-- 自定义「上台阶」过程：走 0 步停在 0 级，每多走一步就上升 2 级
def double : Nat → Nat
  | 0 => 0
  | n + 1 => double n + 2

-- 目标：走 n 步之后，位置正好是 2 * n
theorem double_eq_two_mul (n : Nat) : double n = 2 * n := by
  -- 对 n 做归纳法：
  --   起点 n = 0：double 0 = 0，右边 2 * 0 也算出 0，用 rfl
  --   递推：假设 double n = 2 * n，去证 double (n + 1) = 2 * (n + 1)
  sorry
`,
      en: `-- A custom "climb" process: 0 steps stay at 0, each extra step goes up 2
def double : Nat → Nat
  | 0 => 0
  | n + 1 => double n + 2

-- Goal: after n steps the position is exactly 2 * n
theorem double_eq_two_mul (n : Nat) : double n = 2 * n := by
  -- Induct on n:
  --   base n = 0: double 0 = 0, and 2 * 0 also computes to 0, so rfl
  --   step: assume double n = 2 * n, prove double (n + 1) = 2 * (n + 1)
  sorry
`,
    },
    solution: {
      zh: `-- 自定义「上台阶」过程：走 0 步停在 0 级，每多走一步就上升 2 级
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
      en: `-- A custom "climb" process: 0 steps stay at 0, each extra step goes up 2
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
  {
    slug: 'nat-sub-trap',
    mode: 'verdict',
    title: {
      zh: '自然数减法满足 (a - b) + b = a 吗？',
      en: 'Does natural subtraction satisfy (a - b) + b = a?',
    },
    summary: {
      zh: '保留你觉得正确的那一个签名，证出它；另一个候选可能是假命题。',
      en: 'Keep the signature you believe is true and prove it; the other candidate may be false.',
    },
    body: {
      zh: '在整数里，先减后加一定回到原点；但自然数没有负数，0 - 1 会被截断成 0。于是 (0 - 1) + 1 = 1，并不等于 0。审判庭给出两个候选，你只需要保留并证出正确的那一个。',
      en: 'With integers, subtracting then adding always returns to the start. Natural numbers have no negatives, so 0 - 1 is truncated to 0. Thus (0 - 1) + 1 = 1, not 0. The court offers two candidates; keep and prove the correct one.',
    },
    hint: {
      zh: '先找反例：a = 0、b = 1 时左边是 1，右边是 0。确认候选 B 为真后，删掉候选 A，用 decide 检查这个具体反例。',
      en: 'Look for a counterexample first: with a = 0 and b = 1 the left side is 1 while the right side is 0. Once candidate B looks true, delete candidate A and use decide to check the concrete counterexample.',
    },
    starter: {
      zh: `-- 自然数减法在「不够减」时会截断到 0
-- 候选 A：减法普遍满足 (a - b) + b = a
theorem verdict_true (a b : Nat) : (a - b) + b = a := by
  -- 如果找不到证明，也许这个候选根本不成立
  sorry

-- 候选 B：存在一组数让等式失败
theorem verdict_false : ∃ a b : Nat, (a - b) + b ≠ a := by
  -- 提示：试试 a = 0、b = 1
  sorry
`,
      en: `-- Natural subtraction truncates at 0 when there is "not enough to subtract"
-- Candidate A: subtraction always satisfies (a - b) + b = a
theorem verdict_true (a b : Nat) : (a - b) + b = a := by
  -- If you cannot find a proof, maybe this candidate is simply false
  sorry

-- Candidate B: some pair of numbers makes the equation fail
theorem verdict_false : ∃ a b : Nat, (a - b) + b ≠ a := by
  -- Hint: try a = 0 and b = 1
  sorry
`,
    },
    solution: {
      zh: `-- 候选 B 成立：0 - 1 被截断为 0，所以 (0 - 1) + 1 = 1 ≠ 0
-- 只保留正确候选，错误候选要从文件里删掉
theorem verdict_false : ∃ a b : Nat, (a - b) + b ≠ a := ⟨0, 1, by decide⟩
`,
      en: `-- Candidate B is true: 0 - 1 truncates to 0, so (0 - 1) + 1 = 1 ≠ 0
-- Keep only the correct candidate and delete the false one from the file
theorem verdict_false : ∃ a b : Nat, (a - b) + b ≠ a := ⟨0, 1, by decide⟩
`,
    },
    verdict: { correct: 'verdict_false', wrong: 'verdict_true' },
    requiredConclusion: '∃ a b : Nat, (a - b) + b ≠ a',
    tactics: [
      tactic('decide', 'decide', 'decide'),
      tactic('exact', 'exact ', 'exact'),
      tactic('omega', 'omega', 'omega'),
    ],
  },
  {
    slug: 'even-sum-split',
    mode: 'verdict',
    title: {
      zh: 'a + b 是偶数，a 和 b 就一定都是偶数吗？',
      en: 'If a + b is even, must both a and b be even?',
    },
    summary: {
      zh: '两个奇数相加也能得到偶数；审判庭要求你找出这个反例并保留正确候选。',
      en: 'Two odd numbers can add up to an even number; find that counterexample and keep the correct candidate.',
    },
    body: {
      zh: '4 + 6 = 10 是偶数，两个加数也都是偶数；但 1 + 1 = 2 同样是偶数，加数却都是奇数。所以「和是偶数」并不足以推出两个加数都是偶数。请在两个候选里保留正确的那一个。',
      en: '4 + 6 = 10 is even and both addends are even; but 1 + 1 = 2 is also even while both addends are odd. So “the sum is even” does not imply both addends are even. Keep the correct candidate.',
    },
    hint: {
      zh: '反例取 a = 1、b = 1：和 1 + 1 是偶数，但 1 不是偶数。拆开 Even 1 会得到 1 = 2 * x，omega 会发现矛盾。',
      en: 'Take a = 1 and b = 1: the sum 1 + 1 is even, but 1 is not. Unpacking Even 1 gives 1 = 2 * x, and omega exposes the contradiction.',
    },
    starter: {
      zh: `-- Even n 表示「n 是偶数」：存在某个自然数 k，使 n = 2 * k
def Even (n : Nat) : Prop := ∃ k, n = 2 * k

-- 候选 A：和是偶数时，两个加数都是偶数
theorem verdict_true (a b : Nat) : Even (a + b) → Even a ∧ Even b := by
  sorry

-- 候选 B：存在和为偶数、但加数不全是偶数的例子
theorem verdict_false : ∃ a b : Nat, Even (a + b) ∧ ¬ (Even a ∧ Even b) := by
  -- 提示：两个 1 相加就是最简单的反例
  sorry
`,
      en: `-- Even n means "n is even": there is a natural number k with n = 2 * k
def Even (n : Nat) : Prop := ∃ k, n = 2 * k

-- Candidate A: when the sum is even, both addends are even
theorem verdict_true (a b : Nat) : Even (a + b) → Even a ∧ Even b := by
  sorry

-- Candidate B: some even sum has addends that are not both even
theorem verdict_false : ∃ a b : Nat, Even (a + b) ∧ ¬ (Even a ∧ Even b) := by
  -- Hint: two 1s are the simplest counterexample
  sorry
`,
    },
    solution: {
      zh: `-- Even n 表示「n 是偶数」：存在某个自然数 k，使 n = 2 * k
def Even (n : Nat) : Prop := ∃ k, n = 2 * k

-- 候选 B 成立：1 + 1 = 2 是偶数，但 1 不是偶数
theorem verdict_false : ∃ a b : Nat, Even (a + b) ∧ ¬ (Even a ∧ Even b) := by
  refine ⟨1, 1, ⟨1, by decide⟩, ?_⟩
  intro h
  rcases h with ⟨⟨x, hx⟩, _⟩
  omega
`,
      en: `-- Even n means "n is even": there is a natural number k with n = 2 * k
def Even (n : Nat) : Prop := ∃ k, n = 2 * k

-- Candidate B is true: 1 + 1 = 2 is even, but 1 is not even
theorem verdict_false : ∃ a b : Nat, Even (a + b) ∧ ¬ (Even a ∧ Even b) := by
  refine ⟨1, 1, ⟨1, by decide⟩, ?_⟩
  intro h
  rcases h with ⟨⟨x, hx⟩, _⟩
  omega
`,
    },
    verdict: { correct: 'verdict_false', wrong: 'verdict_true' },
    requiredConclusion: '∃ a b : Nat, Even (a + b) ∧ ¬ (Even a ∧ Even b)',
    tactics: [
      tactic('rcases', 'rcases ', 'rcases'),
      tactic('refine', 'refine ', 'refine'),
      tactic('omega', 'omega', 'omega'),
    ],
  },
  {
    slug: 'clamp-contract',
    mode: 'bugfix',
    title: {
      zh: '找出区间裁剪函数的契约漏洞',
      en: 'Find the contract hole in the interval clamp',
    },
    summary: {
      zh: 'clamp 声称结果总在 [lo, hi] 内，但它缺少 lo ≤ hi 的前提，分支也写反了。',
      en: 'clamp claims the result always lies in [lo, hi], but it lacks the premise lo ≤ hi and its branches are reversed.',
    },
    body: {
      zh: '区间裁剪函数负责把 x 限制在 [lo, hi] 里：太小就抬到 lo，太大就压到 hi。骨架里的版本既没有要求 lo ≤ hi，又把两个分支的返回值写反了。你可以修正实现，也可以给定理补上前提，只要保留核心结论即可。',
      en: 'An interval clamp keeps x inside [lo, hi]: lift it to lo when too small, press it to hi when too large. The skeleton neither assumes lo ≤ hi nor returns the right branch values. You may fix the implementation or add the missing premise, as long as the core conclusion stays intact.',
    },
    hint: {
      zh: '先补 `h : lo ≤ hi`，否则 lo = 5、hi = 1 时结论直接为假；再检查两个 if 分支是否分别返回 lo 和 hi。',
      en: 'Add `h : lo ≤ hi` first, otherwise the claim is false when lo = 5 and hi = 1; then check that the two if branches return lo and hi respectively.',
    },
    starter: {
      zh: `-- 区间裁剪：把 x 限制在 [lo, hi] 内
-- 漏洞：没有要求 lo ≤ hi，而且两个分支的返回值写反了
def clamp (lo hi x : Nat) : Nat :=
  if x < lo then hi else if hi < x then lo else x

-- 目标：裁剪后的值始终落在区间内
theorem clamp_in_range (lo hi x : Nat) :
    lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi := by
  sorry
`,
      en: `-- Interval clamp: keep x inside [lo, hi]
-- Hole: it never assumes lo ≤ hi, and the two branches return reversed values
def clamp (lo hi x : Nat) : Nat :=
  if x < lo then hi else if hi < x then lo else x

-- Goal: the clamped value always lies inside the interval
theorem clamp_in_range (lo hi x : Nat) :
    lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi := by
  sorry
`,
    },
    solution: {
      zh: `-- 修正分支：太小时返回 lo，太大时返回 hi
def clamp (lo hi x : Nat) : Nat :=
  if x < lo then lo else if hi < x then hi else x

-- 补上缺失的前提 h : lo ≤ hi，核心结论保持不变
theorem clamp_in_range (lo hi x : Nat) (h : lo ≤ hi) :
    lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi := by
  by_cases h1 : x < lo
  · simp only [clamp, ite_eq_left h1]
    exact ⟨Nat.le_refl lo, h⟩
  · by_cases h2 : hi < x
    · simp only [clamp, ite_eq_right h1, ite_eq_left h2]
      exact ⟨h, Nat.le_refl hi⟩
    · simp only [clamp, ite_eq_right h1, ite_eq_right h2]
      constructor <;> omega
`,
      en: `-- Fix the branches: return lo when too small, hi when too large
def clamp (lo hi x : Nat) : Nat :=
  if x < lo then lo else if hi < x then hi else x

-- Add the missing premise h : lo ≤ hi while keeping the core conclusion unchanged
theorem clamp_in_range (lo hi x : Nat) (h : lo ≤ hi) :
    lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi := by
  by_cases h1 : x < lo
  · simp only [clamp, ite_eq_left h1]
    exact ⟨Nat.le_refl lo, h⟩
  · by_cases h2 : hi < x
    · simp only [clamp, ite_eq_right h1, ite_eq_left h2]
      exact ⟨h, Nat.le_refl hi⟩
    · simp only [clamp, ite_eq_right h1, ite_eq_right h2]
      constructor <;> omega
`,
    },
    requiredConclusion: 'lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi',
    tactics: [
      tactic('unfold', 'unfold ', 'unfold'),
      tactic('by_cases', 'by_cases ', 'by_cases'),
      tactic('omega', 'omega', 'omega'),
    ],
  },
  {
    slug: 'collatz-bounty',
    mode: 'bounty',
    title: {
      zh: '考拉兹 3n + 1 猜想悬赏',
      en: 'The Collatz 3n + 1 bounty',
    },
    summary: {
      zh: '铜牌和银牌可以当场证完；传说层的完整猜想至今无人解决。',
      en: 'The bronze and silver tiers are provable today; the legendary full conjecture remains open.',
    },
    body: {
      zh: '考拉兹规则很简单：偶数折半，奇数变成 3n + 1。猜想说，从任何大于 0 的自然数出发，反复执行都会回到 1。铜牌只验证一个具体例子，银牌证明一整族偶数都会折半，传说层才是完整猜想。完成铜牌或银牌即可点亮本关。',
      en: 'The Collatz rule is simple: halve evens, map odds to 3n + 1. The conjecture says every positive natural number eventually reaches 1. Bronze checks one concrete example, silver proves a whole family of even numbers halves, and the legend is the full conjecture. Finish bronze or silver to light up this challenge.',
    },
    hint: {
      zh: '铜牌直接 decide 算两步；银牌先展开 collatzStep，再用 omega 说明 2 * (n + 1) 除以 2 就是 n + 1。传说层留作悬赏，不需要写出证明。',
      en: 'Bronze uses decide to compute two steps; silver unfolds collatzStep and uses omega to show 2 * (n + 1) divided by 2 is n + 1. Leave the legend as the open bounty.',
    },
    starter: {
      zh: `-- 考拉兹过程：偶数折半，奇数乘 3 加 1
def collatzStep (n : Nat) : Nat :=
  if n % 2 = 0 then n / 2 else 3 * n + 1

-- 从 n 出发，走 k 步是否到达 1
def collatzReach (n : Nat) : Nat → Prop
  | 0 => n = 1
  | k + 1 => collatzReach (collatzStep n) k

-- 🥉 铜牌：两步之内，6 会变成 10
theorem tier_bronze : collatzStep (collatzStep 6) = 10 := by
  sorry

-- 🥈 银牌：任何偶数 2 * (n + 1) 一步折半到 n + 1
theorem tier_silver (n : Nat) : collatzStep (2 * (n + 1)) = n + 1 := by
  sorry

-- 👑 传说：所有大于 0 的自然数最终都会走到 1（考拉兹猜想，至今未解）
theorem tier_legend : ∀ n : Nat, n ≠ 0 → ∃ k : Nat, collatzReach n k := by
  sorry
`,
      en: `-- Collatz step: halve evens, map odds to 3n + 1
def collatzStep (n : Nat) : Nat :=
  if n % 2 = 0 then n / 2 else 3 * n + 1

-- Starting from n, does k steps reach 1?
def collatzReach (n : Nat) : Nat → Prop
  | 0 => n = 1
  | k + 1 => collatzReach (collatzStep n) k

-- 🥉 Bronze: within two steps, 6 becomes 10
theorem tier_bronze : collatzStep (collatzStep 6) = 10 := by
  sorry

-- 🥈 Silver: every even number 2 * (n + 1) halves to n + 1 in one step
theorem tier_silver (n : Nat) : collatzStep (2 * (n + 1)) = n + 1 := by
  sorry

-- 👑 Legend: every positive natural number eventually reaches 1 (Collatz, still open)
theorem tier_legend : ∀ n : Nat, n ≠ 0 → ∃ k : Nat, collatzReach n k := by
  sorry
`,
    },
    solution: {
      zh: `-- 考拉兹过程：偶数折半，奇数乘 3 加 1
def collatzStep (n : Nat) : Nat :=
  if n % 2 = 0 then n / 2 else 3 * n + 1

-- 从 n 出发，走 k 步是否到达 1
def collatzReach (n : Nat) : Nat → Prop
  | 0 => n = 1
  | k + 1 => collatzReach (collatzStep n) k

-- 🥉 铜牌：6 → 3 → 10，交给编译器逐步算完
theorem tier_bronze : collatzStep (collatzStep 6) = 10 := by
  decide

-- 🥈 银牌：2 * (n + 1) 是偶数，折半后回到 n + 1
theorem tier_silver (n : Nat) : collatzStep (2 * (n + 1)) = n + 1 := by
  unfold collatzStep
  have hmod : (2 * (n + 1)) % 2 = 0 := by omega
  rw [ite_eq_left hmod]
  omega

-- 👑 传说层是完整猜想，作为悬赏保留，标准解法不尝试证明它
`,
      en: `-- Collatz step: halve evens, map odds to 3n + 1
def collatzStep (n : Nat) : Nat :=
  if n % 2 = 0 then n / 2 else 3 * n + 1

-- Starting from n, does k steps reach 1?
def collatzReach (n : Nat) : Nat → Prop
  | 0 => n = 1
  | k + 1 => collatzReach (collatzStep n) k

-- 🥉 Bronze: 6 → 3 → 10, let the compiler compute each step
theorem tier_bronze : collatzStep (collatzStep 6) = 10 := by
  decide

-- 🥈 Silver: 2 * (n + 1) is even, so halving returns n + 1
theorem tier_silver (n : Nat) : collatzStep (2 * (n + 1)) = n + 1 := by
  unfold collatzStep
  have hmod : (2 * (n + 1)) % 2 = 0 := by omega
  rw [ite_eq_left hmod]
  omega

-- 👑 The legend is the full conjecture, kept as an open bounty and not attempted here
`,
    },
    bounty: { bronze: 'tier_bronze', silver: 'tier_silver', legend: 'tier_legend' },
    tactics: [
      tactic('decide', 'decide', 'decide'),
      tactic('unfold', 'unfold ', 'unfold'),
      tactic('omega', 'omega', 'omega'),
    ],
  },
  {
    slug: 'goldbach-bounty',
    mode: 'bounty',
    title: {
      zh: '哥德巴赫猜想悬赏',
      en: 'The Goldbach bounty',
    },
    summary: {
      zh: '铜牌验证 4 = 2 + 2、10 = 3 + 7；银牌证明无穷偶数族可拆成两个偶数；传说层是完整猜想。',
      en: 'Bronze verifies 4 = 2 + 2 and 10 = 3 + 7; silver handles an infinite family of even numbers; the legend is the full conjecture.',
    },
    body: {
      zh: '哥德巴赫猜想说：每个不小于 4 的偶数都能写成两个素数之和。4 = 2 + 2、10 = 3 + 7 都是小例子；银牌证明每个偶数都能拆成两个偶数之和，这一步是猜想证明里最基本的骨架。传说层给出完整陈述，至今无人解决。',
      en: 'Goldbach’s conjecture says every even number at least 4 is a sum of two primes. 4 = 2 + 2 and 10 = 3 + 7 are small examples; silver proves every even number splits into two even numbers, the basic skeleton of any proof. The legend states the full conjecture, still open.',
    },
    hint: {
      zh: '铜牌用 decide 让编译器试除 2、3、7；银牌把 2 * (n + 1) 拆成 2 与 2 * n，两个加数都显然为偶数。',
      en: 'Bronze uses decide to trial-divide 2, 3 and 7; silver splits 2 * (n + 1) into 2 and 2 * n, both obviously even.',
    },
    starter: {
      zh: `-- Even n 表示「n 是偶数」：存在某个自然数 k，使 n = 2 * k
def Even (n : Nat) : Prop := ∃ k, n = 2 * k

-- 只用试除法的素数判定：n 是否有 2 .. n-1 之间的因子
def hasProperDivisor (n : Nat) : Nat → Bool
  | 0 => false
  | 1 => false
  | d + 2 => if n % (d + 2) = 0 then true else hasProperDivisor n (d + 1)

def isPrime (n : Nat) : Bool :=
  decide (2 ≤ n) && !hasProperDivisor n (n - 1)

-- 🥉 铜牌：4 = 2 + 2、10 = 3 + 7，且它们都是素数
theorem tier_bronze :
    isPrime 2 = true ∧ isPrime 3 = true ∧ isPrime 7 = true ∧
      4 = 2 + 2 ∧ 10 = 3 + 7 := by
  sorry

-- 🥈 银牌：每个偶数 2 * (n + 1) 都能拆成两个偶数之和
theorem tier_silver (n : Nat) :
    ∃ a b : Nat, 2 * (n + 1) = a + b ∧ Even a ∧ Even b := by
  sorry

-- 👑 传说：每个不小于 4 的偶数都是两个素数之和（哥德巴赫猜想）
theorem tier_legend :
    ∀ n : Nat, 4 ≤ n → Even n →
      ∃ p q : Nat, isPrime p = true ∧ isPrime q = true ∧ n = p + q := by
  sorry
`,
      en: `-- Even n means "n is even": there is a natural number k with n = 2 * k
def Even (n : Nat) : Prop := ∃ k, n = 2 * k

-- Trial-division primality: does n have a factor between 2 and n-1?
def hasProperDivisor (n : Nat) : Nat → Bool
  | 0 => false
  | 1 => false
  | d + 2 => if n % (d + 2) = 0 then true else hasProperDivisor n (d + 1)

def isPrime (n : Nat) : Bool :=
  decide (2 ≤ n) && !hasProperDivisor n (n - 1)

-- 🥉 Bronze: 4 = 2 + 2 and 10 = 3 + 7, with all primes verified
theorem tier_bronze :
    isPrime 2 = true ∧ isPrime 3 = true ∧ isPrime 7 = true ∧
      4 = 2 + 2 ∧ 10 = 3 + 7 := by
  sorry

-- 🥈 Silver: every even 2 * (n + 1) splits into a sum of two even numbers
theorem tier_silver (n : Nat) :
    ∃ a b : Nat, 2 * (n + 1) = a + b ∧ Even a ∧ Even b := by
  sorry

-- 👑 Legend: every even number at least 4 is a sum of two primes (Goldbach)
theorem tier_legend :
    ∀ n : Nat, 4 ≤ n → Even n →
      ∃ p q : Nat, isPrime p = true ∧ isPrime q = true ∧ n = p + q := by
  sorry
`,
    },
    solution: {
      zh: `-- Even n 表示「n 是偶数」：存在某个自然数 k，使 n = 2 * k
def Even (n : Nat) : Prop := ∃ k, n = 2 * k

-- 只用试除法的素数判定：n 是否有 2 .. n-1 之间的因子
def hasProperDivisor (n : Nat) : Nat → Bool
  | 0 => false
  | 1 => false
  | d + 2 => if n % (d + 2) = 0 then true else hasProperDivisor n (d + 1)

def isPrime (n : Nat) : Bool :=
  decide (2 ≤ n) && !hasProperDivisor n (n - 1)

-- 🥉 铜牌：让编译器逐项验证素数与两个分解
theorem tier_bronze :
    isPrime 2 = true ∧ isPrime 3 = true ∧ isPrime 7 = true ∧
      4 = 2 + 2 ∧ 10 = 3 + 7 := by
  decide

-- 🥈 银牌：2 * (n + 1) = 2 + 2 * n，两个加数都是偶数
theorem tier_silver (n : Nat) :
    ∃ a b : Nat, 2 * (n + 1) = a + b ∧ Even a ∧ Even b := by
  refine ⟨2, 2 * n, by omega, ⟨1, rfl⟩, ⟨n, rfl⟩⟩

-- 👑 传说层是完整猜想，作为悬赏保留，标准解法不尝试证明它
`,
      en: `-- Even n means "n is even": there is a natural number k with n = 2 * k
def Even (n : Nat) : Prop := ∃ k, n = 2 * k

-- Trial-division primality: does n have a factor between 2 and n-1?
def hasProperDivisor (n : Nat) : Nat → Bool
  | 0 => false
  | 1 => false
  | d + 2 => if n % (d + 2) = 0 then true else hasProperDivisor n (d + 1)

def isPrime (n : Nat) : Bool :=
  decide (2 ≤ n) && !hasProperDivisor n (n - 1)

-- 🥉 Bronze: let the compiler verify the primes and both decompositions
theorem tier_bronze :
    isPrime 2 = true ∧ isPrime 3 = true ∧ isPrime 7 = true ∧
      4 = 2 + 2 ∧ 10 = 3 + 7 := by
  decide

-- 🥈 Silver: 2 * (n + 1) = 2 + 2 * n, and both addends are even
theorem tier_silver (n : Nat) :
    ∃ a b : Nat, 2 * (n + 1) = a + b ∧ Even a ∧ Even b := by
  refine ⟨2, 2 * n, by omega, ⟨1, rfl⟩, ⟨n, rfl⟩⟩

-- 👑 The legend is the full conjecture, kept as an open bounty and not attempted here
`,
    },
    bounty: { bronze: 'tier_bronze', silver: 'tier_silver', legend: 'tier_legend' },
    tactics: [
      tactic('decide', 'decide', 'decide'),
      tactic('refine', 'refine ', 'refine'),
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
