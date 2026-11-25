/**
 * 趣味数学挑战的唯一数据源。
 *
 * 题目本身是双语内容（标题 / 背景 / 提示 / 代码注释都带 zh 与 en），不拆进 i18n 语言包：
 * 这样 slug 只有一份，新增或修改题目时不会出现两种语言题号漂移。
 *
 * 骨架与解法里的证明代码在中英文之间保持一致，只有「--」注释按语言翻译；
 * `challenges.test.ts` 会剥掉注释后逐题比对，防止两种语言悄悄写成不同的证明。
 *
 * 出招卡（`ChallengeTactic`）不再插入 `'rcases '` 这类半截语法：
 * 每张卡的 `insert` 都是一份完整、可独立编译的 Lean 文件，点击后由视图层
 * 通过 `panel.getCode()` + `panel.setCode()` 智能替换，玩家不敲键盘也能通关。
 *
 * 约束：所有代码只使用 Lean 4.36.0 `Init`，不得引入 Mathlib / Lake / Std。
 */
import type { ChallengeMode } from './exercise';
import type { Locale } from './i18n';

export type LocalizedText = {
  zh: string;
  en: string;
};

export type ChallengeTactic = {
  /** 出招卡上显示的文案（中英文随界面切换）。 */
  label: LocalizedText;
  /** 点击后写入编辑器的完整 Lean 代码（双语注释随语言切换）。 */
  insert: LocalizedText;
  /**
   * 出招方式：
   * - `set-code`：整段替换编辑器代码（本数据源默认使用，保证一次点击就能独立编译）；
   * - `replace-sorry`：只把第一个未注释的 `sorry` 换成 `insert`，
   *   若已经没有 sorry，则替换最后一条定理的证明部分。
   */
  action?: 'replace-sorry' | 'set-code';
  /** 给零基础用户的一句话解释：这张卡在做什么。 */
  description: LocalizedText;
};

export type ChallengeBountySlots = {
  bronze: string;
  silver: string;
  legend: string;
};

/** 真假审判庭的两套独立立场模板，避免把两个带 sorry 的候选塞进同一块编辑器。 */
export type ChallengeVerdictBranches = {
  /** 「我判它为真」：尝试证明的模板。 */
  trueStarter: LocalizedText;
  /** 「我判它为假」：构造反例的模板。 */
  falseStarter: LocalizedText;
};

export type Challenge = {
  /** URL 片段，同时用于草稿 key，必须为小写 ASCII 短横线组合。 */
  slug: string;
  /** 四大主题区对应四种判题模式。 */
  mode: ChallengeMode;
  title: LocalizedText;
  /** 卡片与 meta description 用的一句话说明。 */
  summary: LocalizedText;
  /** 面向非程序员的通俗题干背景；真假审判庭的题干严禁剧透真假。 */
  body: LocalizedText;
  hint: LocalizedText;
  /** 预填到编辑器里的骨架代码，带逐步讲解注释。 */
  starter: LocalizedText;
  /** 标准参考解法，必须能在 Init 环境下零错误通过。 */
  solution: LocalizedText;
  /** 出招卡：每张都是完整可编译代码或可智能替换的证明片段。 */
  tactics: readonly ChallengeTactic[];
  /** 真假审判庭：正确候选与错误候选的定理名。 */
  verdict?: { correct: string; wrong: string };
  /** 真假审判庭：两个独立立场模板。 */
  verdictBranches?: ChallengeVerdictBranches;
  /** 契约漏洞猎人：必须原样保留的核心结论片段。 */
  requiredConclusion?: string;
  /** 悬赏厅：三层槽位的定理名。 */
  bounty?: ChallengeBountySlots;
};

const text = (zh: string, en: string): LocalizedText => ({ zh, en });

/** 出招卡：insert 默认是一份完整文件，点击后整段载入。 */
const card = (
  label: LocalizedText,
  description: LocalizedText,
  code: LocalizedText | string,
): ChallengeTactic => ({
  label,
  insert: typeof code === 'string' ? text(code, code) : code,
  action: 'set-code',
  description,
});

const evenDef = text(
  '-- Even n 表示「n 是偶数」：存在某个自然数 k，使 n = 2 * k\ndef Even (n : Nat) : Prop := ∃ k, n = 2 * k',
  '-- Even n means "n is even": there is a natural number k with n = 2 * k\ndef Even (n : Nat) : Prop := ∃ k, n = 2 * k',
);

const EVEN_DEF = 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k';

const MOD_EVEN_DEF = 'def Even (n : Nat) : Prop := n % 2 = 0';
const MOD_ODD_DEF = 'def Odd (n : Nat) : Prop := n % 2 = 1';
const IS_EVEN_DEF = 'def isEven (n : Nat) : Bool := n % 2 == 0';

const DOUBLE_DEF = 'def double : Nat → Nat\n  | 0 => 0\n  | n + 1 => double n + 2';

const EVEN_PLUS_EVEN_HEADER =
  'theorem even_plus_even (a b : Nat) (ha : Even a) (hb : Even b) :\n    Even (a + b)';

const DOUBLE_HEADER = 'theorem double_eq_two_mul (n : Nat) : double n = 2 * n';

const NAT_SUB_CONCLUSION = '(counter_a - counter_b) + counter_b ≠ counter_a';

const EVEN_SUM_CONCLUSION =
  'isEven (counter_a + counter_b) = true ∧ (isEven counter_a = false ∨ isEven counter_b = false)';

