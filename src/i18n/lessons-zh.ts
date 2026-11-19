import type { LessonPage } from './types';

export const lessonsZh: LessonPage[] = [
  {
    slug: 'what-is-lean',
    track: 'intro',
    navTitle: '01 · 会做数学题的编译器',
    title: '会做数学题的编译器',
    lead: '先别管证明，把它当成一个绝不放水的数学裁判：你交上去的每一步，它都逐条核对。',
    blocks: [
      {
        kind: 'p',
        text: '数学课上老师可能会说「这里显然成立」。Lean 不接受「显然」：它要求你指出用了哪条定义、哪条引理。写错一步，它当场用红线拦住。',
      },
      {
        kind: 'p',
        text: '右边 Goal 面板先不用管，本节只看输出区。把 `⊢` 想成裁判的记分牌：上面是你手里已经摸到的牌，下面是裁判要你交出的结论。',
      },
      { kind: 'code', code: '#eval 2 + 3' },
      {
        kind: 'p',
        text: '`#eval` 让 Lean 当场把表达式算给你看。`2 + 3` 不是一段字符串，Lean 真的算出了 5。',
      },
      { kind: 'code', code: '#check Nat.add' },
      {
        kind: 'p',
        text: '`#check` 只问「这个名字是什么类型」，不运行它。`Nat.add` 的类型是两个自然数进、一个自然数出。',
      },
      { kind: 'code', code: 'example : 2 + 2 = 4 := rfl' },
      {
        kind: 'p',
        text: '`example : 2 + 2 = 4 := rfl` 是一个最小证明。`rfl` 的意思是：两边化简完一模一样，裁判直接盖章放行。',
      },
      {
        kind: 'note',
        text: '为什么需要机器裁判：AI 能写出一段看起来很像证明的文字，但其中一步可能偷换了概念。Lean 不读语气，只检查每一步是否真的成立——这正是它比「看起来对」强的地方。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ 2 + 2 = 4\n执行 rfl：没有剩余目标\n\n⊢ 下面就是裁判要的结论。rfl 把两边都算成 4，结论自动成立。',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `#eval 2 + 3` 改成 `#eval 2 +`，故意少写一个数字。看 Lean 的红线拦在哪一行——它连表达式都没读完就会报错。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么这里不用写 by？',
        text: '`rfl` 本身就是一个证明，可以直接接在 `:=` 后面。只有需要多步操作时，才写 `:= by` 再换行；两种写法等价，后者适合展示中间过程。',
      },
      {
        kind: 'note',
        text: '一句话带走：Lean 既是计算器也是类型检查器。`#eval` 看值，`#check` 看类型，`rfl` 收掉两边相等的目标。',
      },
      {
        kind: 'note',
        text: '本站默认带 Init，另外可以按需加载 Std 与 Batteries；没有 Lean / Lake / Mathlib。后面的课都在这个范围内。',
      },
      {
        kind: 'p',
        text: '编辑器完整地跑在你的浏览器里：首次需要下载约 102MB 运行时，之后会缓存；代码不会上传到任何服务器。',
      },
    ],
    exercise: {
      title: '练习',
      body: '把 `#eval` 的算式换成你喜欢的；再把 `six_seven` 里的 `sorry` 换成 `rfl`，看 Goal 面板如何从 `⊢ 6 * 7 = 42` 变成没有目标。',
      hint: '`#eval` 看值，`#check` 看类型；`six_seven` 用 `rfl` 就能关闭。把 6 改成 5，Lean 会立刻报错，改回来又通过。',
      cta: '在编辑器中动手',
      starter: '#eval 6 * 7\n#check Nat.mul\n\ntheorem six_seven : 6 * 7 = 42 := by\n  sorry\n',
    },
  },
  {
    slug: 'first-proof',
    track: 'intro',
    navTitle: '02 · 第一个零漏洞证明',
    title: '你的第一个零漏洞证明',
    lead: '不用背术语，这一节只做三件小事：分清「规则」与「答案」，再用 rfl 让裁判当场盖章。',
    blocks: [
      {
        kind: 'p',
        text: '平时做验算，代一两个数试试就算完了，难免会漏掉反例。`rfl` 不靠猜：它让 Lean 当场把等号两边按规则算到底，只要化简结果一模一样，才算零漏洞过关。',
      },
      {
        kind: 'p',
        text: '盯住右侧 Goal 面板：`⊢` 上面是你手里已经拿到的条件（这一题暂时是空的），`⊢` 下面就是裁判要你交出的结论。每走一步，看 `⊢` 有没有变短甚至清空。',
      },
      { kind: 'code', code: '#check Nat.add\n#eval 2 + 3' },
      {
        kind: 'p',
        text: '点「运行」后，输出区会出现两行结果：`Nat.add` 那一行告诉你「这是一条什么运算规则」（收两个自然数、返回一个自然数），`#eval` 那一行则是「真正算出来的得数」（5）。',
      },
      { kind: 'code', code: '#check (2 + 2 = 4)\nexample : 2 + 2 = 4 := rfl' },
      {
        kind: 'p',
        text: '在 Lean 里，像「2 + 2 = 4」这样的一条判断就是一道待解答的题面，而证明就是能严丝合缝交差的凭证。只要等号两边算完完全相同，`rfl` 就是这张现成的通行证。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ 2 + 2 = 4\n执行 rfl：没有剩余目标\n\n`#check` 那一行只是在问「这是一条什么规则或命题」，不会留下待证目标。',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `rfl` 改成 `rfl 1`，看报错怎样提示 `rfl` 不需要你额外喂数字。再把 `2 + 2` 改成 `2 + 3`，看看两边算完不一样时，`⊢` 下面会留下什么。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么 rfl 证不了 0 + a = a？',
        text: '加法的规则默认先把右边拆开：`a + 0` 拆到头直接变成 `a`，所以 `rfl` 一眼就看出两边相等；但 `0 + a` 要先拆开 `a`，可 `a` 还是个未知数、拆不动，`rfl` 算到一半就卡住了，必须留给第 05 节用「从 0 一步步往上推」来解决。',
      },
      {
        kind: 'note',
        text: '一句话带走：`rfl` 只认「等号两边化简后一模一样」；需要用到前提条件或一步步推理时，后面会学新招式。',
      },
    ],
    exercise: {
      title: '练习',
      body: '把 `#eval 2 + 3` 改成你喜欢的算式，再把 `two_add_two` 里的 `sorry` 换成 `rfl`，观察目标如何清零。',
      hint: '`#check` 用来看规则（类型），`#eval` 用来直接算结果；`two_add_two` 用 `:= by` 展开了证明步骤，填上 `rfl` 就会由化简直接过关。',
      cta: '在编辑器中动手',
      starter: '#check Nat.mul\n#eval 6 * 7\n\ntheorem two_add_two : 2 + 2 = 4 := by\n  sorry\n',
    },
  },
  {
    slug: 'implication',
    track: 'intro',
    navTitle: '03 · 写一个证明函数',
    title: '写一个 if…then… 风格的证明函数',
    lead: '把「如果 P 那么 Q」看成一条推理链：只要前提属实，结论就必须跟着成立。',
    blocks: [
      {
        kind: 'p',
        text: '生活里最常见的推理是「如果下雨，地就会湿」。Lean 里的 `P → Q` 就是这句话：输入一个「P 成立」的证据，输出一个「Q 成立」的证据。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是 `P → P`，意思是裁判要你交一条推理：假设 P 成立，推出 P 成立。`intro h` 就是把前提接进手里。',
      },
      { kind: 'code', code: 'theorem id_imp (P : Prop) : P → P := by\n  intro h\n  exact h' },
      {
        kind: 'p',
        text: '`intro h` 把目标 `P → P` 变成「已有假设 `h : P`，要证 `P`」；`exact h` 直接把手里的牌打出去交差。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ P → P\n执行 intro h：h : P ⊢ P\n执行 exact h：没有剩余目标',
      },
      {
        kind: 'code',
        code: 'theorem trans_imp (P Q R : Prop) (h1 : P → Q) (h2 : Q → R) : P → R := by\n  intro hp\n  exact h2 (h1 hp)',
      },
      {
        kind: 'p',
        text: '推理可以串起来：如果下雨→地湿，地湿→路滑，那么下雨→路滑。两个箭头接在一起，就是把第一段推理的结论喂给第二段。',
      },
      {
        kind: 'note',
        text: '动手跑一次：把第二个 `exact h2 (h1 hp)` 改成 `exact h1 (h2 hp)`，看 Lean 怎么因为「类型对不上」拒绝你。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'intro 到底做了什么？',
        text: '目标 `P → Q` 是一个函数类型。`intro h` 相当于「假设给我一个 P 的证明，我叫它 h」，然后目标只剩 Q。它不是证明假设 P，而是把箭头左边变成新的已知条件。',
      },
      {
        kind: 'note',
        text: '一句话带走：目标出现 `→`，第一步几乎总是 `intro`，把箭头左边抓进手里。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `chain`：`(P → Q) → (Q → R) → P → R`，也就是把 `trans_imp` 的前提写成箭头形式。',
      hint: '目标全是箭头，先连续 `intro`，把 `(P → Q)`、`(Q → R)` 和 `P` 都拿进来；最后把第一个前提的输出喂给第二个前提。',
      cta: '在编辑器中动手',
      starter: 'theorem chain (P Q R : Prop) : (P → Q) → (Q → R) → P → R := by\n  sorry\n',
    },
  },
  {
    slug: 'connectives',
    track: 'intro',
    navTitle: '04 · 打包与拆包',
    title: '打包与拆包：同时满足（∧）和二选一（∨）',
    lead: '`∧` 是「两个都要满足」，`∨` 是「至少满足一个」；生活里的「又……又……」和「要么……要么……」就是它们。',
    blocks: [
      {
        kind: 'p',
        text: '「今天既下雨又刮风」要求两件事都成立，这就是 `P ∧ Q`。「周末去爬山或去博物馆」只要求至少一件成立，这就是 `P ∨ Q`。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是结论。遇到 `∧`，裁判要你交两件证据；遇到 `∨`，交其中一件就够。',
      },
      {
        kind: 'code',
        code: 'theorem and_self (P Q : Prop) (hp : P) (hq : Q) : P ∧ Q := ⟨hp, hq⟩',
      },
      {
        kind: 'p',
        text: '要证明 `P ∧ Q`，需要同时给出 `P` 的证明和 `Q` 的证明。`⟨hp, hq⟩` 是 `And.intro` 的简写，相当于把两件证据一起交上去。',
      },
      {
        kind: 'code',
        code: 'theorem and_comm (P Q : Prop) : P ∧ Q → Q ∧ P := by\n  intro h\n  exact ⟨h.2, h.1⟩',
      },
      {
        kind: 'p',
        text: '反过来，手里有 `h : P ∧ Q` 时，`h.1` 给出 `P`，`h.2` 给出 `Q`，就像从包裹里分别取出两件东西。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ P ∧ Q → Q ∧ P\n执行 intro h：h : P ∧ Q ⊢ Q ∧ P\n取 h.2 和 h.1：得到 Q 与 P 的证明\n用 ⟨h.2, h.1⟩ 打包：没有剩余目标',
      },
      {
        kind: 'code',
        code: 'theorem or_comm (P Q : Prop) : P ∨ Q → Q ∨ P := by\n  intro h\n  cases h with\n  | inl hp => exact Or.inr hp\n  | inr hq => exact Or.inl hq',
      },
      {
        kind: 'p',
        text: '析取要麻烦一点：要证 `P ∨ Q`，只需给出其中一边，用 `Or.inl` 或 `Or.inr`。要使用 `P ∨ Q`，则必须 `cases` 分两种情况讨论。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ P ∨ Q → Q ∨ P\n执行 intro h：h : P ∨ Q ⊢ Q ∨ P\n分支 inl hp：hp : P ⊢ Q ∨ P，用 Or.inr hp\n分支 inr hq：hq : Q ⊢ Q ∨ P，用 Or.inl hq',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `or_comm` 里的 `Or.inr hp` 改成 `Or.inl hp`，看 Lean 报的类型错误——`hp` 是 `P` 的证据，不是 `Q` 的。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么不能直接 exact h？',
        text: '`h` 的类型是 `P ∨ Q`，而目标是 `Q ∨ P`。两边不是同一个类型，Lean 不接受。必须 `cases` 把 `h` 拆成两种情况，分别构造对方需要的那个分支。',
      },
      {
        kind: 'note',
        text: '一句话带走：`∧` 用 `⟨⟩` 打包、用 `.1` / `.2` 拆包；`∨` 用 `inl` / `inr` 构造、用 `cases` 使用。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `or_comm_ex`：`(P ∨ Q) → (Q ∨ P)`，把两个分支都写完整。',
      hint: '先 `intro h`，再 `cases h with` 分成 `inl` 和 `inr` 两支；每支只需要用 `Or.inl` 或 `Or.inr` 把证据换到另一边。',
      cta: '在编辑器中动手',
      starter: 'theorem or_comm_ex (P Q : Prop) : P ∨ Q → Q ∨ P := by\n  sorry\n',
    },
  },
  {
    slug: 'induction',
    track: 'intro',
    navTitle: '05 · 多米诺骨牌',
    title: '多米诺骨牌：为什么「前一张倒了，下一张也会倒」能推倒整排',
    lead: '`n = 0` 是推倒第一张牌，`n + 1` 是「前一张倒了，下一张必倒」。',
    blocks: [
      {
        kind: 'p',
        text: '书架上有一排多米诺骨牌。你只需要确认两件事：第一张会被推倒；以及任意一张倒下时，下一张一定会跟着倒。这样整排都会倒。数学归纳法就是这两句话。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是 `a + b = b + a`。裁判要求你对所有自然数都成立，所以不能只展开一步，必须推倒整排多米诺。',
      },
      {
        kind: 'code',
        code: 'example (a : Nat) : a + 0 = a := rfl\n\nexample (a : Nat) : 0 + a = a := by\n  induction a with\n  | zero => rfl\n  | succ a ih => simp',
      },
      {
        kind: 'p',
        text: '先看两个小例子：`a + 0 = a` 能直接 `rfl`，因为加法对第二个参数递归；`0 + a = a` 卡住了，必须对 `a` 做归纳。`zero` 是推倒第一张牌，`succ a ih` 是「假设前一张倒了（`ih`），证明下一张也倒」。',
      },
      {
        kind: 'goal',
        text: 'a + 0 = a：⊢ a + 0 = a，rfl 直接关闭\n\n0 + a = a：\nzero 分支：⊢ 0 + 0 = 0，rfl\nsucc 分支：ih : 0 + a = a\n目标：⊢ 0 + succ a = succ a',
      },
      {
        kind: 'p',
        text: '现在对 `a` 做归纳，证明交换律。`induction a with` 把目标拆成两种情况：`a = 0`，以及 `a = succ a` 并附带归纳假设 `ih`。',
      },
      {
        kind: 'code',
        code: 'theorem add_comm (a b : Nat) : a + b = b + a := by\n  induction a with\n  | zero => simp\n  | succ a ih => simp only [Nat.succ_add, Nat.add_succ, ih]',
      },
      {
        kind: 'note',
        text: '`zero` 分支里 `simp` 把 `0 + b` 化简成 `b`；`succ` 分支里 `Nat.succ_add` 把 `succ a + b` 变成 `succ (a + b)`，再用归纳假设 `ih` 改写。',
      },
      {
        kind: 'goal',
        text: 'induction a 前：⊢ a + b = b + a\nzero 分支：⊢ 0 + b = b + 0，simp 收尾\nsucc 分支：ih : a + b = b + a\n目标：⊢ succ a + b = b + succ a',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `| zero => simp` 改成 `| zero => rfl`，看 Lean 是否还能通过；再把 `ih` 删掉，看 `simp` 少了哪条关键信息。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么 0 + a = a 不能 rfl？',
        text: '`Nat.add` 是对第二个参数递归定义的。`a + 0` 能直接化成 `a`，所以 `a + 0 = a` 是定义相等；但 `0 + a` 里第二个参数是变量 `a`，递归卡住了，只能对 `a` 做归纳。',
      },
      {
        kind: 'p',
        text: '写完后想逐步看证明状态，点「在编辑器中动手」，把光标移到 `by` 块内部：Goal 面板第一行始终是这条定理要证的目标，下面的行才是当前分支的局部假设。',
      },
      {
        kind: 'note',
        text: '一句话带走：归纳就是递归的证明版——先处理 `zero`，再假设 `ih` 处理 `succ`。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `add_zero` 和 `zero_add`：一个能直接由定义得出，另一个需要对 `a` 做归纳。',
      hint: '保持 `induction a with` 两个分支；`zero` 分支通常一行 `simp` 或 `rfl`，`succ` 分支记得用上 `ih`。',
      cta: '在编辑器中动手',
      starter:
        'theorem add_zero (a : Nat) : a + 0 = a := by\n  sorry\n\ntheorem zero_add (a : Nat) : 0 + a = a := by\n  sorry\n',
    },
  },
  {
    slug: 'rewrite',
    track: 'intro',
    navTitle: '06 · 等量代换',
    title: '等量代换：`rw` 怎么把目标越变越短',
    lead: '`rw` 就是中学里的等量代换：拿一条已知等式，把目标里的某一部分换掉。',
    blocks: [
      {
        kind: 'p',
        text: '解方程时你会把 `x = 3` 代进 `x + 2 = 5`，得到 `3 + 2 = 5`。`rw` 做的是同一件事：拿一条已知等式，替换目标里出现的表达式。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是待证结论。`rw` 每次都会改这块区域；改完之后先检查 `⊢` 是不是离「两边一样」更近了。',
      },
      {
        kind: 'code',
        code: 'theorem add_comm_rw (a b : Nat) : a + b = b + a := by\n  rw [Nat.add_comm]',
      },
      {
        kind: 'p',
        text: '`rw [Nat.add_comm]` 把目标里的 `a + b` 换成 `b + a`，于是两边变得一模一样，Lean 自动用 `rfl` 关闭目标。',
      },
      { kind: 'code', code: 'theorem eq_swap (a b : Nat) (h : a = b) : b = a := by\n  rw [h]' },
      {
        kind: 'p',
        text: '`rw` 默认从左往右用；写成 `rw [← h]` 就反过来，把右边换成左边。方向和你的等式写法有关。',
      },
      {
        kind: 'goal',
        text: '证明开始：h : a = b ⊢ b = a\n执行 rw [h]：把目标里的 a 换成 b，得到 ⊢ b = b\nrw 发现两边相同，自动用 rfl 关闭目标',
      },
      {
        kind: 'code',
        code: 'theorem add_assoc_rw (a b c : Nat) : a + b + c = a + (b + c) := by\n  rw [Nat.add_assoc]',
      },
      {
        kind: 'p',
        text: '结合律也能用 `rw`：`Nat.add_assoc` 把 `(a + b) + c` 改写成 `a + (b + c)`，目标直接变成等式两边相同。',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `rw [Nat.add_comm]` 改成 `rw [← Nat.add_comm]`，看目标被改成了什么，为什么这次没有自动关闭。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '什么时候要写 rw [← h]？',
        text: '看你的等式和目标的「方向」。如果等式是 `a = b`，目标里出现 `b` 而你想要 `a`，就要用 `← h` 反向替换。拿不准时先写 `rw [h]`，看目标变成什么再决定。',
      },
      { kind: 'note', text: '一句话带走：`rw` 是带证据的等量代换；方向反了就用 `←`。' },
    ],
    exercise: {
      title: '练习',
      body: '用 `rw` 证明 `eq_swap`：`b = a`（已知 `h : a = b`），再试着把结合律的等式反向改写一次。',
      hint: '`rw [h]` 会把目标里的 `a` 换成 `b`；如果目标没动，检查等式左右是不是和目标里的表达式完全一致。',
      cta: '在编辑器中动手',
      starter: 'theorem eq_swap (a b : Nat) (h : a = b) : b = a := by\n  sorry\n',
    },
  },
  {
    slug: 'simp',
    track: 'intro',
    navTitle: '07 · 一键扫尾',
    title: '一键扫尾：别手算了，交给 `simp`',
    lead: '`simp` 像 Prettier + ESLint --fix：按规则表反复化简，直到不能再简。',
    blocks: [
      {
        kind: 'p',
        text: '你写完代码会跑格式化工具，让它按一套规则自动改。`simp` 也是这样：它反复应用库里标了 `@[simp]` 的等式，把目标化到最简。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是目标；`simp` 生效时，你会看到它一步步变短，最后变成「没有目标」。',
      },
      { kind: 'code', code: 'theorem add_zero_simp (a : Nat) : a + 0 = a := by\n  simp' },
      {
        kind: 'p',
        text: '像 `a + 0 = a` 这种由定义直接可化的目标，一行 `simp` 就结束。它不需要你告诉它用哪条规则。',
      },
      { kind: 'goal', text: '证明开始：⊢ a + 0 = a\n执行 simp：化简到两边相同，没有剩余目标' },
      {
        kind: 'p',
        text: '`simp only` 只使用你列出的引理，不额外展开任何东西，行为更可预测。生产代码里更推荐这种写法。',
      },
      {
        kind: 'code',
        code: 'theorem succ_add_simp (a b : Nat) : Nat.succ a + b = Nat.succ (a + b) := by\n  simp only [Nat.succ_add]',
      },
      {
        kind: 'p',
        text: '`simp only [Nat.succ_add]` 只做一件事：把 `Nat.succ a + b` 改写成 `Nat.succ (a + b)`。',
      },
      {
        kind: 'details',
        summary: 'rw 和 simp 到底怎么选？',
        text: '目标是一两条明确等式时，`rw` 更可控；目标是大量琐碎化简、或者你只关心「化到最简」时，`simp` 更省事。`simp only` 是两者的折中：自动化，但规则由你指定。',
      },
      {
        kind: 'code',
        code: 'theorem add_succ_simp (a b : Nat) : a + Nat.succ b = Nat.succ (a + b) := by\n  simp only [Nat.add_succ]',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `simp only [Nat.add_succ]` 改成 `simp`，看它是否还能过；再故意写错引理名，看 Lean 怎么提示「未知引理」。',
        tone: 'warn',
      },
      {
        kind: 'note',
        text: '一句话带走：`simp` 是终结技；它不动的时候，说明目标需要 `intro`、`cases` 或 `induction`。',
      },
    ],
    exercise: {
      title: '练习',
      body: '分别用 `simp` 和 `simp only` 证明 `add_zero_twice`，比较两种写法的可控性。',
      hint: '`simp` 会自动选规则；`simp only [Nat.add_zero]` 只允许这一条。引理名写错时，Lean 会直接报「unknown identifier」。',
      cta: '在编辑器中动手',
      starter: 'theorem add_zero_twice (a : Nat) : a + 0 + 0 = a := by\n  sorry\n',
    },
  },
  {
    slug: 'quantifiers',
    track: 'intro',
    navTitle: '08 · ∀ 和 ∃',
    title: '全称 ∀ 和存在 ∃：一个像传参，一个像交样本',
    lead: '遇到 `∀` 就当普通函数接参数；遇到 `∃` 就必须交出一个具体数值加一段证明。',
    blocks: [
      {
        kind: 'p',
        text: '`∀ n, P n` 就是一个普通函数：调用者给你 `n`，你返回 `P n` 的证明。`∃ n, P n` 像提交测试样本：你必须交出一个具体的 `n`，再附上它满足 `P` 的证明。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是结论。看到 `∀`，先用 `intro` 把参数接进来；看到 `∃`，先想清楚要交哪个具体值。',
      },
      {
        kind: 'code',
        code: 'theorem forall_apply (P : Nat → Prop) (h : ∀ n, P n) : P 0 := h 0',
      },
      {
        kind: 'p',
        text: '`forall_apply` 直接调用 `h 0`：既然 `h` 对任意 `n` 都成立，那么给 `0` 也能拿到 `P 0` 的证明。',
      },
      { kind: 'code', code: 'theorem exists_intro : ∃ n : Nat, n + n = 4 := ⟨2, rfl⟩' },
      {
        kind: 'p',
        text: '`∃ n, n + n = 4` 的证明是 `⟨2, rfl⟩`：`2` 是见证（witness），`rfl` 证明它确实满足性质。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ ∃ n, n + n = 4\n提供 witness 2：⊢ 2 + 2 = 4\nrfl 收尾：没有剩余目标',
      },
      {
        kind: 'code',
        code: 'theorem exists_swap (P Q : Nat → Prop) (h : ∃ n, P n ∧ Q n) : ∃ n, Q n ∧ P n := by\n  cases h with\n  | intro n hn => exact ⟨n, hn.2, hn.1⟩',
      },
      {
        kind: 'p',
        text: '使用存在命题时必须拆开它：`cases h with | intro n hn => ...`，`n` 是见证，`hn` 是它满足性质的证明。',
      },
      {
        kind: 'goal',
        text: '证明开始：h : ∃ n, P n ∧ Q n ⊢ ∃ n, Q n ∧ P n\ncases h 后：n : Nat，hn : P n ∧ Q n ⊢ ∃ n, Q n ∧ P n\n用同一个 n 作为见证，把 hn.1 / hn.2 交换顺序',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `⟨2, rfl⟩` 里的 `2` 改成 `3`，看 `rfl` 为什么关不掉 `3 + 3 = 4`。见证不是随便填的。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '∀ 和 ∃ 的记忆口诀',
        text: '`∀` 进：用 `intro` 把参数拿进来。`∃` 出：用 `⟨witness, 证明⟩` 把它交出去。使用 `∃` 时反过来，用 `cases` 拆开。',
      },
      {
        kind: 'note',
        text: '一句话带走：`∀` 当函数接参，`∃` 交具体样本；一个 `intro`，一个 `⟨⟩`。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `exists_six`：`∃ n : Nat, n + n = 6`，再证明 `forall_three`：`(∀ n, P n) → P 3`。',
      hint: '存在命题先想 witness（这里 3 就行），再证等式；全称命题用 `intro` 接参数，或者像 `forall_apply` 那样直接调用。',
      cta: '在编辑器中动手',
      starter:
        'theorem exists_six : ∃ n : Nat, n + n = 6 := by\n  sorry\n\ntheorem forall_three (P : Nat → Prop) (h : ∀ n, P n) : P 3 := by\n  sorry\n',
    },
  },
  {
    slug: 'list-structure',
    track: 'intro',
    navTitle: '09 · 自己造数据结构',
    title: '自己造数据结构：链表和结构体也能写进证明里',
    lead: '`List Nat` 和常见的链表一样：要么空，要么一个头加一个尾；归纳证明也只需要这两种情况。',
    blocks: [
      {
        kind: 'p',
        text: '数学里的序列可以这样定义：要么是空序列，要么是一个元素后面接一个更短的序列。Lean 的 `List Nat` 正是这两个构造子：`[]` 和 `x :: xs`。所以对列表做归纳，永远只有两个分支。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是结论。列表归纳时，`nil` 分支是空表，`cons` 分支会多给你头和尾，以及尾的归纳假设。',
      },
      {
        kind: 'code',
        code: 'theorem length_map_zero (xs : List Nat) : (xs.map (fun x => x + 0)).length = xs.length := by\n  induction xs with\n  | nil => rfl\n  | cons x xs ih =>\n    simp only [List.map_cons, List.length_cons]\n    rw [ih]',
      },
      {
        kind: 'p',
        text: '`induction xs with` 把目标拆成 `nil` 和 `cons`。`cons` 分支里 `ih` 是「对尾成立」的假设，用它把整个列表的结论推出来。',
      },
      {
        kind: 'goal',
        text: 'induction xs 前：⊢ (xs.map (fun x => x + 0)).length = xs.length\nnil 分支：⊢ ([].map ...).length = [].length，rfl\ncons 分支：ih 是关于 xs 的归纳假设，simp 收尾',
      },
      {
        kind: 'p',
        text: '`simp` 默认会用 `List.length_map` 直接证掉目标，归纳假设反而用不上；这里用 `simp only` 只展开构造子，再 `rw [ih]` 显式使用它。',
      },
      {
        kind: 'code',
        code: 'structure Point where\n  x : Nat\n  y : Nat\n\ndef Point.sum (p : Point) : Nat := p.x + p.y\n\n#eval (Point.mk 3 4).sum',
      },
      {
        kind: 'p',
        text: '`structure` 把若干字段打包成一个类型，匿名构造子按声明顺序填值；点号可以直接访问字段。它也能用来描述几何点、向量这类数学对象。',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `Point.mk 3 4` 改成 `Point.mk 3`，看 Lean 怎么提示「少了一个字段」。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么这里不直接 simp？',
        text: '直接 `simp` 也能过，但那样归纳假设 `ih` 根本没被用上，你就看不到结构归纳的工作方式。`simp only` + `rw [ih]` 是把每一步摊开给你看。',
      },
      {
        kind: 'note',
        text: '一句话带走：列表归纳只有 `nil` 和 `cons` 两支；`structure` 就是给一组值起个名字。',
      },
      {
        kind: 'note',
        text: '下一节进入数学篇。你会反复用到今天的三件事：把概念写成定义、构造 witness、对数据结构做归纳。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `scale_one`：`p.scale 1 = p`，再给 `Point` 加一个 `z` 字段，观察构造子需要几个参数。',
      hint: '`p.scale 1` 展开后是 `⟨p.x * 1, p.y * 1⟩`；分别化简两个字段即可。加 `z` 字段后，`⟨...⟩` 要多填一个分量。',
      cta: '在编辑器中动手',
      starter:
        'structure Point where\n  x : Nat\n  y : Nat\n\ndef Point.scale (p : Point) (k : Nat) : Point :=\n  ⟨p.x * k, p.y * k⟩\n\ntheorem scale_one (p : Point) : p.scale 1 = p := by\n  sorry\n',
    },
  },
  {
    slug: 'math-proof-style',
    track: 'math',
    navTitle: '10 · 中文草稿纸翻译成 Lean',
    title: '中文草稿纸怎么一行行翻译成 Lean',
    lead: '把「设、取、分情况、归纳」这些数学课上的说法，逐句对应到 Lean 策略。',
    blocks: [
      {
        kind: 'p',
        text: '数学课上写「不妨设 a = 2x」，老师能脑补出 x 是存在的；Lean 要求你先把「存在某个 x」拆成手里具体的 x。这不是两套数学，只是精确度不同。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是当前要证的结论。每翻译一句中文，就检查一次 `⊢` 上面的假设有没有多出来。',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\nexample (a b : Nat) (ha : Even a) (hb : Even b) :\n    ∃ x y, a = 2 * x ∧ b = 2 * y := by\n  rcases ha with ⟨x, hx⟩\n  rcases hb with ⟨y, hy⟩\n  exact ⟨x, y, hx, hy⟩',
      },
      {
        kind: 'p',
        text: '对照一：「设 a = 2x、b = 2y」——用 `rcases` 把两个存在量词拆开，`x`、`y` 和等式就都进到 `⊢` 上面了。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ ∃ x y, a = 2 * x ∧ b = 2 * y\nrcases ha：x : Nat，hx : a = 2 * x（数学课上的「设 a = 2x」）\nrcases hb：y : Nat，hy : b = 2 * y\n用 ⟨x, y, hx, hy⟩ 交差',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\ntheorem even_add_even (a b : Nat) (ha : Even a) (hb : Even b) :\n    Even (a + b) := by\n  rcases ha with ⟨x, hx⟩\n  rcases hb with ⟨y, hy⟩\n  refine ⟨x + y, ?_⟩\n  rw [hx, hy]\n  grind',
      },
      {
        kind: 'p',
        text: '对照二：「取 k = x + y」——说出 witness 就够了；Lean 用 `refine` 或 `exact` 把它交出去，剩下的等式再逐步改写。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ Even (a + b)，展开即 ⊢ ∃ k, a + b = 2 * k\nrcases：得到 x、y 与 hx : a = 2 * x、hy : b = 2 * y\nrefine ⟨x + y, ?_⟩：把新的 witness 交出去\n剩下的等式用 rw 和 ring 收尾',
      },
      {
        kind: 'code',
        code: 'example (n : Nat) : n = 0 ∨ n ≠ 0 := by\n  by_cases h : n = 0\n  · exact Or.inl h\n  · exact Or.inr h',
      },
      {
        kind: 'p',
        text: '对照三：「分情况讨论」——数学课上写「若 n = 0 则…，否则…」；Lean 用 `by_cases h : n = 0`，两个分支各证一次。',
      },
      {
        kind: 'p',
        text: '对照四：「数学归纳法」——先证 `n = 0`，再假设 `n = k` 成立并证 `n = k + 1`。Lean 写成 `induction n with | zero => ... | succ k ih => ...`。',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `by_cases h : n = 0` 改成 `by_cases h : n = 1`，看两个分支的目标怎么变，为什么原来的证明不再适用。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '自然语言里哪些词最容易被 Lean 卡住？',
        text: '「显然」「不妨设」「同理」最容易被卡。Lean 不接受「显然」，只接受你指出用了哪条引理、哪个假设。把这三个词当成提醒：该 `rcases`、该 `simp`、该复制一遍证明了。',
      },
      {
        kind: 'note',
        text: '一句话带走：把中文数学句子逐句换成策略——设用 `rcases`，取用 `⟨witness, 证明⟩`，分情况用 `by_cases`，归纳用 `induction`。',
      },
    ],
    exercise: {
      title: '练习',
      body: '把「偶数 + 偶数还是偶数」用中文写一遍，再逐句翻译成 Lean 策略；先证 `even_eight`，再证 `even_sum`。',
      hint: '先 `rcases` 拆两个定义，再给出新的 witness `x + y`，最后用 `rw` / `ring` 收尾。',
      cta: '在编辑器中动手',
      starter:
        'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\ntheorem even_eight : Even 8 := by\n  sorry\n\ntheorem even_sum (a b : Nat) (ha : Even a) (hb : Even b) : Even (a + b) := by\n  sorry\n',
    },
  },
  {
    slug: 'math-divisibility',
    track: 'math',
    navTitle: '11 · 整除不是除法',
    title: '整除不是除法，而是「能写成乘法」',
    lead: '`2 ∣ 6` 说的是「存在一个 k，使 6 = 2 × k」，它和 `2 / 6` 完全不是一回事。',
    blocks: [
      {
        kind: 'p',
        text: '代码里判断「能不能整除」，你可能会写 `n % d == 0`。Lean 的 `∣` 换了个角度：它不执行除法，而是要求你交出一个乘数 `k`。这样做的好处是，证明里永远不会出现除不尽的小数。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是 `2 ∣ 6`。先用定义把它读成 `∃ k, 6 = 2 * k`，再想清楚要交哪个 `k`。',
      },
      { kind: 'code', code: '#check (2 ∣ 6)\n\nexample : 2 ∣ 6 := ⟨3, rfl⟩' },
      {
        kind: 'p',
        text: '`⟨3, rfl⟩` 就是证据：`3` 是那个 `k`，`rfl` 表示 `6` 和 `2 × 3` 按定义相等。证明存在性命题，核心就是构造 witness。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ 2 ∣ 6\n把 ∣ 读成存在量词：⊢ ∃ k, 6 = 2 * k\n提供 witness 3：⊢ 6 = 2 * 3\nrfl 收尾：没有剩余目标',
      },
      {
        kind: 'p',
        text: '整除可以传递：如果 `a` 整除 `b`，`b` 整除 `c`，那么 `a` 整除 `c`。证明方法就是把两个 witness 乘起来。',
      },
      {
        kind: 'code',
        code: 'theorem dvd_trans (a b c : Nat) (hab : a ∣ b) (hbc : b ∣ c) : a ∣ c := by\n  rcases hab with ⟨x, rfl⟩\n  rcases hbc with ⟨y, rfl⟩\n  exact ⟨x * y, by rw [Nat.mul_assoc]⟩',
      },
      {
        kind: 'p',
        text: '两个数都被 `a` 整除，它们的和也被 `a` 整除。同样是把两个 witness 相加。',
      },
      {
        kind: 'code',
        code: 'theorem dvd_add (a b c : Nat) (hb : a ∣ b) (hc : a ∣ c) : a ∣ b + c := by\n  rcases hb with ⟨x, rfl⟩\n  rcases hc with ⟨y, rfl⟩\n  exact ⟨x + y, by rw [Nat.mul_add]⟩',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `⟨3, rfl⟩` 里的 `3` 改成 `4`，看 `rfl` 为什么关不掉 `6 = 2 * 4`。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '从 List 到数学：怎么把 ∣ 拆开？',
        text: '`rcases h with ⟨k, rfl⟩` 会直接把目标里的 `b` 替换成 `a * k`，所以后面经常能直接 `rfl` 或 `ring`。`rfl` 能成立，是因为替换后两边变成了同一个表达式。',
      },
      { kind: 'note', text: '一句话带走：`a ∣ b` 就是 `∃ k, b = a * k`；证明它，交 witness。' },
    ],
    exercise: {
      title: '练习',
      body: '证明 `dvd_mul_right`：「如果 `a ∣ b`，那么 `a ∣ b * c`」。',
      hint: '`rcases h with ⟨k, rfl⟩`，然后交出新 witness `k * c`，用 `ring` 或 `rfl` 收尾。',
      cta: '在编辑器中动手',
      starter: 'theorem dvd_mul_right (a b c : Nat) (h : a ∣ b) : a ∣ b * c := by\n  sorry\n',
    },
  },
  {
    slug: 'math-parity',
    track: 'math',
    navTitle: '12 · 奇偶的第一道完整证明',
    title: '奇数偶数的第一道完整证明',
    lead: '偶数就是 2 的倍数，奇数就是 2 的倍数加一；把这两句话写成定义，就能证明「偶数 + 偶数还是偶数」。',
    blocks: [
      {
        kind: 'p',
        text: '判断奇偶，代码里你会写 `n % 2 === 0`。Lean 把「偶数」定义成一个存在命题：存在 `k`，使 `n = 2 * k`。这样证明时你手里永远有一个具体的 `k`，而不是一个取模结果。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是结论。看到 `Even (a + b)`，先把它展开成 `∃ k, a + b = 2 * k`，再想 witness。',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\nexample : Even 6 := ⟨3, rfl⟩\nexample : Odd 7 := ⟨3, rfl⟩',
      },
      {
        kind: 'p',
        text: '定义不是越复杂越好，而是把「我知道它是什么」变成「机器也能检查它是什么」。偶数、奇数各用一行就能写完。',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem even_add_even (a b : Nat) (ha : Even a) (hb : Even b) : Even (a + b) := by\n  rcases ha with ⟨x, rfl⟩\n  rcases hb with ⟨y, rfl⟩\n  exact ⟨x + y, by grind⟩',
      },
      {
        kind: 'p',
        text: '`Even a` 是一个存在命题。`rcases` 拆开它，就得到一个具体的 `k`；两个偶数相加，把两个 `k` 加在一起就是新的 witness。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ Even (a + b)，展开即 ⊢ ∃ k, a + b = 2 * k\nrcases ha with ⟨x, rfl⟩：a 被替换成 2 * x\nrcases hb with ⟨y, rfl⟩：b 被替换成 2 * y\n交 witness x + y，再用 ring 收尾',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem odd_add_odd (a b : Nat) (ha : Odd a) (hb : Odd b) : Even (a + b) := by\n  rcases ha with ⟨x, rfl⟩\n  rcases hb with ⟨y, rfl⟩\n  exact ⟨x + y + 1, by grind⟩',
      },
      { kind: 'p', text: '奇数 + 奇数会多出一个 1，正好又凑成 2 的倍数。' },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by\n  intro h\n  rcases h with ⟨⟨x, hx⟩, ⟨y, hy⟩⟩\n  grind',
      },
      {
        kind: 'p',
        text: '同一个数不能既是偶数又是奇数。假设两者都成立，`grind` 会发现 `2k = 2j + 1` 不可能。',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `even_add_even` 里的 witness 从 `x + y` 改成 `x + y + 1`，看 `ring` 为什么不再通过。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'rcases 后面为什么能直接写 rfl？',
        text: '`rcases h with ⟨k, rfl⟩` 会用 `k` 把目标里的表达式替换掉。替换后如果两边变成同一个表达式，`rfl` 就能直接关闭。它不是在「猜」，而是定义相等。',
      },
      {
        kind: 'note',
        text: '一句话带走：把「偶数」写成 `∃ k, n = 2 * k`，证明就变成找 witness。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `even_plus_odd`：「偶数 + 奇数 = 奇数」。',
      hint: '分别 `rcases` 偶数和奇数定义，交出的 witness 应该是两个 `k` 相加。',
      cta: '在编辑器中动手',
      starter:
        'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem even_plus_odd (a b : Nat) (ha : Even a) (hb : Odd b) : Odd (a + b) := by\n  sorry\n',
    },
  },
  {
    slug: 'math-gcd',
    track: 'math',
    navTitle: '13 · 最大公约数的规格',
    title: '怎么用逻辑描述「最大公约数」而不只是算出来',
    lead: '「最大公约数」最重要的不是怎么算，而是它到底满足什么性质。',
    blocks: [
      {
        kind: 'p',
        text: '写后端接口时，你会先写 OpenAPI 规格，再写实现。`IsGcd` 就是最大公约数的规格：先把它该满足的性质写清楚，再谈算法。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是规格。`IsGcd a b d` 展开后有三件事：`d ∣ a`、`d ∣ b`，以及任何公约数都整除 `d`。',
      },
      {
        kind: 'code',
        code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\n#check IsGcd',
      },
      {
        kind: 'p',
        text: '`d` 是 `a`、`b` 的公约数，并且任何公约数都整除 `d`。这三句话就是最大公约数的规格。',
      },
      {
        kind: 'code',
        code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem gcd_is_gcd (a b : Nat) : IsGcd a b (Nat.gcd a b) := by\n  constructor\n  · exact Nat.gcd_dvd_left a b\n  constructor\n  · exact Nat.gcd_dvd_right a b\n  · intro e hea heb\n    exact Nat.dvd_gcd hea heb',
      },
      {
        kind: 'p',
        text: 'Init 自带 `Nat.gcd`（底层是欧几里得算法）。我们不需要重写算法，只需要证明它满足上面这条规格。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ IsGcd a b (Nat.gcd a b)，展开为 (Nat.gcd a b ∣ a) ∧ (Nat.gcd a b ∣ b) ∧ 最大性\nconstructor：先拆成两个整除\n再用 Nat.gcd_dvd_left / Nat.gcd_dvd_right / Nat.dvd_gcd 分别满足三件事',
      },
      {
        kind: 'code',
        code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem gcd_unique (a b d e : Nat) (hd : IsGcd a b d) (he : IsGcd a b e) : d = e := by\n  rcases hd with ⟨hda, hdb, hdg⟩\n  rcases he with ⟨hea, heb, heg⟩\n  exact Nat.dvd_antisymm (heg d hda hdb) (hdg e hea heb)',
      },
      {
        kind: 'p',
        text: '规格还有一个好处：满足规格的值唯一。如果 `d` 和 `e` 都满足 `IsGcd`，那么 `d = e`。',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `gcd_is_gcd` 里的 `Nat.gcd_dvd_left` 改成 `Nat.gcd_dvd_right`，看第一个目标为什么变得对不上。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么不自己写一个 gcd 算法？',
        text: '你可以写，但写完还要证明它满足规格，工作量更大。直接证明现成的 `Nat.gcd` 满足规格，是把「实现」和「正确性」分开：以后换更快的实现，只要规格证明还在，依赖它的定理都不用改。',
      },
      {
        kind: 'note',
        text: '一句话带走：先写规格（`IsGcd`），再证实现满足它；这比「能算出结果」强得多。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `gcd_swap`：`IsGcd a b d → IsGcd b a d`，也就是公约数规格对调两个数后仍然成立。',
      hint: '`rcases hd` 拆成三部分，重新 `constructor`；注意交换 `∣` 的两个参数顺序后，引理的用法也要跟着换。',
      cta: '在编辑器中动手',
      starter:
        'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem gcd_swap (a b d : Nat) (hd : IsGcd a b d) : IsGcd b a d := by\n  sorry\n',
    },
  },
  {
    slug: 'math-primes',
    track: 'math',
    navTitle: '14 · 反证法与素数',
    title: '反证法怎么写：想找反例却把自己逼进死胡同',
    lead: '素数不是「看起来很特别」的数，而是满足两条性质的数：至少为 2，且因子只有 1 和它自己。',
    blocks: [
      {
        kind: 'p',
        text: '代码里校验输入，你会先写 `n >= 2`，再检查有没有其它因子。Lean 的 `Prime` 就是把这个检查写成一条全称命题：任何因子都只能是 1 或 n 本身。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是 `Prime n`。先展开成两条：`2 ≤ n`，以及「对所有 d，d ∣ n → d = 1 ∨ d = n」。',
      },
      {
        kind: 'code',
        code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\n#check Prime',
      },
      { kind: 'p', text: '把「只有 1 和它自己两个因子」写成一个全称命题，就得到素数的定义。' },
      {
        kind: 'code',
        code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem not_prime_one : ¬ Prime 1 := by\n  intro h\n  rcases h with ⟨h2, _⟩\n  grind\n\ntheorem not_prime_four : ¬ Prime 4 := by\n  intro h\n  rcases h with ⟨_, hd⟩\n  have h2 : 2 ∣ 4 := ⟨2, rfl⟩\n  have h := hd 2 h2\n  grind',
      },
      {
        kind: 'p',
        text: '反驳一个数是素数，只需要找到一个「多余的因子」。比如 4 有因子 2，而 2 既不是 1 也不是 4。',
      },
      {
        kind: 'code',
        code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem prime_two : Prime 2 := by\n  constructor\n  · grind\n  · intro d hd\n    have hle : d ≤ 2 := Nat.le_of_dvd (by grind) hd\n    have hpos : 0 < d := Nat.pos_of_dvd_of_pos hd (by grind)\n    grind',
      },
      {
        kind: 'p',
        text: '证明 2 是素数则要处理任意因子 `d`：它必须先满足 `d ≤ 2`，又必须是正数，所以只能是 1 或 2。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ Prime 2，展开为 2 ≤ 2 ∧ ∀ d, d ∣ 2 → d = 1 ∨ d = 2\nconstructor：分成两个目标\n第一个目标 2 ≤ 2 直接由 grind 收掉\n第二个目标 intro d hd，再用整除的界推出 d = 1 或 d = 2',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `not_prime_four` 里的 `2 ∣ 4` 改成 `3 ∣ 4`，看 `grind` 还能不能找到矛盾。反证法最怕证据本身不成立。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'd ≤ 2 和 0 < d 是从哪来的？',
        text: '`Nat.le_of_dvd` 用「`d` 整除 2 且 2 大于 0」推出 `d ≤ 2`；`Nat.pos_of_dvd_of_pos` 推出 `d > 0`。这两个界把 `d` 夹在 1 和 2 之间，所以只能取这两个值。',
      },
      {
        kind: 'note',
        text: '一句话带走：反证法就是假设结论不成立，再用定义和已知条件把矛盾逼出来。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `not_prime_six`：6 不是素数。',
      hint: '用 `not_prime_four` 的套路：假设 `Prime 6`，找到因子 2 或 3，再用 `grind` 推出它既不是 1 也不是 6。',
      cta: '在编辑器中动手',
      starter:
        'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem not_prime_six : ¬ Prime 6 := by\n  sorry\n',
    },
  },
  {
    slug: 'math-sets',
    track: 'math',
    navTitle: '15 · 集合就是判断函数',
    title: '集合其实就是返回 Prop 的判断函数',
    lead: '集合不是列表，而是一条规则：给我一个元素，我回答它在不在。',
    blocks: [
      {
        kind: 'p',
        text: '代码里你会写 `isEven(n): boolean`。Lean 的集合就是一个返回 `Prop` 的函数：`x` 属于 `A`，就是命题 `A x` 成立。它不把所有元素装进一个容器，而是现场判断。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是结论。看到 `x ∈ A`，就把它读成 `A x`；看到 `Subset A B`，就展开成「对所有 x，A x → B x」。',
      },
      {
        kind: 'code',
        code: 'def Set (α : Type) := α → Prop\n\ndef evens : Set Nat := fun n => ∃ k, n = 2 * k\n\n#check evens\n#check evens 4',
      },
      {
        kind: 'p',
        text: '在 Lean 里可以直接把集合定义成 `A : α → Prop`。`x` 属于 `A`，就是命题 `A x` 为真。',
      },
      {
        kind: 'code',
        code: 'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ntheorem subset_trans {α : Type} (A B C : Set α) (h1 : Subset A B) (h2 : Subset B C) : Subset A C := by\n  intro x hx\n  exact h2 x (h1 x hx)',
      },
      {
        kind: 'p',
        text: '子集：`A` 的每个元素都在 `B` 里。这是一条全称命题，证明就是 `intro` 一个元素再往下推。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ Subset A C\n展开 Subset：⊢ ∀ x, A x → C x\n执行 intro x hx：x : α，hx : A x ⊢ C x\n把 hx 喂给 h1：得到 B x，再喂给 h2：得到 C x',
      },
      {
        kind: 'code',
        code: 'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ndef SetUnion {α : Type} (A B : Set α) : Set α := fun x => A x ∨ B x\n\ntheorem subset_union {α : Type} (A B : Set α) : Subset A (SetUnion A B) := by\n  intro x hx\n  exact Or.inl hx',
      },
      {
        kind: 'p',
        text: '并集：`A ∪ B` 的元素满足 `A x` 或 `B x`，所以 `A` 一定是 `A ∪ B` 的子集。',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `subset_trans` 里的 `exact h2 (h1 hx)` 改成 `exact h1 (h2 hx)`，看类型为什么对不上。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '集合证明为什么总是 intro？',
        text: '因为 `Subset`、`∈`、并集展开后都是全称命题：「对所有 x，如果……那么……」。全称命题的第一步就是 `intro` 把 x 拿进来，再 `intro` 把前提拿进来。',
      },
      {
        kind: 'note',
        text: '一句话带走：集合就是 `α → Prop` 的函数；子集证明就是 `intro` 一个元素再推。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `subset_self`（`A ⊆ A`）和 `subset_union_left`（`A ⊆ A ∪ B`）。',
      hint: '`Subset` 展开后先 `intro x hx`，然后直接 `exact hx`，或者用 `Or.inl hx` 进入并集的左边。',
      cta: '在编辑器中动手',
      starter:
        'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ndef SetUnion {α : Type} (A B : Set α) : Set α := fun x => A x ∨ B x\n\ntheorem subset_self {α : Type} (A : Set α) : Subset A A := by\n  sorry\n\ntheorem subset_union_left {α : Type} (A B : Set α) : Subset A (SetUnion A B) := by\n  sorry\n',
    },
  },
  {
    slug: 'math-functions',
    track: 'math',
    navTitle: '16 · 单射、满射、双射',
    title: '单射、满射、双射：不撞车、不漏掉、一一对应',
    lead: '单射保证不同输入不撞到同一个输出，满射保证目标都能被达到，两者都有就是双射。',
    blocks: [
      {
        kind: 'p',
        text: '想象一间教室，每个人都要有一把椅子，且两把椅子不能坐同一个人。单射保证「不撞车」（不同的人不会挤到同一把椅子），满射保证「不漏掉」（每把椅子都有人坐），两者都有就是一一对应。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是函数性质。单射展开后是「对所有 a、b，f a = f b → a = b」；满射展开后是「对每个 b，存在 a 使 f a = b」。',
      },
      {
        kind: 'code',
        code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ndef Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ndef Bijective {α β : Type} (f : α → β) : Prop := Injective f ∧ Surjective f\n\n#check Injective',
      },
      {
        kind: 'p',
        text: '单射：不同输入给出不同输出。满射：每个目标值都有原像。两者都有就是双射。',
      },
      {
        kind: 'code',
        code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ntheorem injective_comp {α β γ : Type} (f : α → β) (g : β → γ)\n    (hf : Injective f) (hg : Injective g) : Injective (fun x => g (f x)) := by\n  intro a b h\n  apply hf\n  apply hg\n  exact h',
      },
      {
        kind: 'p',
        text: '两个单射复合还是单射：如果 `g (f a) = g (f b)`，先用 `g` 的单射得到 `f a = f b`，再用 `f` 的单射得到 `a = b`。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ Injective (fun x => g (f x))，展开为 ∀ a b, g (f a) = g (f b) → a = b\nintro a b h：h : g (f a) = g (f b)\n用 hg 得到 f a = f b，再用 hf 得到 a = b',
      },
      {
        kind: 'code',
        code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ndef Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ndef Bijective {α β : Type} (f : α → β) : Prop := Injective f ∧ Surjective f\n\ntheorem surjective_id {α : Type} : Surjective (fun x : α => x) := by\n  intro b\n  exact ⟨b, rfl⟩\n\ntheorem bijective_id {α : Type} : Bijective (fun x : α => x) := by\n  constructor\n  · intro a b h\n    exact h\n  · exact surjective_id',
      },
      { kind: 'p', text: '恒等函数既单又满，所以是双射。' },
      {
        kind: 'note',
        text: '动手跑一次：把 `injective_comp` 里的 `hg` 和 `hf` 调换顺序，看 Lean 在哪一步拒绝——内层函数必须先拆。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'apply 和 exact 到底怎么选？',
        text: '`exact` 是「我有一个完整的证明，直接交」。`apply` 是「我要证的结论长得像某个引理的结论，先把引理的前提变成新目标」。复合单射里常用 `apply hg`，把目标从 `g ... = g ...` 变成 `f ... = f ...`。',
      },
      { kind: 'note', text: '一句话带走：单射防撞车，满射防漏掉，双射就是一一对应。' },
    ],
    exercise: {
      title: '练习',
      body: '证明 `bijective_id`：恒等函数 `fun x => x` 是双射。',
      hint: '单射和满射都直接从定义出发：`intro a b h` 后用 `exact h`；满射的 witness 直接取目标值本身。',
      cta: '在编辑器中动手',
      starter:
        'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ndef Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ndef Bijective {α β : Type} (f : α → β) : Prop := Injective f ∧ Surjective f\n\ntheorem bijective_id {α : Type} : Bijective (fun x : α => x) := by\n  sorry\n',
    },
  },
  {
    slug: 'math-relations',
    track: 'math',
    navTitle: '17 · 等价关系',
    title: '等价关系：给数据分类的三大铁律',
    lead: '自反、对称、传递，这三条性质把对象分成一堆一堆。',
    blocks: [
      {
        kind: 'p',
        text: '代码里按字符串长度分组：长度等于自己、可以交换、可以传递。这三条刚好就是等价关系的三条铁律，满足它们就能安全地把数据分堆。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是 `SameLength xs xs` 之类的结论。先把定义展开成 `xs.length = ys.length`，再看三条性质各自要证什么。',
      },
      {
        kind: 'code',
        code: 'structure IsEquivalence {α : Type} (r : α → α → Prop) : Prop where\n  refl : ∀ x, r x x\n  symm : ∀ {x y}, r x y → r y x\n  trans : ∀ {x y z}, r x y → r y z → r x z\n\ndef SameLength {α : Type} (xs ys : List α) : Prop := xs.length = ys.length\n\n#check IsEquivalence',
      },
      { kind: 'p', text: '把三条性质写成一个结构，就是等价关系的定义。' },
      {
        kind: 'code',
        code: 'def SameLength {α : Type} (xs ys : List α) : Prop := xs.length = ys.length\n\ntheorem same_length_refl {α : Type} (xs : List α) : SameLength xs xs := rfl\n\ntheorem same_length_symm {α : Type} (xs ys : List α) (h : SameLength xs ys) :\n    SameLength ys xs := by\n  exact h.symm\n\ntheorem same_length_trans {α : Type} (xs ys zs : List α)\n    (h1 : SameLength xs ys) (h2 : SameLength ys zs) : SameLength xs zs := by\n  exact h1.trans h2',
      },
      { kind: 'p', text: '「长度相同」就是一个等价关系：长度等于自己、可以交换、可以传递。' },
      {
        kind: 'goal',
        text: 'same_length_refl：⊢ SameLength xs xs，展开为 xs.length = xs.length，rfl 收尾\nsame_length_symm：h : xs.length = ys.length ⊢ ys.length = xs.length，用 h.symm\nsame_length_trans：h1、h2 直接 h1.trans h2',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `same_length_symm` 里的 `h.symm` 改成 `h`，看目标方向和假设方向不一致时 Lean 怎么报错。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'structure 的证明为什么能写 where？',
        text: '`IsEquivalence` 被声明成 `Prop` 上的结构，每个字段都是一个待证命题。写 `where` 后面跟三个字段的证明，就等于分别证明自反、对称、传递。',
      },
      {
        kind: 'note',
        text: '一句话带走：等价关系 = 自反 + 对称 + 传递；它给你一个合法的「分堆」依据。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `mod_two_equiv`：「模 2 同余」满足自反、对称、传递。',
      hint: '把 `ModTwo x y` 定义成 `x % 2 = y % 2`；三条性质分别用 `rfl`、`h.symm`、`h1.trans h2`。',
      cta: '在编辑器中动手',
      starter:
        'structure IsEquivalence {α : Type} (r : α → α → Prop) : Prop where\n  refl : ∀ x, r x x\n  symm : ∀ {x y}, r x y → r y x\n  trans : ∀ {x y z}, r x y → r y z → r x z\n\ndef ModTwo (x y : Nat) : Prop := x % 2 = y % 2\n\ntheorem mod_two_equiv : IsEquivalence ModTwo := by\n  sorry\n',
    },
  },
  {
    slug: 'math-strong-induction',
    track: 'math',
    navTitle: '18 · 强归纳',
    title: '强归纳：不止看前一步，前面所有步都能借来用',
    lead: '有些递推关系要用到前两项甚至所有更小的项；这时普通归纳不够。',
    blocks: [
      {
        kind: 'p',
        text: '斐波那契的下一项依赖前两项，普通归纳只给你前一项，不够用。强归纳把「所有更小的项都成立」整包交给你，想借哪一步就借哪一步。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是当前项的上界。强归纳假设通常写成 `ih : ∀ m, m < n → ...`，用的时候给它一个具体的 `m` 和 `m < n` 的证明。',
      },
      {
        kind: 'code',
        code: 'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\n#eval fib 10',
      },
      { kind: 'p', text: '斐波那契数列：`F(0)=0`，`F(1)=1`，之后每一项等于前两项之和。' },
      {
        kind: 'code',
        code: 'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\ntheorem fib_lt_two_pow (n : Nat) : fib n ≤ 2 ^ n := by\n  induction n using Nat.strongRecOn with\n  | ind n ih =>\n    match n with\n    | 0 => simp [fib]\n    | 1 => simp [fib]\n    | k + 2 =>\n      have h1 := ih k (by grind)\n      have h2 := ih (k + 1) (by grind)\n      simp [fib, Nat.pow_succ]\n      grind',
      },
      {
        kind: 'p',
        text: '普通归纳只给你前一项；强归纳给你所有更小的项。Lean 的 `Nat.strongRecOn` 把「对所有 `m < n` 成立」直接交给你。',
      },
      {
        kind: 'goal',
        text: '强归纳假设：ih : ∀ m, m < n → fib m ≤ 2 ^ m\nk + 2 分支：⊢ fib (k + 2) ≤ 2 ^ (k + 2)\n展开 fib：⊢ fib k + fib (k + 1) ≤ 2 ^ (k + 2)\n分别用 ih k 和 ih (k + 1) 放缩，再用幂的运算收尾',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `ih (k + 1)` 改成 `ih k`，看 `omega` 或 `simp` 是否还能证明上界；少借一步通常就会卡住。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么这里要拿两个归纳假设？',
        text: '`fib (k + 2)` 展开后同时依赖 `fib k` 和 `fib (k + 1)`。强归纳假设对两者都成立，所以可以各借一次；普通归纳只给 `fib (k + 1)`，不够。',
      },
      {
        kind: 'note',
        text: '一句话带走：强归纳 = 普通归纳 + 「所有更小的 m 都成立」这个更大的假设包。',
      },
    ],
    exercise: {
      title: '练习',
      body: '用强归纳证明 `fib_lt_two_pow`：`fib n ≤ 2 ^ n`，体会两个归纳假设分别用在哪里。',
      hint: '先展开 `fib (k + 2)`，再分别对 `k` 和 `k + 1` 使用强归纳假设；最后用 `Nat.pow_succ` 或 `omega` 收尾。',
      cta: '在编辑器中动手',
      starter:
        'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\ntheorem fib_lt_two_pow (n : Nat) : fib n ≤ 2 ^ n := by\n  sorry\n',
    },
  },
  {
    slug: 'code-sorting',
    track: 'math',
    navTitle: '19 · 证明插入排序正确',
    title: '高潮实战：用数学证明插入排序永远不会排错',
    lead: '排序的规格有两部分：结果有序，并且元素一个都没丢。',
    blocks: [
      {
        kind: 'p',
        text: '你给排序写单元测试，只能覆盖几个数组。这里我们把「结果有序」和「元素不丢」写成两条定理，让编译器对所有输入一次性证死。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是当前要证的性质。看到 `Sorted (insertNat x xs)`，先想清楚 `nil` 和 `cons` 两个分支各自需要什么。',
      },
      {
        kind: 'code',
        code: 'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ndef sort : List Nat → List Nat\n  | [] => []\n  | x :: xs => insertNat x (sort xs)\n\n#eval sort [3, 1, 2]',
      },
      {
        kind: 'p',
        text: '先定义「有序」：空表和单元素表天然有序，多元素表要求头 ≤ 第二个元素，并且尾部有序。`sort` 就是不断把元素插进已排好的尾部。',
      },
      {
        kind: 'code',
        code: 'def insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ntheorem mem_insertNat (x y : Nat) (xs : List Nat) :\n    y ∈ insertNat x xs ↔ y = x ∨ y ∈ xs := by\n  induction xs with\n  | nil =>\n    unfold insertNat\n    simp\n  | cons z zs ih =>\n    unfold insertNat\n    by_cases h : x ≤ z\n    · simp [h]\n    · simp [h, ih, or_left_comm]',
      },
      {
        kind: 'p',
        text: '成员保持：`y` 在 `insertNat x xs` 里，当且仅当 `y = x` 或者 `y` 本来就在 `xs` 里。这条定理保证插入不会凭空造元素，也不会把元素弄丢。',
      },
      {
        kind: 'note',
        text: '有序性的证明留作练习；先证成员保持，再证有序，是这类证明的常见拆法。',
      },
      {
        kind: 'goal',
        text: 'sorted_insert 要证：Sorted xs → Sorted (insertNat x xs)\nnil 分支：⊢ Sorted [x]，simp [insertNat, Sorted] 收尾\ncons 分支：分 x ≤ y 与 x > y 两种情况，各自维护有序性',
      },
      {
        kind: 'code',
        code: 'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ndef sort : List Nat → List Nat\n  | [] => []\n  | x :: xs => insertNat x (sort xs)\n\ntheorem sorted_insert (x : Nat) (xs : List Nat) (h : Sorted xs) :\n    Sorted (insertNat x xs) := by\n  induction xs with\n  | nil => simp [insertNat, Sorted]\n  | cons y ys ih =>\n    by_cases hxy : x ≤ y\n    · sorry\n    · sorry\n\ntheorem sort_sorted (xs : List Nat) : Sorted (sort xs) := by\n  induction xs with\n  | nil => simp [sort, Sorted]\n  | cons x xs ih =>\n    simp [sort]\n    exact sorted_insert x (sort xs) ih',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `sorted_insert` 里的一个 `sorry` 删掉但不补证明，看 Lean 报什么；再把它改成 `exact h`，看类型为什么不对。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么把排序证明拆成两步？',
        text: '「元素不丢」和「结果有序」是两条独立性质。分开证，每步只关心一件事，出错时容易定位；合在一起证，归纳假设会同时承担两个职责，很快就看不清了。',
      },
      {
        kind: 'note',
        text: '一句话带走：算法正确性 = 规格（有序 + 不丢元素）+ 对递归结构做归纳。',
      },
    ],
    exercise: {
      title: '练习',
      body: '补完 `sorted_insert` 里两个 `sorry`，让 `sort_sorted` 不再依赖未完成的证明。',
      hint: '`cons` 分支先 `by_cases hxy : x ≤ y`：成立时把 `x` 放前面，用 `h` 拆出有序性；不成立时递归插入尾部，再用归纳假设。',
      cta: '在编辑器中动手',
      starter:
        'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ndef sort : List Nat → List Nat\n  | [] => []\n  | x :: xs => insertNat x (sort xs)\n\ntheorem sorted_insert (x : Nat) (xs : List Nat) (h : Sorted xs) :\n    Sorted (insertNat x xs) := by\n  induction xs with\n  | nil => simp [insertNat, Sorted]\n  | cons y ys ih =>\n    by_cases hxy : x ≤ y\n    · sorry\n    · sorry\n\ntheorem sort_sorted (xs : List Nat) : Sorted (sort xs) := by\n  induction xs with\n  | nil => simp [sort, Sorted]\n  | cons x xs ih =>\n    simp [sort]\n    exact sorted_insert x (sort xs) ih\n',
    },
  },
  {
    slug: 'code-sum',
    track: 'math',
    navTitle: '20 · 两段数组合并求和',
    title: '递归函数拆解：两段数组拼起来求和为什么一定相等',
    lead: '列表求和是最小但完整的例子：写一个递归函数，再用结构归纳证明它的性质。',
    blocks: [
      {
        kind: 'p',
        text: '你写 `sum(xs.concat(ys))` 时，直觉上它应该等于 `sum(xs) + sum(ys)`。Lean 要求把这个直觉变成一条对所有列表都成立的定理。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是等式。对 `xs` 做归纳：空表是基准情况，非空表用归纳假设把尾部换掉。',
      },
      {
        kind: 'code',
        code: 'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\n#eval sum [1, 2, 3]',
      },
      { kind: 'p', text: '求和的定义直接照抄数学：空表是 0，非空表是头加尾。' },
      {
        kind: 'code',
        code: 'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\ntheorem sum_append (xs ys : List Nat) : sum (xs ++ ys) = sum xs + sum ys := by\n  induction xs with\n  | nil => simp [sum]\n  | cons x xs ih =>\n    simp [sum, ih]\n    grind',
      },
      {
        kind: 'p',
        text: '拼接两个列表再求和，等于分别求和再相加。证明对第一个列表做结构归纳。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ sum (xs ++ ys) = sum xs + sum ys\ninduction xs with：xs 同时是 sum 和 ++ 递归的位置\nnil：simp [sum]，两边都化成 sum ys\ncons：用 ih 把 sum (xs ++ ys) 换掉，再用加法结合律收尾',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `induction xs` 改成 `induction ys`，看归纳假设还够不够用。递归发生在哪个参数上，就归纳哪个。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么归纳 xs 而不是 ys？',
        text: '`sum` 和 `++` 都是对第一个参数递归展开的。对 `xs` 归纳，`cons` 分支才能同时展开 `sum (x :: xs ++ ys)` 和 `sum (x :: xs)`；对 `ys` 归纳，`xs` 仍然是未知的，展开不了。',
      },
      { kind: 'note', text: '一句话带走：递归函数对谁递归，就对谁归纳。' },
    ],
    exercise: {
      title: '练习',
      body: '利用已经证明的 `sum_append`，证明 `sum_swap`：`sum (xs ++ ys) = sum ys + sum xs`。',
      hint: '先 `rw [sum_append]`，再用 `Nat.add_comm` 交换右边两项；`sum_append` 已经在上方证好，不用重证。',
      cta: '在编辑器中动手',
      starter:
        'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\ntheorem sum_append (xs ys : List Nat) : sum (xs ++ ys) = sum xs + sum ys := by\n  induction xs with\n  | nil => simp [sum]\n  | cons x xs ih =>\n    simp [sum, ih]\n    grind\n\ntheorem sum_swap (xs ys : List Nat) : sum (xs ++ ys) = sum ys + sum xs := by\n  sorry\n',
    },
  },
  {
    slug: 'math-axioms',
    track: 'math',
    navTitle: '21 · sorry 与公理检查',
    title: '作弊检测器：`sorry` 和 `#print axioms`',
    lead: '`sorry` 是先占坑的 TODO；`#print axioms` 用来抓出证明里有没有偷用公理或留后门。',
    blocks: [
      {
        kind: 'p',
        text: '代码里写 `// TODO` 很常见，但没人会把 TODO 当成已完成。Lean 的 `sorry` 就是证明里的 TODO：它让任何命题「成立」，但会留下 `sorryAx` 的痕迹。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是你要证的结论。用 `sorry` 时目标会立刻消失，但输出区会告诉你这条证明依赖了 `sorryAx`。',
      },
      {
        kind: 'code',
        code: '#print axioms Nat.add_comm\n\n#check Classical.choice\n#check Classical.em',
      },
      {
        kind: 'p',
        text: '`#print axioms` 会列出定理依赖的公理。核心算术定理通常不依赖任何公理。',
      },
      { kind: 'code', code: 'theorem cheat : 1 = 2 := by\n  sorry\n\n#print axioms cheat' },
      {
        kind: 'p',
        text: '`sorry` 会生成 `sorryAx`，让任何命题「成立」。它适合草稿，不适合交付。',
      },
      {
        kind: 'goal',
        text: "证明开始：⊢ 1 = 2\n执行 sorry：没有剩余目标（但生成警告与 sorryAx 公理依赖）\n执行 #print axioms cheat：输出 'cheat' depends on axioms: [sorryAx]",
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `cheat` 里的 `sorry` 换成 `rfl`，看 `1 = 2` 为什么证不出来。这个错误正是 `sorry` 帮你掩盖的东西。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么核心算术定理不依赖公理？',
        text: '`Nat.add_comm` 这类定理是从归纳定义和递归函数直接算出来的，不需要额外假设。`Classical.choice` 和 `Classical.em` 才是需要显式接受的公理；用它们会出现在 `#print axioms` 的输出里。',
      },
      {
        kind: 'note',
        text: '一句话带走：交付前搜一遍 `sorry`，再跑 `#print axioms`；看到 `sorryAx` 就说明有坑没填。',
      },
    ],
    exercise: {
      title: '练习',
      body: '用 `#print axioms` 检查 `my_em`：先保留 `sorry` 看它依赖 `sorryAx`，再把它换成真正的证明。',
      hint: '`my_em` 就是排中律；把 `sorry` 换成 `Classical.em P`，再跑 `#print axioms my_em` 看公理清单。',
      cta: '在编辑器中动手',
      starter: 'theorem my_em (P : Prop) : P ∨ ¬ P := by\n  sorry\n\n#print axioms my_em\n',
    },
  },
  {
    slug: 'math-mathlib',
    track: 'math',
    navTitle: '22 · 走进 Mathlib 生态',
    title: '从浏览器沙盒走进真实 Mathlib 生态',
    lead: '讲清本站内置标准库的边界，以及本地安装完整工具链的平滑过渡路线。',
    blocks: [
      {
        kind: 'p',
        text: '本站像一台预装好基础库的浏览器 IDE：打开就能写，但只带 Init，外加可选的 Std 和 Batteries。等你需要集合、数论、代数、分析时，就该把代码搬到本地 Mathlib 项目。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是本站能证的东西。看到课程里的 `Even`、`Prime`、`IsGcd`，先记住它们只是迷你版；Mathlib 里有工业级实现。',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\n#check Even\n#check Nat.gcd\n#check List.length',
      },
      {
        kind: 'p',
        text: '课程里的 `Even`、`Prime`、`IsGcd`、`Set`、`Injective`、`Sorted`，在 Mathlib 里都有工业级版本。',
      },
      {
        kind: 'code',
        code: '#check Nat.gcd_dvd_left\n#check Nat.dvd_gcd\n#check List.mem_append',
      },
      {
        kind: 'p',
        text: '对照表：`Even` / `Odd`、`Nat.Prime`、`Nat.gcd`、`Set`、`Function.Injective`、`List.Perm` 分别是这些概念的 Mathlib 名字。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ ∃ k, 4 = 2 * k\n提供 witness 2：⊢ 4 = 2 * 2\nrfl 收尾：没有剩余目标（#check 只查询类型，不产生目标）',
      },
      {
        kind: 'note',
        text: '动手跑一次：在本站写 `#check Nat.Prime`，看它是否存在；再到本地 Mathlib 项目里跑同一行，体会「标准库边界」到底在哪。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '课程的迷你库和 Mathlib 差在哪？',
        text: '课程的迷你库只保留证明所需的最小定义，名字和 Mathlib 接近但不保证兼容；Mathlib 有完整的类型类、实例、引理命名规范和自动化策略。过渡时优先按概念找名字，而不是逐字复制课程代码。',
      },
      {
        kind: 'note',
        text: '一句话带走：本站练手感和证明思路，真实工程和数学研究搬到本地 Mathlib。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `even_four`，再用 `#check` 对比 `List.mem_append` 与 `Nat.gcd_dvd_left` 在本地 Mathlib 里的对应名字。',
      hint: '`even_four` 的 witness 取 2；`#check` 只查名字，不会产生证明目标。',
      cta: '在编辑器中动手',
      starter:
        'theorem even_four : ∃ k, 4 = 2 * k := by\n  sorry\n\n#check List.mem_append\n#check Nat.gcd_dvd_left\n',
    },
  },
  {
    slug: 'eng-hashmap',
    track: 'eng',
    navTitle: '23 · HashMap 存在性证明',
    title: '告别 KeyNotFound 与运行期 Panic：HashMap 的编译期存在性证明',
    lead: '把「这个 key 一定在表里」从一句注释，变成编译器能检查的证明。',
    requires: ['std'],
    blocks: [
      {
        kind: 'p',
        text: '后端代码里最常见的运行期事故之一，是 `map.get(key)` 拿到空值后继续用，最后在很远的地方 panic。Lean 的 `HashMap` 允许你随身携带一条 `k ∈ m` 的证明，取值时直接把它交给编译器。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是 `k ∈ m.insert k v`。`∈` 在 HashMap 上就是「contains 返回 true」；`⊢` 上面暂时没有假设，所以第一步是把插入和成员关系对应起来。',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\ndef scores : HashMap String Nat :=\n  (∅ : HashMap String Nat).insert "alice" 90 |>.insert "bob" 85\n\n#check scores',
      },
      {
        kind: 'p',
        text: '`scores["alice"]?` 用的是安全取值：返回 `Option`，不会 panic。先跑一眼，确认插入后能查到。',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\ndef scores : HashMap String Nat :=\n  (∅ : HashMap String Nat).insert "alice" 90 |>.insert "bob" 85\n\n#eval scores["alice"]?',
      },
      {
        kind: 'p',
        text: '插完立刻查自己，结果一定是 `some v`。这条引理是后面所有「插入后一定存在」证明的地基。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ (m.insert k v)[k]? = some v\nsimp 展开 HashMap 的查找与插入规则\n条件 k == k 为真，目标关闭',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\ntheorem lookup_after_insert (m : HashMap Nat Nat) (k v : Nat) :\n    (m.insert k v)[k]? = some v := by\n  simp',
      },
      {
        kind: 'p',
        text: '成员关系也能直接证：`k ∈ m.insert k v` 成立，因为插入的 key 一定在结果里。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ k ∈ m.insert k v\nrw [HashMap.mem_insert]\n目标变成 k = k ∨ k ∈ m\n左边直接成立',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\ntheorem mem_after_insert (m : HashMap Nat Nat) (k v : Nat) :\n    k ∈ m.insert k v := by\n  simp [HashMap.mem_insert]',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `HashMap.mem_insert` 换成 `HashMap.getElem?_insert_self`，看 Lean 为什么说这条引理的类型对不上。成员关系和查找结果不是同一回事。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么不直接用 get! ？',
        text: '`m[k]!` 在 key 不存在时会 panic，只是把运行期风险藏得更深。先证明 `k ∈ m`，再用 `m[k]` 或携带证明的取值方式，才能把风险前移到编译期。',
      },
      {
        kind: 'p',
        text: "把 `k ∈ m` 写进函数签名，取值时用 `m[k]'h`：编译器要求每个调用点都先交出成员证明，`KeyNotFound` 这类运行期 panic 在类型检查阶段就没了。",
      },
      {
        kind: 'code',
        code: "import Std.Data.HashMap\n\nopen Std\n\ndef safeGet (m : HashMap Nat Nat) (k : Nat) (h : k ∈ m) : Nat := m[k]'h\n\ndef scores : HashMap Nat Nat := (∅ : HashMap Nat Nat).insert 1 42\n\nexample : safeGet scores 1 (by simp [scores]) = 42 := by\n  simp [safeGet, scores]",
      },
      {
        kind: 'note',
        text: '一句话带走：先证 `k ∈ m`，再取值；让「不可能发生」变成类型系统里的事实。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `k ∈ m.insert k v`，然后试着证明插入后 `(m.insert k v)[k]? = some v`。',
      hint: '成员关系用 `simp [HashMap.mem_insert]`；查找结果用 `simp` 就能关闭。注意两条定理说的不是同一件事。',
      cta: '在编辑器中动手',
      starter:
        'import Std.Data.HashMap\n\nopen Std\n\ntheorem mem_after_insert (m : HashMap Nat Nat) (k v : Nat) :\n    k ∈ m.insert k v := by\n  sorry\n\ntheorem lookup_after_insert (m : HashMap Nat Nat) (k v : Nat) :\n    (m.insert k v)[k]? = some v := by\n  sorry\n',
    },
  },
  {
    slug: 'eng-bitvec',
    track: 'eng',
    navTitle: '24 · 位运算与溢出防线',
    title: '位运算与整数溢出防线：BitVec / UInt64 边界验证',
    lead: '面向系统、协议、加密与合约开发者：让「这个掩码对所有输入都成立」变成定理。',
    blocks: [
      {
        kind: 'p',
        text: '写协议解析时，你会用 `x & 0xFF` 取低八位，用 `a + b` 拼长度字段。单元测试只能试几个值；Lean 可以证明这两类操作对所有输入都成立，或者明确要求你交出「不会溢出」的证明。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是位向量等式或溢出条件。位向量可以看成一排固定宽度的布尔值，`⊢` 上面是你已经拿到的宽度和边界假设。',
      },
      {
        kind: 'code',
        code: 'example (x : BitVec 8) : x &&& 0xFF#8 = x := by\n  apply BitVec.eq_of_toNat_eq\n  have h255 : (0xFF#8).toNat = 255 := by decide\n  rw [BitVec.toNat_and, h255]\n  have hpow : (255 : Nat) = 2 ^ 8 - 1 := by rfl\n  rw [hpow, Nat.and_two_pow_sub_one_eq_mod, Nat.mod_eq_of_lt x.isLt]',
      },
      {
        kind: 'p',
        text: '`x &&& 0xFF#8 = x`：8 位向量和全 1 掩码按位与，还是它自己。证明先转成自然数，再用「与 `2^8 - 1` 取与等于取模」的引理。',
      },
      { kind: 'code', code: 'example (x : BitVec 8) : x ||| 0#8 = x := by\n  ext i\n  simp' },
      {
        kind: 'p',
        text: '`x ||| 0#8 = x`：和全 0 按位或，什么也不改。这条用逐位展开 `ext i` 就能收掉。',
      },
      { kind: 'code', code: 'example : (0xF0 : BitVec 8) &&& 0x0F = 0 := by\n  decide' },
      {
        kind: 'p',
        text: '具体数值的掩码计算可以直接 `decide`：编译器会把所有位算一遍，确认 `0xF0 &&& 0x0F` 确实是 0。',
      },
      {
        kind: 'code',
        code: 'example (a b : UInt32) (h : a.toNat + b.toNat < 2^32) :\n    (a + b).toNat = a.toNat + b.toNat := by\n  rw [UInt32.toNat_add, Nat.mod_eq_of_lt h]',
      },
      {
        kind: 'p',
        text: '溢出防线：如果 `a.toNat + b.toNat < 2^32`，那么 `a + b` 不会回绕，`toNat` 和普通加法一致。这条证明就是「长度字段拼接不会溢出」的编译期保单。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ (a + b).toNat = a.toNat + b.toNat\nrw [UInt32.toNat_add]：把 UInt32 加法转成 Nat 加法再取模\nrw [Nat.mod_eq_of_lt h]：用 h 说明没有超过 2^32，取模是恒等\n目标关闭',
      },
      {
        kind: 'note',
        text: '动手跑一次：把溢出条件 `h` 改成 `a.toNat + b.toNat < 2^16`，看证明是否还能过；再把 `UInt32` 换成 `UInt8`，体会宽度对边界的影响。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么不用 bv_decide？',
        text: '`bv_decide` 会把位向量问题编成 SAT 再求解，遇到大宽度或复杂表达式时在浏览器 WASM 里可能很慢甚至超时。本站课程改用 `decide`、`rw` 和 `Nat` 引理，结果一样可检查，但更可控。',
      },
      {
        kind: 'note',
        text: '一句话带走：位掩码恒等式可以逐位证或转成 Nat 证；溢出防护要把「不超过宽度」写成显式前提。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `no_overflow`：32 位加法在 `a.toNat + b.toNat < 2^32` 时不会回绕。',
      hint: '`rw [UInt32.toNat_add, Nat.mod_eq_of_lt h]`；先确认 `h` 的方向和 `Nat.mod_eq_of_lt` 需要的条件一致。',
      cta: '在编辑器中动手',
      starter:
        'theorem no_overflow (a b : UInt32) (h : a.toNat + b.toNat < 2^32) :\n    (a + b).toNat = a.toNat + b.toNat := by\n  sorry\n',
    },
  },
  {
    slug: 'eng-rbmap',
    track: 'eng',
    navTitle: '25 · 有序树 TreeMap',
    title: '不只是玩具链表：有序树 TreeMap 实战',
    lead: '工业级 `O(log n)` 有序映射，插入后查找的正确性也能写成定理。',
    requires: ['std'],
    blocks: [
      {
        kind: 'p',
        text: '`HashMap` 查找快，但遍历顺序不稳定；需要按 key 排序输出时，你会换 `TreeMap`（红黑树）。`Std.TreeMap` 就是 Lean 标准库里的有序映射，插入和查找都是对数复杂度。',
      },
      {
        kind: 'note',
        text: '说明：本站的 Batteries 分包没有携带 `Batteries.Data.RBMap`，所以这门课用标准库的 `Std.TreeMap`。两者的接口和证明套路基本一致；在本地完整工具链里，把 import 换成 `Batteries.Data.RBMap` 即可。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是「插入后马上查」的等式。`⊢` 上面是树的比较函数和已有内容；证明只需要展开插入规则。',
      },
      {
        kind: 'code',
        code: 'import Std.Data.TreeMap\n\nopen Std\n\ndef prices : TreeMap Nat String compare :=\n  TreeMap.empty.insert 3 "c" |>.insert 1 "a" |>.insert 2 "b"\n\n#check prices',
      },
      {
        kind: 'p',
        text: '先建一棵小树并查一个 key。`#eval` 会按比较函数找到对应节点，输出 `some "b"`。',
      },
      {
        kind: 'code',
        code: 'import Std.Data.TreeMap\n\nopen Std\n\ndef prices : TreeMap Nat String compare :=\n  TreeMap.empty.insert 3 "c" |>.insert 1 "a" |>.insert 2 "b"\n\n#eval prices.get? 2',
      },
      {
        kind: 'p',
        text: '插入 `k` 后立刻查 `k`，一定拿到刚插入的 `v`。这条定理对任意树、任意 key 都成立，和树的平衡细节无关。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ (t.insert k v)[k]? = some v\nsimp 展开 TreeMap 的 getElem? 与 insert\n比较 k k 得到相等，目标关闭',
      },
      {
        kind: 'code',
        code: 'import Std.Data.TreeMap\n\nopen Std\n\ntheorem tree_lookup_after_insert (t : TreeMap Nat Nat compare) (k v : Nat) :\n    (t.insert k v)[k]? = some v := by\n  simp',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `t.insert k v` 里的 `k` 改成 `k + 1`，看查找结果为什么变成 `none` 或旧值。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'TreeMap 和 HashMap 怎么选？',
        text: '只看单点查找，`HashMap` 平均更快；需要按 key 顺序遍历、范围查询、稳定输出时，`TreeMap` 更合适。两者的「插入后能查到」证明套路几乎一样，差别在底层结构。',
      },
      {
        kind: 'note',
        text: '一句话带走：`TreeMap` 用比较函数维持顺序；插入后查自己，永远能查到。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明 `lookup_after_insert`：`TreeMap` 插入后立刻查找能拿到刚插入的值。',
      hint: '直接 `simp`；如果卡住，先 `#check TreeMap.getElem?_insert` 看插入规则长什么样。',
      cta: '在编辑器中动手',
      starter:
        'import Std.Data.TreeMap\n\nopen Std\n\ntheorem lookup_after_insert (t : TreeMap Nat Nat compare) (k v : Nat) :\n    (t.insert k v)[k]? = some v := by\n  sorry\n',
    },
  },
  {
    slug: 'eng-array-bounds',
    track: 'eng',
    navTitle: '26 · 消除数组越界',
    title: '消除数组越界：把 `i < arr.size` 写进函数签名',
    lead: '把边界条件从运行期 if 检查，前移到函数签名和证明里。',
    blocks: [
      {
        kind: 'p',
        text: '数组越界是后端和系统代码的经典事故：`arr[i]` 在 `i >= size` 时直接崩。Lean 的 `Array` 提供带下标的取值，也提供把「下标合法」作为参数的版本；只要签名里有 `i < arr.size`，调用者就必须先证明这一点。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是「安全取值一定拿得到值」。`⊢` 上面是 `h : i < arr.size`，这就是裁判认可的边界证据。',
      },
      {
        kind: 'code',
        code: 'theorem getElem?_eq_some {α} (arr : Array α) (i : Nat) (h : i < arr.size) :\n    arr[i]? = some arr[i] :=\n  Array.getElem?_eq_getElem (xs := arr) (i := i) h',
      },
      {
        kind: 'p',
        text: '`getElem?_eq_some` 把「下标合法」翻译成「安全取值返回 `some`」。它不是运行时检查，而是一条对任意数组都成立的定理。',
      },
      {
        kind: 'code',
        code: 'theorem getElem?_eq_some {α} (arr : Array α) (i : Nat) (h : i < arr.size) :\n    arr[i]? = some arr[i] :=\n  Array.getElem?_eq_getElem (xs := arr) (i := i) h\n\ntheorem getElem?_isSome (arr : Array Nat) (i : Nat) (h : i < arr.size) :\n    (arr[i]?).isSome = true := by\n  rw [getElem?_eq_some arr i h]\n  rfl',
      },
      {
        kind: 'p',
        text: '有了上一条，`isSome` 也一定是 `true`：先重写成 `some arr[i]`，再 `rfl`。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ (arr[i]?).isSome = true\nrw [getElem?_eq_some arr i h]：把安全取值换成 some arr[i]\n目标变成 (some arr[i]).isSome = true\nrfl 收尾',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `h : i < arr.size` 改成 `h : i ≤ arr.size`，看哪一步开始过不去。边界放宽一格，证明立刻失效。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么不用 get! ？',
        text: '`arr[i]!` 越界会 panic，和 `HashMap` 的 `get!` 一样，只是把风险推迟到运行期。带 `i < arr.size` 的取值把检查交给调用者，编译器帮你确保每个调用点都做过检查。',
      },
      {
        kind: 'note',
        text: '一句话带走：把 `i < arr.size` 写进签名，让越界在编译期就过不去。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明下标合法时 `arr[i]?` 一定是 `some`。',
      hint: '先 `rw [Array.getElem?_eq_getElem (xs := arr) (i := i) h]`，再 `rfl`。',
      cta: '在编辑器中动手',
      starter:
        'theorem getElem?_isSome (arr : Array Nat) (i : Nat) (h : i < arr.size) :\n    (arr[i]?).isSome = true := by\n  sorry\n',
    },
  },
  {
    slug: 'eng-state-machine',
    track: 'eng',
    navTitle: '27 · 状态机与账本守恒',
    title: '状态机与账本守恒：用 HashMap 验证核心业务不变量',
    lead: '用 `structure` 和 `HashMap` 建一个极简账本，证明任意合法转账下总余额守恒。',
    requires: ['std'],
    blocks: [
      {
        kind: 'p',
        text: '支付系统最怕「转着转着钱多了或少了」。单元测试只能跑几笔转账；我们把账本写成 `HashMap`，把 `transfer` 写成状态转移函数，再证明「总余额守恒」对所有合法输入都成立。',
      },
      {
        kind: 'p',
        text: '右侧 `⊢` 下面是守恒等式。`⊢` 上面有 `h : src ≠ dst`（两个账户不同）和 `hbal : amt ≤ balance m src`（余额够扣），这两条就是「合法转账」的定义。',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\n#eval balance (∅ : Ledger) 1',
      },
      {
        kind: 'p',
        text: '账本就是一个 `HashMap Nat Nat`，`balance` 用 `getD` 读取，缺失的账户按 0 处理。',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\ndef transfer (m : Ledger) (src dst amt : Nat) : Ledger :=\n  (m.insert src (balance m src - amt)).insert dst (balance m dst + amt)\n\n#eval balance (transfer (∅ : Ledger) 1 2 10) 2',
      },
      {
        kind: 'p',
        text: '`transfer` 先从源账户扣钱，再给目标账户加钱。注意用的是 `Nat` 减法：余额不足时会截断到 0，所以后面必须显式假设 `amt ≤ balance m src`。',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\ndef transfer (m : Ledger) (src dst amt : Nat) : Ledger :=\n  (m.insert src (balance m src - amt)).insert dst (balance m dst + amt)\n\ntheorem balance_src_after_transfer (m : Ledger) (src dst amt : Nat) (h : src ≠ dst) :\n    balance (transfer m src dst amt) src = balance m src - amt := by\n  simp [transfer, balance, HashMap.getD_insert, h.symm]',
      },
      {
        kind: 'p',
        text: '先证「源账户扣完之后就是旧余额减 amt」。这一步只需要展开插入和查找规则，再用 `src ≠ dst` 排除查错账户。',
      },
      {
        kind: 'code',
        code: "import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\ndef transfer (m : Ledger) (src dst amt : Nat) : Ledger :=\n  (m.insert src (balance m src - amt)).insert dst (balance m dst + amt)\n\ntheorem total_conserved (m : Ledger) (src dst amt : Nat) (h : src ≠ dst)\n    (hbal : amt ≤ balance m src) :\n    balance (transfer m src dst amt) src + balance (transfer m src dst amt) dst\n      = balance m src + balance m dst := by\n  simp [transfer, balance, HashMap.getD_insert, h.symm]\n  have hbal' : amt ≤ m.getD src 0 := hbal\n  rw [← Nat.add_assoc, Nat.add_right_comm, Nat.sub_add_cancel hbal']",
      },
      {
        kind: 'p',
        text: '再证总余额守恒：源账户减去 amt，目标账户加上 amt，两边一抵消，总和不变。',
      },
      {
        kind: 'goal',
        text: '证明开始：⊢ balance (transfer m src dst amt) src + balance (transfer m src dst amt) dst\n        = balance m src + balance m dst\nsimp 展开 transfer、balance 和 getD_insert，用 h.symm 排除同账户\n目标变成 (balance m src - amt) + (balance m dst + amt) = ...\n用加法结合律和 Nat.sub_add_cancel hbal 收尾',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\ndef transfer (m : Ledger) (src dst amt : Nat) : Ledger :=\n  (m.insert src (balance m src - amt)).insert dst (balance m dst + amt)\n\ntheorem balance_nonneg (m : Ledger) (k : Nat) : 0 ≤ balance m k := Nat.zero_le _',
      },
      {
        kind: 'p',
        text: '余额非负是 `Nat` 自带的：它没有负数。这里把它也写成一条定理，提醒读者「选 Nat 而不是 Int」本身就是一个业务决定。',
      },
      {
        kind: 'note',
        text: '动手跑一次：把 `hbal : amt ≤ balance m src` 删掉，看守恒证明在哪一步断掉；再把 `Nat` 换成 `Int`，观察「余额非负」是否还需要额外证明。',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: '为什么不用一个 total 字段？',
        text: '真正的账本通常还会有审计总额字段，但那是冗余数据：它必须和所有账户余额保持一致，维护成本更高。这里选择从账户余额推导总额，证明一次守恒，就不需要额外同步。',
      },
      {
        kind: 'note',
        text: '一句话带走：状态机的不变量要写成定理；合法转移的前提（不同账户、余额够扣）要显式写进签名。',
      },
    ],
    exercise: {
      title: '练习',
      body: '证明任意合法转账下总余额守恒。',
      hint: '先 `simp [transfer, balance, HashMap.getD_insert, h.symm]`，再用 `Nat.add_assoc`、`Nat.add_right_comm` 和 `Nat.sub_add_cancel hbal` 收尾。',
      cta: '在编辑器中动手',
      starter:
        'import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\ndef transfer (m : Ledger) (src dst amt : Nat) : Ledger :=\n  (m.insert src (balance m src - amt)).insert dst (balance m dst + amt)\n\ntheorem total_conserved (m : Ledger) (src dst amt : Nat) (h : src ≠ dst)\n    (hbal : amt ≤ balance m src) :\n    balance (transfer m src dst amt) src + balance (transfer m src dst amt) dst\n      = balance m src + balance m dst := by\n  sorry\n',
    },
  },
];