/** 自然数减法反例：完整文件，玩家只改两个自然数或点出招卡。 */
const natSubCounter = (a: number, b: number): LocalizedText =>
  text(
    `-- 反例：a = ${a}，b = ${b}
-- 因为 b > a，a - b 被截断成 0，所以 (a - b) + b = b ≠ a
abbrev counter_a : Nat := ${a}
abbrev counter_b : Nat := ${b}

-- 裁判机自动验算你的反例（无需修改下方代码）：
theorem verdict_false : (counter_a - counter_b) + counter_b ≠ counter_a := by
  decide
`,
    `-- Counterexample: a = ${a}, b = ${b}
-- Since b > a, a - b truncates to 0, so (a - b) + b = b ≠ a
abbrev counter_a : Nat := ${a}
abbrev counter_b : Nat := ${b}

-- The judge checks your counterexample automatically (do not edit below):
theorem verdict_false : (counter_a - counter_b) + counter_b ≠ counter_a := by
  decide
`,
  );

/** 偶数和反例：完整文件，两个加数都填奇数即可翻车。 */
const evenSumCounter = (a: number, b: number): LocalizedText =>
  text(
    `-- 反例：a = ${a}，b = ${b}
-- 两个奇数相加是偶数，但每个加数本身都不是偶数
${IS_EVEN_DEF}

abbrev counter_a : Nat := ${a}
abbrev counter_b : Nat := ${b}

-- 裁判机自动验算你的反例（无需修改下方代码）：
theorem verdict_false :
    isEven (counter_a + counter_b) = true ∧
      (isEven counter_a = false ∨ isEven counter_b = false) := by
  decide
`,
    `-- Counterexample: a = ${a}, b = ${b}
-- Two odd numbers add up to an even number, but neither addend is even
${IS_EVEN_DEF}

abbrev counter_a : Nat := ${a}
abbrev counter_b : Nat := ${b}

-- The judge checks your counterexample automatically (do not edit below):
theorem verdict_false :
    isEven (counter_a + counter_b) = true ∧
      (isEven counter_a = false ∨ isEven counter_b = false) := by
  decide
`,
  );

const collatzDefs = text(
  `-- 考拉兹过程：偶数折半，奇数乘 3 加 1
def collatzStep (n : Nat) : Nat :=
  if n % 2 = 0 then n / 2 else 3 * n + 1

-- 从 n 出发，走 k 步是否到达 1
def collatzReach (n : Nat) : Nat → Prop
  | 0 => n = 1
  | k + 1 => collatzReach (collatzStep n) k`,
  `-- Collatz step: halve evens, map odds to 3n + 1
def collatzStep (n : Nat) : Nat :=
  if n % 2 = 0 then n / 2 else 3 * n + 1

-- Starting from n, does k steps reach 1?
def collatzReach (n : Nat) : Nat → Prop
  | 0 => n = 1
  | k + 1 => collatzReach (collatzStep n) k`,
);

const COLLATZ_BRONZE = `theorem tier_bronze : collatzStep (collatzStep 6) = 10 := by
  decide`;

const COLLATZ_SILVER = `theorem tier_silver (n : Nat) : collatzStep (2 * (n + 1)) = n + 1 := by
  unfold collatzStep
  have hmod : (2 * (n + 1)) % 2 = 0 := by omega
  rw [ite_eq_left hmod]
  omega`;

const goldbachDefs = text(
  `-- Even n 表示「n 是偶数」：存在某个自然数 k，使 n = 2 * k
def Even (n : Nat) : Prop := ∃ k, n = 2 * k

-- 只用试除法的素数判定：n 是否有 2 .. n-1 之间的因子
def hasProperDivisor (n : Nat) : Nat → Bool
  | 0 => false
  | 1 => false
  | d + 2 => if n % (d + 2) = 0 then true else hasProperDivisor n (d + 1)

def isPrime (n : Nat) : Bool :=
  decide (2 ≤ n) && !hasProperDivisor n (n - 1)`,
  `-- Even n means "n is even": there is a natural number k with n = 2 * k
def Even (n : Nat) : Prop := ∃ k, n = 2 * k

-- Trial-division primality: does n have a factor between 2 and n-1?
def hasProperDivisor (n : Nat) : Nat → Bool
  | 0 => false
  | 1 => false
  | d + 2 => if n % (d + 2) = 0 then true else hasProperDivisor n (d + 1)

def isPrime (n : Nat) : Bool :=
  decide (2 ≤ n) && !hasProperDivisor n (n - 1)`,
);

const localizedJoin = (...parts: Array<LocalizedText | string>): LocalizedText =>
  text(
    `${parts.map((part) => (typeof part === 'string' ? part : part.zh)).join('\n\n')}\n`,
    `${parts.map((part) => (typeof part === 'string' ? part : part.en)).join('\n\n')}\n`,
  );

const GOLDBACH_BRONZE = `theorem tier_bronze :
    isPrime 2 = true ∧ isPrime 3 = true ∧ isPrime 7 = true ∧
      4 = 2 + 2 ∧ 10 = 3 + 7 := by
  decide`;

const GOLDBACH_SILVER = `theorem tier_silver (n : Nat) :
    ∃ a b : Nat, 2 * (n + 1) = a + b ∧ Even a ∧ Even b := by
  refine ⟨2, 2 * n, by omega, ⟨1, rfl⟩, ⟨n, rfl⟩⟩`;

const VERDICT_NEUTRAL_STARTER = text(
  `-- 先在上方选择你的立场，再动手：
--   ⚖️ 我判它为真 → 载入「尝试证明」模板
--   🔨 我判它为假 → 载入「举反例」模板`,
  `-- Pick a stance above first:
--   ⚖️ I judge it TRUE → load the "try to prove it" template
--   🔨 I judge it FALSE → load the "build a counterexample" template`,
);

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
      zh: '先拆开两个「存在某个 k」假设，得到 a = 2x、b = 2y；新的 k 取 x + y。三张出招卡分别用 grind、纯 rw 和项式构造完成同一件事。',
      en: 'Unpack both “there exists some k” assumptions to get a = 2x and b = 2y; the new k is x + y. The three cards finish it with grind, pure rw, or a proof term.',
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
      card(
        text('⚡ 自动流：grind 收尾', '⚡ Automation: grind closure'),
        text(
          '拆开两个偶数后，把剩下的乘法等式整段交给 grind。',
          'Unpack both evens, then hand the remaining multiplication equality to grind.',
        ),
        `${EVEN_DEF}

${EVEN_PLUS_EVEN_HEADER} := by
  rcases ha with ⟨x, rfl⟩
  rcases hb with ⟨y, rfl⟩
  exact ⟨x + y, by grind⟩
`,
      ),
      card(
        text('🛠️ 手工流：只写 rw', '🛠️ Handcrafted: rw only'),
        text(
          '不用自动化，只用一条乘法分配律 rw 把等式改写整齐。',
          'No automation: a single distributivity rewrite tidies the equality.',
        ),
        `${EVEN_DEF}

${EVEN_PLUS_EVEN_HEADER} := by
  rcases ha with ⟨x, rfl⟩
  rcases hb with ⟨y, rfl⟩
  exact ⟨x + y, by rw [Nat.mul_add]⟩
`,
      ),
      card(
        text('λ 极客流：项式构造', 'λ Type Theorist: proof term'),
        text(
          '不写 by，直接用 Exists.elim 交出证明项，点亮类型论极客勋章。',
          'No by block: build the proof term directly with Exists.elim.',
        ),
        `${EVEN_DEF}

${EVEN_PLUS_EVEN_HEADER} :=
  Exists.elim ha fun x hx =>
    Exists.elim hb fun y hy =>
      ⟨x + y, by rw [hx, hy, Nat.mul_add]⟩
`,
      ),
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
      zh: '`Nat.add_comm a b` 的类型正是 `a + b = b + a`。出招卡分别展示 omega、rw 和直接给出证明项三种写法。',
      en: '`Nat.add_comm a b` has exactly the type `a + b = b + a`. The cards show omega, rw, and a direct proof term.',
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
      card(
        text('⚡ 自动流：omega', '⚡ Automation: omega'),
        text(
          '不点名任何引理，让 omega 自己看出两边相等。',
          'Do not name a lemma; let omega notice both sides are equal.',
        ),
        `theorem add_two_swap (a : Nat) : a + 2 = 2 + a := by
  omega
`,
      ),
      card(
        text('🛠️ 手工流：rw [Nat.add_comm]', '🛠️ Handcrafted: rw [Nat.add_comm]'),
        text(
          '明确调用交换律，把左边改写成右边。',
          'Call commutativity explicitly to rewrite the left side into the right one.',
        ),
        `theorem add_two_swap (a : Nat) : a + 2 = 2 + a := by
  rw [Nat.add_comm]
`,
      ),
      card(
        text('λ 极客流：直接给证明项', 'λ Type Theorist: direct term'),
        text(
          '把 Nat.add_comm 的实例本身当作证明，完全不用 by。',
          'Use the Nat.add_comm instance itself as the proof, with no by block.',
        ),
        `theorem add_two_swap (a : Nat) : a + 2 = 2 + a :=
  Nat.add_comm a 2
`,
      ),
    ],
  },
  {
    slug: 'not-even-and-odd',
    mode: 'classic',
    title: { zh: '一个数能同时是奇数和偶数吗？', en: 'Can a number be odd and even at once?' },
    summary: {
      zh: '用余数定义奇偶：同一个数除以 2 不可能既余 0 又余 1。',
      en: 'Define parity by remainders: one number cannot leave both remainder 0 and remainder 1 modulo 2.',
    },
    body: {
      zh: '一个整数要么是奇数，要么是偶数，不可能两边都占。这个「显然」的事实，恰好是练习反证法的好例子：先假设它同时成立，再让 Lean 发现矛盾。',
      en: 'An integer is either odd or even, never both. This “obvious” fact is a perfect exercise in proof by contradiction: assume both hold, then let Lean expose the contradiction.',
    },
    hint: {
      zh: '先用 `intro` 拿进「同时成立」的假设，再用 `rcases` 拆成 n % 2 = 0 与 n % 2 = 1；把前者代进后者就得到 0 = 1。',
      en: 'Use `intro` to bring the “both hold” assumption into scope, `rcases` it into n % 2 = 0 and n % 2 = 1, then substitute the first into the second to get 0 = 1.',
    },
    starter: {
      zh: `-- Even n 表示「n 除以 2 余 0」
def Even (n : Nat) : Prop := n % 2 = 0
-- Odd n 表示「n 除以 2 余 1」
def Odd (n : Nat) : Prop := n % 2 = 1

-- ¬ P 读作「P 不成立」：先假设 P，再推出矛盾
-- Even n ∧ Odd n 读作「n 既是偶数又是奇数」
theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  -- 第 1 步：intro h，把「假设它同时成立」拿进来
  -- 第 2 步：rcases h，拆出 n % 2 = 0 与 n % 2 = 1
  -- 第 3 步：同一个数除以 2 不可能同时余 0 和余 1
  sorry
`,
      en: `-- Even n means "n leaves remainder 0 modulo 2"
def Even (n : Nat) : Prop := n % 2 = 0
-- Odd n means "n leaves remainder 1 modulo 2"
def Odd (n : Nat) : Prop := n % 2 = 1

-- ¬ P reads "P does not hold": assume P, then derive a contradiction
-- Even n ∧ Odd n reads "n is both even and odd"
theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  -- Step 1: intro h, bringing the "both hold" assumption into scope
  -- Step 2: rcases h into n % 2 = 0 and n % 2 = 1
  -- Step 3: one number cannot leave both remainder 0 and remainder 1
  sorry
`,
    },
    solution: {
      zh: `-- Even n 表示「n 除以 2 余 0」
def Even (n : Nat) : Prop := n % 2 = 0
-- Odd n 表示「n 除以 2 余 1」
def Odd (n : Nat) : Prop := n % 2 = 1

theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  -- 假设「n 同时是偶数和奇数」
  intro h
  -- 拆成 n % 2 = 0 与 n % 2 = 1
  rcases h with ⟨he, ho⟩
  simp only [Even, Odd] at he ho
  -- 把 he 代进 ho，得到 0 = 1
  rw [he] at ho
  -- 0 不可能等于 1
  exact Nat.succ_ne_zero 0 ho.symm
`,
      en: `-- Even n means "n leaves remainder 0 modulo 2"
def Even (n : Nat) : Prop := n % 2 = 0
-- Odd n means "n leaves remainder 1 modulo 2"
def Odd (n : Nat) : Prop := n % 2 = 1

theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  -- Assume "n is both even and odd"
  intro h
  -- Split it into n % 2 = 0 and n % 2 = 1
  rcases h with ⟨he, ho⟩
  simp only [Even, Odd] at he ho
  -- Substitute he into ho to get 0 = 1
  rw [he] at ho
  -- 0 cannot equal 1
  exact Nat.succ_ne_zero 0 ho.symm
`,
    },
    tactics: [
      card(
        text('🛠️ 手工流：代换后收尾', '🛠️ Handcrafted: rewrite & close'),
        text(
          '把余 0 的等式代进余 1 的等式，再用 0 ≠ 1 结束。',
          'Substitute the remainder-0 equation into the remainder-1 equation, then use 0 ≠ 1.',
        ),
        `${MOD_EVEN_DEF}
${MOD_ODD_DEF}

theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  intro h
  rcases h with ⟨he, ho⟩
  simp only [Even, Odd] at he ho
  rw [he] at ho
  exact Nat.succ_ne_zero 0 ho.symm
`,
      ),
      card(
        text('⚡ 自动流：omega 判矛盾', '⚡ Automation: omega contradiction'),
        text(
          '同样代换出 0 = 1，让 omega 直接说「这不可能」。',
          'Substitute to 0 = 1 exactly the same way, then let omega declare it impossible.',
        ),
        `${MOD_EVEN_DEF}
${MOD_ODD_DEF}

theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by
  intro h
  rcases h with ⟨he, ho⟩
  simp only [Even, Odd] at he ho
  rw [he] at ho
  omega
`,
      ),
      card(
        text('λ 极客流：一行项式', 'λ Type Theorist: one-line term'),
        text(
          '用函数直接消费「同时成立」的证据，全程没有 by。',
          'Consume the “both hold” evidence with a function; there is no by at all.',
        ),
        `${MOD_EVEN_DEF}
${MOD_ODD_DEF}

theorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) :=
  fun ⟨he, ho⟩ =>
    Nat.succ_ne_zero 0
      (Eq.trans (Eq.symm (show n % 2 = 0 from he)) (show n % 2 = 1 from ho)).symm
`,
      ),
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
      zh: '对 n 做归纳。n = 0 时两边都是 0；n + 1 时先展开一步得到 `double n + 2`，再用归纳假设替换 `double n`。',
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
      card(
        text('⚡ 自动流：归纳 + omega', '⚡ Automation: induction + omega'),
        text(
          '标准归纳：起点 rfl，递推里展开一步再让 omega 收尾。',
          'Standard induction: rfl at the base, unfold one step and let omega finish the successor case.',
        ),
        `${DOUBLE_DEF}

${DOUBLE_HEADER} := by
  induction n with
  | zero => rfl
  | succ n ih =>
    have h : double (n + 1) = double n + 2 := rfl
    rw [h, ih]
    omega
`,
      ),
      card(
        text('🛠️ 手工流：只用 rw', '🛠️ Handcrafted: rw only'),
        text(
          '不调用自动化，用乘法分配律把 2 * (n + 1) 改写整齐。',
          'No automation: use distributivity to tidy 2 * (n + 1).',
        ),
        `${DOUBLE_DEF}

${DOUBLE_HEADER} := by
  induction n with
  | zero => rfl
  | succ n ih =>
    have h : double (n + 1) = double n + 2 := rfl
    rw [h, ih, Nat.mul_succ]
`,
      ),
      card(
        text('λ 极客流：Nat.rec 项式', 'λ Type Theorist: Nat.rec term'),
        text(
          '用自然数递归器直接写出证明项，不写 induction。',
          'Write the proof term with the natural-number recursor instead of induction.',
        ),
        `${DOUBLE_DEF}

${DOUBLE_HEADER} :=
  @Nat.rec (fun n => double n = 2 * n)
    rfl
    (fun n ih => by
      rw [show double (n + 1) = double n + 2 from rfl, ih, Nat.mul_succ])
    n
`,
      ),
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
      zh: '先减后加，看似一定回到原点；但自然数没有负数。请选择立场，用证明或反例定案。',
      en: 'Subtract then add: it looks like you always return to the start. But natural numbers have no negatives. Pick a stance and settle it with a proof or a counterexample.',
    },
    body: {
      zh: '在整数里，先减后加必然回到原点；可自然数只有 0 和正数，规则未必照搬。你的直觉站哪一边？题干不告诉你答案——先选「我判它为真」试着证明，或选「我判它为假」亲手找一个翻车的例子。',
      en: 'With integers, subtracting then adding always returns to the start; but natural numbers start at 0, so the rule may not carry over unchanged. Which way does your intuition lean? The prompt does not reveal the answer—choose “true” and try to prove it, or choose “false” and hunt for a counterexample.',
    },
    hint: {
      zh: '如果判假：先让 b 比 a 大，看看 a - b 会变成什么。反例分支里只改两个 `abbrev` 的数字即可，上面的出招卡能直接填好。',
      en: 'If you judge it false: make b larger than a and watch what a - b becomes. In the counterexample branch you only edit two `abbrev` numbers; the cards above can fill them for you.',
    },
    starter: VERDICT_NEUTRAL_STARTER,
    solution: natSubCounter(0, 1),
    verdict: { correct: 'verdict_false', wrong: 'verdict_true' },
    verdictBranches: {
      trueStarter: text(
        `-- 自然数减法在「不够减」时会截断到 0
-- 你判它为真：尝试证明它对所有自然数都成立
theorem verdict_true (a b : Nat) : (a - b) + b = a := by
  sorry
`,
        `-- Natural subtraction truncates at 0 when there is "not enough to subtract"
-- You judge it TRUE: try to prove it for all natural numbers
theorem verdict_true (a b : Nat) : (a - b) + b = a := by
  sorry
`,
      ),
      falseStarter: text(
        `-- 填入你认为能让 (a - b) + b = a 翻车的两个自然数：
abbrev counter_a : Nat := 5
abbrev counter_b : Nat := 3

-- 裁判机自动验算你的反例（无需修改下方代码）：
theorem verdict_false : (counter_a - counter_b) + counter_b ≠ counter_a := by
  decide
`,
        `-- Fill in two natural numbers that you think break (a - b) + b = a:
abbrev counter_a : Nat := 5
abbrev counter_b : Nat := 3

-- The judge checks your counterexample automatically (do not edit below):
theorem verdict_false : (counter_a - counter_b) + counter_b ≠ counter_a := by
  decide
`,
      ),
    },
    requiredConclusion: NAT_SUB_CONCLUSION,
    tactics: [
      card(
        text('🃏 填入反例 a=0, b=1', '🃏 Counterexample: a=0, b=1'),
        text(
          '0 - 1 被截断成 0，于是左边是 1、右边是 0，反例成立。',
          '0 - 1 truncates to 0, so the left side is 1 while the right side is 0.',
        ),
        natSubCounter(0, 1),
      ),
      card(
        text('🃏 再试 a=1, b=2', '🃏 Counterexample: a=1, b=2'),
        text(
          '换一组更大的数，同样因为 b > a 而截断，反例依然成立。',
          'Try a larger pair; b > a still triggers truncation, so the counterexample holds.',
        ),
        natSubCounter(1, 2),
      ),
      card(
        text('🃏 再试 a=7, b=9', '🃏 Counterexample: a=7, b=9'),
        text(
          '把两个数字拉大，验证反例不是偶然。',
          'Scale the numbers up to check the counterexample is not a fluke.',
        ),
        natSubCounter(7, 9),
      ),
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
      zh: '和是偶数，加数就一定都是偶数吗？先别急着下结论，选立场后用证明或反例定案。',
      en: 'If a sum is even, must every addend be even? Do not jump to a conclusion: pick a stance, then settle it with a proof or a counterexample.',
    },
    body: {
      zh: '4 + 6 = 10 是偶数，两个加数也都是偶数；这很容易让人以为「和偶 ⇒ 加数偶」。但直觉给出的规律，未必覆盖所有组合。题干不剧透真假——判真就尝试证明，判假就找出让结论翻车的两个数。',
      en: '4 + 6 = 10 is even, and both addends are even; that makes “even sum ⇒ even addends” feel obvious. But a rule suggested by intuition need not cover every combination. The prompt does not spoil the truth value—judge it true and try to prove it, or judge it false and find two numbers that break it.',
    },
    hint: {
      zh: '如果判假：两个奇数相加会得到什么？反例分支里只改两个 `abbrev` 的数字，`decide` 会自动验算。',
      en: 'If you judge it false: what do two odd numbers add up to? In the counterexample branch you only edit two `abbrev` numbers, and `decide` verifies them automatically.',
    },
    starter: VERDICT_NEUTRAL_STARTER,
    solution: evenSumCounter(1, 1),
    verdict: { correct: 'verdict_false', wrong: 'verdict_true' },
    verdictBranches: {
      trueStarter: text(
        `-- isEven n 用计算的方式判断 n 是否为偶数
${IS_EVEN_DEF}

-- 你判它为真：两个加数的和是偶数，是否足以推出两个加数都是偶数？
theorem verdict_true (a b : Nat) :
    isEven (a + b) = true → isEven a = true ∧ isEven b = true := by
  sorry
`,
        `-- isEven n decides whether n is even by computation
${IS_EVEN_DEF}

-- You judge it TRUE: does an even sum force both addends to be even?
theorem verdict_true (a b : Nat) :
    isEven (a + b) = true → isEven a = true ∧ isEven b = true := by
  sorry
`,
      ),
      falseStarter: text(
        `-- isEven n 用计算的方式判断 n 是否为偶数
${IS_EVEN_DEF}

-- 填入你怀疑的两个加数：它们要满足「和是偶数，但至少一个不是偶数」
abbrev counter_a : Nat := 2
abbrev counter_b : Nat := 2

-- 裁判机自动验算你的反例（无需修改下方代码）：
theorem verdict_false :
    isEven (counter_a + counter_b) = true ∧
      (isEven counter_a = false ∨ isEven counter_b = false) := by
  decide
`,
        `-- isEven n decides whether n is even by computation
${IS_EVEN_DEF}

-- Fill in two addends that make the sum even while at least one is not even:
abbrev counter_a : Nat := 2
abbrev counter_b : Nat := 2

-- The judge checks your counterexample automatically (do not edit below):
theorem verdict_false :
    isEven (counter_a + counter_b) = true ∧
      (isEven counter_a = false ∨ isEven counter_b = false) := by
  decide
`,
      ),
    },
    requiredConclusion: EVEN_SUM_CONCLUSION,
    tactics: [
      card(
        text('🃏 填入反例 a=1, b=1', '🃏 Counterexample: a=1, b=1'),
        text(
          '1 + 1 = 2 是偶数，但两个加数都是奇数。',
          '1 + 1 = 2 is even, yet both addends are odd.',
        ),
        evenSumCounter(1, 1),
      ),
      card(
        text('🃏 再试 a=3, b=3', '🃏 Counterexample: a=3, b=3'),
        text(
          '换一对奇数，和仍然是偶数，反例依旧成立。',
          'Another pair of odd numbers still sums to an even number.',
        ),
        evenSumCounter(3, 3),
      ),
      card(
        text('🃏 再试 a=5, b=7', '🃏 Counterexample: a=5, b=7'),
        text(
          '把数字拉大，验证反例不是偶然。',
          'Scale the numbers up to check the counterexample is not a fluke.',
        ),
        evenSumCounter(5, 7),
      ),
    ],
  },
  {
    slug: 'double-negation',
    mode: 'verdict',
    title: {
      zh: '否定两次，命题会变回原样吗？',
      en: 'Does negating twice restore the original statement?',
    },
    summary: {
      zh: '「不成立的不成立」到底等于成立，还是比成立更弱？先选立场，再让 Lean 给出裁决。',
      en: 'Does “not not true” mean true, or something weaker? Pick a stance and let Lean decide.',
    },
    body: {
      zh: '生活中「我不是不同意」往往不等于「我同意」，语气、语境都会削弱双重否定。但逻辑里的「不成立的不成立」只关心真假本身。题干不告诉你是真命题还是假命题：判真就尝试一行证明，判假就去找一个能推翻它的命题。',
      en: 'In everyday speech, “I don’t disagree” is weaker than “I agree”—tone and context water down the double negative. Logic, however, only cares about truth and falsity. The prompt does not say whether this is true: judge it true and try a one-line proof, or judge it false and hunt for a proposition that breaks it.',
    },
    hint: {
      zh: '如果判真：把「P 不成立」当作新假设，它会直接和已知的 P 冲突。三张出招卡分别展示分步、项式和自动写法。',
      en: 'If you judge it true: treat “P does not hold” as a new assumption; it immediately clashes with the known P. The three cards show a step-by-step proof, a term, and an automatic proof.',
    },
    starter: VERDICT_NEUTRAL_STARTER,
    solution: text(
      `-- 判真：P 成立时，「P 不成立」会直接与 h 冲突
-- 把「P 不成立」拿进来，它其实是一个从 P 推出矛盾的函数
theorem verdict_true (P : Prop) (h : P) : ¬¬P := by
  intro hn
  exact hn h
`,
      `-- Judged true: when P holds, “P does not hold” clashes directly with h
-- Bring in "P does not hold"; it is a function from P to a contradiction
theorem verdict_true (P : Prop) (h : P) : ¬¬P := by
  intro hn
  exact hn h
`,
    ),
    verdict: { correct: 'verdict_true', wrong: 'verdict_false' },
    verdictBranches: {
      trueStarter: text(
        `-- 你判它为真：只要 P 成立，说「P 不成立」本身就不成立
theorem verdict_true (P : Prop) (h : P) : ¬¬P := by
  sorry
`,
        `-- You judge it TRUE: if P holds, saying "P does not hold" is itself impossible
theorem verdict_true (P : Prop) (h : P) : ¬¬P := by
  sorry
`,
      ),
      falseStarter: text(
        `-- 你判它为假：试着找出一个命题 P，使「否定两次」成立、但 P 本身不成立
-- 如果找不到，就切回「⚖️ 我判它为真」
theorem verdict_false : ∃ P : Prop, ¬¬P ∧ ¬P := by
  sorry
`,
        `-- You judge it FALSE: find a proposition P where double negation holds but P fails
-- If you cannot find one, switch back to "⚖️ I judge it TRUE"
theorem verdict_false : ∃ P : Prop, ¬¬P ∧ ¬P := by
  sorry
`,
      ),
    },
    requiredConclusion: '(P : Prop) (h : P) : ¬¬P',
    tactics: [
      card(
        text('🛠️ 分步流：intro + exact', '🛠️ Handcrafted: intro + exact'),
        text(
          '先把「P 不成立」拿进来，再把手里的 P 丢给它。',
          'Bring in “P does not hold”, then hand it the known P.',
        ),
        text(
          `-- 判真：P 成立时，「P 不成立」会直接与 h 冲突
theorem verdict_true (P : Prop) (h : P) : ¬¬P := by
  intro hn
  exact hn h
`,
          `-- Judged true: when P holds, "P does not hold" clashes directly with h
theorem verdict_true (P : Prop) (h : P) : ¬¬P := by
  intro hn
  exact hn h
`,
        ),
      ),
      card(
        text('λ 极客流：一行函数', 'λ Type Theorist: one-line function'),
        text(
          '整条证明就是一个把 h 交给否定假设的函数。',
          'The whole proof is a function that hands h to the negated assumption.',
        ),
        `theorem verdict_true (P : Prop) (h : P) : ¬¬P :=
  fun hn => hn h
`,
      ),
      card(
        text('⚡ 自动流：grind', '⚡ Automation: grind'),
        text(
          '不解释步骤，让 grind 自己发现两条假设互相矛盾。',
          'Skip the steps and let grind discover the contradiction.',
        ),
        `theorem verdict_true (P : Prop) (h : P) : ¬¬P := by
  grind
`,
      ),
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
      zh: '先补 `h : lo ≤ hi`，否则 lo = 5、hi = 1 时结论直接为假；再检查两个 if 分支是否分别返回 lo 和 hi。出招卡会直接载入修好的完整文件。',
      en: 'Add `h : lo ≤ hi` first, otherwise the claim is false when lo = 5 and hi = 1; then check that the two if branches return lo and hi respectively. The cards load a complete fixed file.',
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
      card(
        text('🔧 修分支 + 补前提', '🔧 Fix branches + add premise'),
        text(
          '把两个 if 分支换回 lo / hi，并补上 lo ≤ hi 的前提。',
          'Swap the two if branches back to lo / hi and add the lo ≤ hi premise.',
        ),
        `def clamp (lo hi x : Nat) : Nat :=
  if x < lo then lo else if hi < x then hi else x

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
      ),
      card(
        text('🩹 用 split 拆 if', '🩹 Handcrafted: split branches'),
        text(
          '展开 clamp 后让 split 自动分成三段，再分别处理。',
          'Unfold clamp and let split produce the three cases, then handle each.',
        ),
        `def clamp (lo hi x : Nat) : Nat :=
  if x < lo then lo else if hi < x then hi else x

theorem clamp_in_range (lo hi x : Nat) (h : lo ≤ hi) :
    lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi := by
  unfold clamp
  split
  · exact ⟨Nat.le_refl lo, h⟩
  · split
    · exact ⟨h, Nat.le_refl hi⟩
    · omega
`,
      ),
      card(
        text('⚡ 自动流：simp 拆完再 omega', '⚡ Automation: simp + omega'),
        text(
          '用 simp 配合分支假设展开目标，最后交给 omega。',
          'Use simp with the branch hypotheses to unfold the goal, then finish with omega.',
        ),
        `def clamp (lo hi x : Nat) : Nat :=
  if x < lo then lo else if hi < x then hi else x

theorem clamp_in_range (lo hi x : Nat) (h : lo ≤ hi) :
    lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi := by
  unfold clamp
  by_cases h1 : x < lo
  · simp [h1, h]
  · by_cases h2 : hi < x
    · simp [h1, h2, h]
    · simp [h1, h2]
      omega
`,
      ),
    ],
  },
  {
    slug: 'budget-withdraw',
    mode: 'bugfix',
    title: {
      zh: '修复账户扣款的余额守恒漏洞',
      en: 'Fix the balance-conservation hole in account withdrawal',
    },
    summary: {
      zh: 'withdraw 声称扣完再加回一定等于原余额，但它既把减法写成了加法，又漏掉了 amount ≤ balance 的前提。',
      en: 'withdraw claims withdrawing and adding back restores the balance, yet it adds instead of subtracting and omits amount ≤ balance.',
    },
    body: {
      zh: '数字钱包的扣款函数本来应该在余额充足时返回 balance - amount，却被粗心写成了 balance + amount（越扣钱越多！）。更隐蔽的是，定理本身也没有要求 amount ≤ balance，自然数透支截断到 0 后照样守恒不了。像排查线上故障一样：修好扣款公式、补上前提，同时保持核心守恒结论不变。',
      en: 'A wallet withdrawal function should return balance - amount when funds are sufficient, but a bug turned minus into plus (free money!). Worse, the theorem omits the premise amount ≤ balance, so natural-number truncation breaks conservation when overdrawing. Patch the formula and add the missing premise while keeping the core conservation equation intact.',
    },
    hint: {
      zh: '先把 `withdraw` 分支里的 `balance + amount` 改回 `balance - amount`，再给定理参数加上 `(h : amount ≤ balance)`；展开 `withdraw` 后用 `ite_eq_left h` 与 `Nat.sub_add_cancel h`（或 `omega`）收尾。',
      en: 'Change `balance + amount` back to `balance - amount` in `withdraw`, and add `(h : amount ≤ balance)` to the theorem; unfold `withdraw` and close with `ite_eq_left h` plus `Nat.sub_add_cancel h` (or `omega`).',
    },
    starter: {
      zh: `-- 钱包扣款：当余额够扣时本应扣减 amount，但下面错写成了加法
-- 漏洞：1) if 分支错写成 balance + amount  2) 定理漏掉了 (h : amount ≤ balance) 前提
def withdraw (balance amount : Nat) : Nat :=
  if amount ≤ balance then balance + amount else balance

-- 目标：扣款后加回 amount 仍然等于原余额（请保留核心等式结论）
theorem withdraw_conserves (balance amount : Nat) :
    withdraw balance amount + amount = balance := by
  sorry
`,
      en: `-- Wallet withdrawal: when funds cover amount it should subtract, not add
-- Holes: 1) the if branch adds instead of subtracting  2) the theorem omits (h : amount ≤ balance)
def withdraw (balance amount : Nat) : Nat :=
  if amount ≤ balance then balance + amount else balance

-- Goal: withdrawing amount and adding it back equals the original balance
theorem withdraw_conserves (balance amount : Nat) :
    withdraw balance amount + amount = balance := by
  sorry
`,
    },
    solution: {
      zh: `-- 修复实现：余额充足时返回 balance - amount
def withdraw (balance amount : Nat) : Nat :=
  if amount ≤ balance then balance - amount else balance

-- 补上前提 (h : amount ≤ balance)，核心结论保持不变
theorem withdraw_conserves (balance amount : Nat) (h : amount ≤ balance) :
    withdraw balance amount + amount = balance := by
  unfold withdraw
  rw [ite_eq_left h]
  omega
`,
      en: `-- Fix the formula: return balance - amount when funds suffice
def withdraw (balance amount : Nat) : Nat :=
  if amount ≤ balance then balance - amount else balance

-- Add the missing premise (h : amount ≤ balance) while keeping the core equation unchanged
theorem withdraw_conserves (balance amount : Nat) (h : amount ≤ balance) :
    withdraw balance amount + amount = balance := by
  unfold withdraw
  rw [ite_eq_left h]
  omega
`,
    },
    requiredConclusion: 'withdraw balance amount + amount = balance',
    tactics: [
      card(
        text('⚡ 自动流：展开 + omega', '⚡ Automation: unfold + omega'),
        text(
          '先把减法与前提修好，展开 withdraw 并代入条件 h 后交给 omega 收尾。',
          'Fix the subtraction and premise, unfold withdraw with h, and let omega close it.',
        ),
        `def withdraw (balance amount : Nat) : Nat :=
  if amount ≤ balance then balance - amount else balance

theorem withdraw_conserves (balance amount : Nat) (h : amount ≤ balance) :
    withdraw balance amount + amount = balance := by
  unfold withdraw
  rw [ite_eq_left h]
  omega
`,
      ),
      card(
        text('🛠️ 手工流：split 分支', '🛠️ Handcrafted: split branches'),
        text(
          '不用自动化：用 split 拆开 if，再用 Nat.sub_add_cancel 和 contradiction 分别收尾。',
          'No automation: split the if branch, then finish with Nat.sub_add_cancel and contradiction.',
        ),
        `def withdraw (balance amount : Nat) : Nat :=
  if amount ≤ balance then balance - amount else balance

theorem withdraw_conserves (balance amount : Nat) (h : amount ≤ balance) :
    withdraw balance amount + amount = balance := by
  unfold withdraw
  split
  · exact Nat.sub_add_cancel h
  · contradiction
`,
      ),
      card(
        text('λ 极客流：一行项式', 'λ Type Theorist: one-line term'),
        text(
          '不用 by，直接组合 ite_eq_left、congrArg 与 Nat.sub_add_cancel 交出证明项。',
          'No by block: compose ite_eq_left, congrArg and Nat.sub_add_cancel directly as a proof term.',
        ),
        `def withdraw (balance amount : Nat) : Nat :=
  if amount ≤ balance then balance - amount else balance

theorem withdraw_conserves (balance amount : Nat) (h : amount ≤ balance) :
    withdraw balance amount + amount = balance :=
  Eq.trans (congrArg (· + amount) (show withdraw balance amount = balance - amount from ite_eq_left h))
    (Nat.sub_add_cancel h)
`,
      ),
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
      card(
        text('🏅 一键点亮铜牌 + 银牌', '🏅 Claim Bronze + Silver'),
        text(
          '铜牌交给 decide，银牌展开一步后交给 omega，两枚一起拿下。',
          'decide takes bronze, and omega finishes silver after one unfold—both badges at once.',
        ),
        localizedJoin(collatzDefs, COLLATZ_BRONZE, COLLATZ_SILVER),
      ),
      card(
        text('🥉 只拿铜牌', '🥉 Claim Bronze only'),
        text(
          '只验证 6 → 3 → 10 这个具体例子，银牌留给自己。',
          'Verify only the concrete example 6 → 3 → 10 and leave silver for later.',
        ),
        localizedJoin(collatzDefs, COLLATZ_BRONZE),
      ),
      card(
        text('🥈 只拿银牌', '🥈 Claim Silver only'),
        text(
          '跳过铜牌，直接证明所有偶数 2 * (n + 1) 一步折半。',
          'Skip bronze and prove that every even 2 * (n + 1) halves in one step.',
        ),
        localizedJoin(collatzDefs, COLLATZ_SILVER),
      ),
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
      card(
        text('🏅 一键点亮铜牌 + 银牌', '🏅 Claim Bronze + Silver'),
        text(
          '铜牌让 decide 试除，银牌拆成 2 与 2 * n，两枚一起拿下。',
          'decide trial-divides for bronze, and silver splits into 2 and 2 * n—both at once.',
        ),
        localizedJoin(goldbachDefs, GOLDBACH_BRONZE, GOLDBACH_SILVER),
      ),
      card(
        text('🥉 只拿铜牌', '🥉 Claim Bronze only'),
        text(
          '只验证 4 = 2 + 2 与 10 = 3 + 7 的素性，银牌留给自己。',
          'Verify only the primality behind 4 = 2 + 2 and 10 = 3 + 7.',
        ),
        localizedJoin(goldbachDefs, GOLDBACH_BRONZE),
      ),
      card(
        text('🥈 只拿银牌', '🥈 Claim Silver only'),
        text(
          '跳过铜牌，直接证明每个偶数都能拆成两个偶数。',
          'Skip bronze and prove directly that every even number splits into two evens.',
        ),
        localizedJoin(goldbachDefs, GOLDBACH_SILVER),
      ),
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

/**
 * 为 Playground 提供立即可编译的初始代码：
 * 真假审判庭的详情页 starter 会引导点「上方立场按钮」，但在 Playground 里没有这组按钮，
 * 改为直接提供激活的「判真」模板 + 折叠注释的「判假」模板（不剧透）。
 */
export const playgroundStarter = (challenge: Challenge, locale: Locale): string => {
  if (challenge.mode !== 'verdict' || !challenge.verdictBranches) {
    return challenge.starter[locale];
  }
  const header =
    locale === 'zh'
      ? '-- 真假审判庭（Playground 自由探索）：默认载入「尝试证明」分支；若判断为假，删去上方定理并取消下方反例的 /- ... -/ 注释即可。'
      : '-- Truth Court (Playground): "try to prove it" is active below; if you judge it false, delete that theorem and uncomment the counterexample in /- ... -/.';
  const falseLabel =
    locale === 'zh'
      ? '判假分支（取消整块注释即可启用）：'
      : 'False branch (remove /- and -/ to activate):';
  return `${header}\n\n${challenge.verdictBranches.trueStarter[locale].trimEnd()}\n\n/-\n${falseLabel}\n${challenge.verdictBranches.falseStarter[locale].trimEnd()}\n-/\n`;
};
