import type { Messages } from './types';

export const zh: Messages = {
  nav: {
    home: '首页',
    lesson: '入门课',
    playground: '编辑器',
    github: 'GitHub',
    reference: '速查表',
  },
  theme: {
    label: '主题',
    light: '亮色',
    dark: '暗色',
    system: '跟随系统',
  },
  language: {
    label: '语言',
  },
  settings: {
    label: '设置',
    title: '偏好设置',
    autoStart: '打开编辑器页时自动下载 Lean',
    autoStartHint: '关闭后需要手动点「启动 Lean」。首次下载约 102MB，只在你的浏览器里缓存。',
    clearCache: '清理运行时缓存',
    clearCacheHint: '删除已下载的 Lean 运行时（约 102MB），下次启动会重新下载。',
    clearCacheBusy: '清理中…',
    clearCacheDone: '已清理，下次启动会重新下载运行时。',
    clearCacheFailed: '清理失败，请稍后重试。',
  },
  home: {
    eyebrow: 'Lean 4 · WebAssembly · 浏览器内 LSP',
    title: '在浏览器里学 Lean 4',
    lead: '真正的 Lean 语言服务器跑在 Web Worker 里。写代码、看诊断、读 Goal，不需要安装工具链，也没有后端。',
    ctaPrimary: '从第一课开始',
    continueCta: '继续学习',
    ctaSecondary: '直接打开编辑器',
    featuresTitle: '和在线沙盒有什么不同',
    features: [
      {
        title: '真编译器，不是模拟',
        body: 'Lean 4.34.1 的 Init 运行时编译为 WebAssembly，解析、精化、诊断全部在浏览器里完成。',
      },
      {
        title: '诊断与 Goal 实时反馈',
        body: '停止输入后 LSP 推送诊断；光标停在证明内部，右侧立刻显示当前目标。',
      },
      {
        title: '一次下载，长期可用',
        body: '约 102MB 运行时由站点同源网关从 Cloudflare R2 按 4MB 分片并行下发并做 SHA-256 校验，网关故障时回退镜像或同源静态副本，之后走持久缓存。',
      },
      {
        title: '开源双协议',
        body: 'Apache-2.0 或 MulanPSL-2.0，任选其一，源码与构建流程都在仓库里。',
      },
    ],
    limitsTitle: '当前边界',
    limitsBody:
      '只内置 Init，不含 Std / Lean / Lake / Mathlib，所以课程内容限定在基础类型、List 与命题逻辑。需要 cross-origin isolation，Chromium 系浏览器体验最佳。',
    courseTitle: '第一课：认识 Lean',
    courseBody:
      '先弄明白 Lean 是什么、这门课为什么只用 Init，再从 #check 和 #eval 一路走到第一个归纳证明。',
    courseCta: '开始学习',
    pathsTitle: '两条学习路径',
    pathMeta: (count) => `${count} 节课`,
  },
  lesson: {
    eyebrow: 'Lean 4 入门',
    tocTitle: '课程目录',
    tracks: {
      intro: {
        title: '入门路径',
        lead: '从 #eval 到归纳法，先把 Lean 的写法和常用证明套路用熟。',
      },
      math: {
        title: '数学与验证',
        lead: '从整除、奇偶到集合与算法正确性，用 Lean 把数学定义写成可检查的代码。',
      },
    },
    prev: '上一篇',
    next: '下一篇',
    runInEditor: '运行',
    goalLabel: 'Goal 变化',
    hintLabel: '提示',
    runCrashed: '运行失败：Lean 进程可能已崩溃，代码已保留。',
    restartLean: '重启 Lean',
    restarting: '正在重启…',
    restartDone: '已重启，请再点一次「运行」',
    restartFailed: '重启失败，请刷新页面后重试',
    completedLabel: '已完成',
    exerciseCompletionHint:
      '保留题目中的定理名、删掉所有 sorry 且没有错误后，本课会自动标记为已完成。',
    completedCount: (done, total) => `已完成 ${done} / ${total}`,
    running: '运行中…',
    noOutput: '没有错误，也没有输出',
    proofAccepted: '证明通过 · Lean 已接受，没有待证目标',
    editorHint:
      '右侧是真实编辑器。打开本页会自动开始加载 Lean，完成后改动代码即可看到诊断与 Goal。',
    lessons: [
      {
        slug: 'what-is-lean',
        navTitle: '01 · 认识 Lean',
        title: 'Lean 是什么',
        lead: '在写第一行证明之前，先搞清楚 Lean 能做什么，以及这门课为什么只用 Init。',
        blocks: [
          {
            kind: 'p',
            text: 'Lean 既是一门编程语言，也是一个交互式定理证明器。你可以在同一个文件里计算 2 + 3，也可以证明「对所有自然数 a、b，a + b = b + a」。',
          },
          { kind: 'code', code: '#eval 2 + 3' },
          {
            kind: 'p',
            text: 'Lean 里最反直觉的一句话是：命题也是类型，证明就是这个类型的一个元素。现在先记住它，第 2 节会正式展开。',
          },
          { kind: 'code', code: '#check Nat.add' },
          {
            kind: 'p',
            text: '先看一个最小的证明。等式在 Lean 里是一个类型，rfl 则是「两边按定义算出来完全一样」的证明。',
          },
          { kind: 'code', code: 'example : 2 + 2 = 4 := rfl' },
          {
            kind: 'goal',
            text: '证明开始：⊢ 2 + 2 = 4\n执行 rfl：没有剩余目标\n\nrfl 不是魔法，它只是把两边都算到同一个值。',
          },
          {
            kind: 'details',
            summary: '为什么这里不用写 by？',
            text: 'rfl 本身就是一个证明项，可以直接接在 := 后面。只有需要多步策略时，才写 := by 再换行。两种写法等价，后者更适合展示中间过程。',
          },
          {
            kind: 'note',
            text: '这门课只带 Init——Lean 自带的基础库。没有 Std、Lean、Lake 或 Mathlib，所以后面的代码里不会出现 import Mathlib。',
          },
          {
            kind: 'p',
            text: '编辑器完整地跑在你的浏览器里：首次需要下载约 102MB 运行时，之后会缓存；代码不会上传到任何服务器。',
          },
        ],
        exercise: {
          title: '练习',
          body: '把 #eval 的算式换成你喜欢的；再把 six_seven 里的 sorry 换成 rfl，看 GOAL 面板如何从 ⊢ 6 * 7 = 42 变成没有目标。',
          hint: '#eval 看值，#check 看类型；six_seven 用 rfl 就能关闭。把 6 改成 5，Lean 会立刻报错，改回来又通过。',
          cta: '在编辑器中动手',
          starter: '#eval 6 * 7\n#check Nat.mul\n\ntheorem six_seven : 6 * 7 = 42 := by\n  sorry\n',
        },
      },
      {
        slug: 'first-proof',
        navTitle: '02 · 先让 Lean 说句话',
        title: '先让 Lean 说句话',
        lead: '从零开始：看 Lean 怎么求值，读懂一条命题，再亲手证一条等式。',
        blocks: [
          {
            kind: 'p',
            text: 'Lean 既是一门编程语言，也是一个交互式定理证明器。先用 #check 看一个名字的类型，用 #eval 直接求值。',
          },
          { kind: 'code', code: '#check Nat.add\n#eval 2 + 3' },
          {
            kind: 'note',
            text: '点「运行」后，输出区会先给出 Nat.add 的类型，再给出 #eval 的求值结果。本节的目标，就是分清哪一行是类型、哪一行是值。',
          },
          {
            kind: 'p',
            text: '在 Lean 里，「2 + 2 = 4」是一个类型，而证明就是这个类型的一个元素。等式两边能靠计算化成同一个表达式时，rfl 就能直接给出证明。',
          },
          {
            kind: 'code',
            code: '#check (2 + 2 = 4)\nexample : 2 + 2 = 4 := rfl',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ 2 + 2 = 4\n执行 rfl：没有剩余目标\n\n#check 那一行只是在问「这个命题是什么类型」，不会产生证明目标。',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'rfl 表示「由定义直接成立」。它只能关闭计算型等式，遇到需要推理的命题就要换策略。',
          },
          {
            kind: 'details',
            summary: '为什么 rfl 证不了 0 + a = a？',
            text: 'Nat.add 是对第二个参数递归定义的：a + 0 直接化成 a，所以 a + 0 = a 是定义相等；但 0 + a 在 a 是变量时卡住了，只能对 a 做归纳。第 05 节会把这个区别讲透。',
          },
        ],
        exercise: {
          title: '练习',
          body: '把 #eval 2 + 3 改成你喜欢的算式，再把 two_add_two 的 sorry 换成 rfl。',
          hint: '先 #check 看类型，再 #eval 看值；two_add_two 用 := by 展开后，rfl 直接由计算关闭目标。',
          cta: '在编辑器中动手',
          starter:
            '#check Nat.mul\n#eval 6 * 7\n\ntheorem two_add_two : 2 + 2 = 4 := by\n  sorry\n',
        },
      },
      {
        slug: 'implication',
        navTitle: '03 · 蕴含与函数',
        title: '命题即类型',
        lead: '「如果 P 那么 Q」在 Lean 里就是一个函数类型。理解这一点，证明思路会立刻清楚。',
        blocks: [
          {
            kind: 'p',
            text: '在类型论里，命题和类型是同一件事：类型 P 有元素，就意味着命题 P 成立；而这个元素，就是 P 的证明。',
          },
          {
            kind: 'p',
            text: '于是「P 蕴含 P」就是「从 P 出发得到 P 的函数」。证明它，等价于写一个恒等函数。',
          },
          {
            kind: 'code',
            code: 'theorem id_imp (P : Prop) : P → P := by\n  intro h\n  exact h',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ P → P\n执行 intro h：h : P ⊢ P\n执行 exact h：没有剩余目标',
          },
          {
            kind: 'note',
            text: 'intro h 把目标 P → P 变成「已有假设 h : P，要证 P」；exact h 直接用这个假设交差。',
          },
          {
            kind: 'p',
            text: '蕴含可以串起来。两个箭头接在一起，就是把第一个的输出喂给第二个。',
          },
          {
            kind: 'code',
            code: 'theorem trans_imp (P Q R : Prop) (h1 : P → Q) (h2 : Q → R) : P → R := by\n  intro hp\n  exact h2 (h1 hp)',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ P → R\n执行 intro hp：hp : P ⊢ R\n把 hp 喂给 h1：得到 h1 hp : Q\n再把结果喂给 h2：得到 h2 (h1 hp) : R，目标关闭',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: '如果目标形如 P → Q，第一步几乎总是 intro。不 intro 直接想，很容易卡住。',
          },
          {
            kind: 'details',
            summary: 'intro 到底做了什么？',
            text: '目标 P → Q 是一个函数类型。intro h 相当于「假设给我一个 P 的证明，我叫它 h」，然后目标只剩 Q。它不是证明假设 P，而是把箭头左边变成新的已知条件。',
          },
        ],
        exercise: {
          title: '练习',
          body: '证明 (P → Q) → (Q → R) → P → R，也就是把 trans_imp 的前提写成箭头形式。',
          hint: '目标全是箭头，先连续 intro，把 (P → Q)、(Q → R) 和 P 都拿进来；最后把第一个前提的输出喂给第二个前提。',
          cta: '在编辑器中动手',
          starter: 'theorem chain (P Q R : Prop) : (P → Q) → (Q → R) → P → R := by\n  sorry\n',
        },
      },
      {
        slug: 'connectives',
        navTitle: '04 · 合取与析取',
        title: '与、或怎么拆',
        lead: '∧ 和 ∨ 各有两条规则：怎么构造它，怎么使用它。记住这四个动作就够了。',
        blocks: [
          {
            kind: 'p',
            text: '要证明 P ∧ Q，需要同时给出 P 的证明和 Q 的证明。⟨hp, hq⟩ 是 And.intro 的简写。',
          },
          {
            kind: 'code',
            code: 'theorem and_self (P Q : Prop) (hp : P) (hq : Q) : P ∧ Q := ⟨hp, hq⟩',
          },
          {
            kind: 'p',
            text: '反过来，手里有 h : P ∧ Q 时，h.1 给出 P，h.2 给出 Q。',
          },
          {
            kind: 'code',
            code: 'theorem and_comm (P Q : Prop) : P ∧ Q → Q ∧ P := by\n  intro h\n  exact ⟨h.2, h.1⟩',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ P ∧ Q → Q ∧ P\n执行 intro h：h : P ∧ Q ⊢ Q ∧ P\n取 h.2 和 h.1：得到 Q 与 P 的证明\n用 ⟨h.2, h.1⟩ 打包：没有剩余目标',
          },
          {
            kind: 'p',
            text: '析取麻烦一点：要证 P ∨ Q，只需给出其中一边，用 Or.inl 或 Or.inr。要使用 P ∨ Q，则必须分两种情况讨论，这就是 cases。',
          },
          {
            kind: 'code',
            code: 'theorem or_comm (P Q : Prop) : P ∨ Q → Q ∨ P := by\n  intro h\n  cases h with\n  | inl hp => exact Or.inr hp\n  | inr hq => exact Or.inl hq',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ P ∨ Q → Q ∨ P\n执行 intro h：h : P ∨ Q ⊢ Q ∨ P\n分支 inl hp：hp : P ⊢ Q ∨ P，用 Or.inr hp\n分支 inr hq：hq : Q ⊢ Q ∨ P，用 Or.inl hq',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: '构造用 inl / inr，使用用 cases。方向搞反是最常见的卡点：手里有「或」就想直接取，是不行的。',
          },
          {
            kind: 'details',
            summary: '为什么不能直接 exact h？',
            text: 'h 的类型是 P ∨ Q，而目标是 Q ∨ P。两边不是同一个类型，Lean 不接受。必须 cases 把 h 拆成两种情况，分别构造对方需要的那个分支。',
          },
        ],
        exercise: {
          title: '练习',
          body: '证明 (P ∧ Q) → (Q ∧ P) 的析取版本：(P ∨ Q) → (Q ∨ P) 你已经见过了，试试 (P ∧ Q) ∨ R → P ∨ R。',
          hint: '先 intro，再 cases 假设。(P ∧ Q) 分支取左边再用 Or.inl；R 分支直接 Or.inr。两个分支都要给出 P ∨ R。',
          cta: '在编辑器中动手',
          starter: 'theorem or_and (P Q R : Prop) : (P ∧ Q) ∨ R → P ∨ R := by\n  sorry\n',
        },
      },
      {
        slug: 'induction',
        navTitle: '05 · 归纳法',
        title: '用 induction 证明交换律',
        lead: '加法交换律不能靠展开算出来，需要对其中一个参数做归纳。这是 Lean 里最重要的证明模式。',
        blocks: [
          {
            kind: 'p',
            text: '先记住一个容易混淆的细节：Nat.add 是对第二个参数递归定义的。a + 0 直接化成 a，所以 a + 0 = a 是定义相等；但 0 + a 在 a 是变量时卡住了，这就是为什么一个 rfl 能证，另一个必须归纳。',
          },
          {
            kind: 'code',
            code: 'example (a : Nat) : a + 0 = a := rfl\n\nexample (a : Nat) : 0 + a = a := by\n  induction a with\n  | zero => rfl\n  | succ a ih => simp [ih]',
          },
          {
            kind: 'goal',
            text: 'a + 0 = a：⊢ a + 0 = a，rfl 直接关闭\n\n0 + a = a：\nzero 分支：⊢ 0 + 0 = 0，rfl\nsucc 分支：ih : 0 + a = a\n           ⊢ 0 + Nat.succ a = Nat.succ a\n执行 simp [ih]：没有剩余目标',
          },
          {
            kind: 'p',
            text: '目标：对任意自然数 a、b，证明 a + b = b + a。直接展开做不完，需要对 a 做归纳。',
          },
          {
            kind: 'p',
            text: 'induction a with 把目标拆成两种情况：a = 0，以及 a = succ a 并附带归纳假设 ih。',
          },
          {
            kind: 'code',
            code: 'theorem add_comm (a b : Nat) : a + b = b + a := by\n  induction a with\n  | zero => simp\n  | succ a ih => simp only [Nat.succ_add, Nat.add_succ, ih]',
          },
          {
            kind: 'goal',
            text: 'induction a 前：⊢ a + b = b + a\nzero 分支：⊢ 0 + b = b + 0，simp 收尾\nsucc 分支：ih : a + b = b + a\n           ⊢ Nat.succ a + b = b + Nat.succ a\n执行 simp only [Nat.succ_add, Nat.add_succ, ih]：没有剩余目标',
          },
          {
            kind: 'note',
            text: 'zero 分支里 simp 把 0 + b 化简成 b；succ 分支里 Nat.succ_add 把 succ a + b 变成 succ (a + b)，再用归纳假设 ih 改写。',
          },
          {
            kind: 'p',
            text: '本节的目标是交换律 a + b = b + a。写完后想逐步看证明状态，点「在编辑器中动手」，把光标移到 by 块内部：Goal 面板第一行始终是这条定理要证的目标，下面的行才是当前这一步的状态。',
          },
          {
            kind: 'details',
            summary: '为什么 0 + a = a 不能 rfl？',
            text: 'rfl 要求两边在定义上相等。Nat.add 的模式匹配落在第二个参数上：a + 0 可以直接化简成 a；而 0 + a 的第二个参数是变量 a，Lean 不知道它到底是 0 还是 succ，只能停在这里。对 a 做归纳，就是把未知的 a 拆成 0 和 succ 两种情况，让定义继续化简。',
          },
        ],
        exercise: {
          title: '练习',
          body: '把 add_zero 自己写一遍，再尝试证明 zero_add：0 + a = a。两个 sorry 都需要你补上。',
          hint: 'add_zero 不需要归纳，直接 rfl；zero_add 对 a 归纳，zero 分支 rfl，succ 分支用归纳假设 ih。',
          cta: '在编辑器中动手',
          starter:
            'theorem add_zero (a : Nat) : a + 0 = a := by\n  sorry\n\ntheorem zero_add (a : Nat) : 0 + a = a := by\n  sorry\n',
        },
      },
      {
        slug: 'rewrite',
        navTitle: '06 · 改写与 rw',
        title: '用 rw 改写目标',
        lead: 'rfl 只能收掉定义上相等的目标；遇到需要替换的目标，就要用 rw 把等式喂进去。',
        blocks: [
          {
            kind: 'p',
            text: '证明等式时先看两边能不能靠计算变成同一个表达式：能，rfl 就够了；不能，就用一条已知等式去改写目标。',
          },
          {
            kind: 'code',
            code: 'theorem add_comm_rw (a b : Nat) : a + b = b + a := by\n  rw [Nat.add_comm]',
          },
          {
            kind: 'p',
            text: 'rw 默认把等式从左往右用：把目标里出现的左边换成右边。写成 rw [← h] 则反过来。',
          },
          {
            kind: 'code',
            code: 'theorem eq_swap (a b : Nat) (h : a = b) : b = a := by\n  rw [h]',
          },
          {
            kind: 'goal',
            text: '证明开始：h : a = b ⊢ b = a\n执行 rw [h]：把目标里的 a 换成 b，得到 ⊢ b = b\nrw 发现两边相同，自动用 rfl 关闭目标',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'rw 会重写目标中所有匹配的位置。只想改一处时，先想清楚是不是该换一种写法，别让一次 rw 改得面目全非。',
          },
          {
            kind: 'details',
            summary: '什么时候要写 rw [← h]？',
            text: 'rw [h] 默认把等式的左边换成右边。如果目标里的形式与等式右边一致、而你想换成左边，就要写 rw [← h] 反过来用。先 #check 看引理的方向，再决定箭头。',
          },
          {
            kind: 'code',
            code: 'theorem add_assoc_rw (a b c : Nat) : a + b + c = a + (b + c) := by\n  rw [Nat.add_assoc]',
          },
        ],
        exercise: {
          title: '练习',
          body: '用一条已有的乘法等式证明 a * 1 = a，只允许用 rw。',
          hint: '先 #check Nat.mul_one 看它的方向；如果和目标完全同向，一条 rw 就够了。',
          cta: '在编辑器中动手',
          starter: 'theorem mul_one_rw (a : Nat) : a * 1 = a := by\n  sorry\n',
        },
      },
      {
        slug: 'simp',
        navTitle: '07 · simp 与化简',
        title: '让 simp 收尾',
        lead: 'simp 是一组带索引的改写规则；用得好可以一行收掉计算型目标，用不好会把目标越化越远。',
        blocks: [
          {
            kind: 'p',
            text: 'simp 会自动应用库里标了 @[simp] 的等式。像 a + 0 = a 这种由定义直接可化的目标，一行 simp 就结束。',
          },
          {
            kind: 'code',
            code: 'theorem add_zero_simp (a : Nat) : a + 0 = a := by\n  simp',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ a + 0 = a\n执行 simp：化简到两边相同，没有剩余目标',
          },
          {
            kind: 'p',
            text: 'simp only 只使用你列出的引理，不额外展开任何东西，行为更可预测。',
          },
          {
            kind: 'code',
            code: 'theorem succ_add_simp (a b : Nat) : Nat.succ a + b = Nat.succ (a + b) := by\n  simp only [Nat.succ_add]',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'simp 是终结技：化简到 True 就结束。它不动的时候，说明目标需要引入、拆分或归纳，换回 intro / cases / induction。',
          },
          {
            kind: 'details',
            summary: 'rw 和 simp 到底怎么选？',
            text: 'rw 是精确替换：你指定哪条等式、哪个方向，适合目标结构清楚的最后一步；simp 是自动搜索：它按规则库扫一遍，适合收尾，但中间过程不透明。教学代码里优先用 simp only [ ... ]，把使用的引理写清楚，也避免在浏览器里出现过深的递归展开。',
          },
          {
            kind: 'code',
            code: 'theorem add_succ_simp (a b : Nat) : a + Nat.succ b = Nat.succ (a + b) := by\n  simp only [Nat.add_succ]',
          },
        ],
        exercise: {
          title: '练习',
          body: '把两个 0 一次化掉：a + 0 + 0 = a。',
          hint: '先试 rfl，观察它能不能靠定义直接关闭；如果不行，再用 simp only [Nat.add_zero]，不要一上来就全量 simp。',
          cta: '在编辑器中动手',
          starter: 'theorem add_zero_twice (a : Nat) : a + 0 + 0 = a := by\n  sorry\n',
        },
      },
      {
        slug: 'quantifiers',
        navTitle: '08 · 全称与存在',
        title: '∀ 与 ∃ 怎么用',
        lead: '∀ 是函数类型，∃ 是依赖对。前者给参数，后者拆见证。',
        blocks: [
          {
            kind: 'p',
            text: '命题 ∀ n : Nat, P n 的元素是一个函数：给它一个 n，它返回 P n 的证明。所以证明「对所有 n 成立」时，我们写 intro n 把 n 取进来。',
          },
          {
            kind: 'code',
            code: 'theorem forall_apply (P : Nat → Prop) (h : ∀ n, P n) : P 0 := h 0',
          },
          {
            kind: 'p',
            text: '∃ n, P n 则是一个包裹：一个具体的 n（见证）加上 P n 的证明。构造它用匿名构造子 ⟨n, 证明⟩。',
          },
          {
            kind: 'code',
            code: 'theorem exists_intro : ∃ n : Nat, n + n = 4 := ⟨2, rfl⟩',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ ∃ n, n + n = 4\n提供 witness 2：⊢ 2 + 2 = 4\nrfl 收尾：没有剩余目标',
          },
          {
            kind: 'p',
            text: '使用存在命题时必须拆开它：cases h with | intro n hn => ...，n 是见证，hn 是它满足性质。',
          },
          {
            kind: 'code',
            code: 'theorem exists_swap (P Q : Nat → Prop) (h : ∃ n, P n ∧ Q n) : ∃ n, Q n ∧ P n := by\n  cases h with\n  | intro n hn => exact ⟨n, hn.2, hn.1⟩',
          },
          {
            kind: 'goal',
            text: '证明开始：h : ∃ n, P n ∧ Q n ⊢ ∃ n, Q n ∧ P n\ncases h 后：n : Nat，hn : P n ∧ Q n ⊢ ∃ n, Q n ∧ P n\n用同一个 n 作为 witness：⊢ Q n ∧ P n\n取 hn.2 和 hn.1 打包：没有剩余目标',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: '这里的 intro 是拆存在量词，不是证明开头引入假设的那个 intro。名字一样，作用完全不同。',
          },
          {
            kind: 'details',
            summary: '∀ 和 ∃ 的记忆口诀',
            text: '证明 ∀ 用 intro（把任意元素拿进来），使用 ∀ 用应用（h 3）；证明 ∃ 用 witness（⟨n, 证明⟩），使用 ∃ 用 cases（把 witness 和性质拆出来）。四个动作正好两两对应。',
          },
        ],
        exercise: {
          title: '练习',
          body: '把「对所有 n 成立」用到 n = 3 上，证明 P 3。',
          hint: 'h 本身就是一个函数，直接把 3 应用上去；这里不需要 intro，也不需要 cases。',
          cta: '在编辑器中动手',
          starter: 'theorem forall_three (P : Nat → Prop) (h : ∀ n, P n) : P 3 := by\n  sorry\n',
        },
      },
      {
        slug: 'list-structure',
        navTitle: '09 · List 与 structure',
        title: '归纳类型与结构',
        lead: 'List 的归纳和 Nat 一样，只是构造子从 zero/succ 换成了 nil/cons；structure 则把几个值打包成一个新类型。',
        blocks: [
          {
            kind: 'p',
            text: 'List Nat 只有两个构造子：[] 和 x :: xs。所以 induction xs with 也是两个分支：nil 与 cons。',
          },
          {
            kind: 'code',
            code: 'theorem length_map_zero (xs : List Nat) : (xs.map (fun x => x + 0)).length = xs.length := by\n  induction xs with\n  | nil => rfl\n  | cons x xs ih =>\n    simp only [List.map_cons, List.length_cons]\n    rw [ih]',
          },
          {
            kind: 'goal',
            text: 'induction xs 前：⊢ (xs.map (fun x => x + 0)).length = xs.length\nnil 分支：⊢ ([] .map ...).length = [].length，rfl\ncons 分支：ih : (xs.map ...).length = xs.length\n           ⊢ ((x :: xs).map ...).length = (x :: xs).length\nsimp only 后：⊢ (xs.map ...).length + 1 = xs.length + 1\nrw [ih] 后：没有剩余目标',
          },
          {
            kind: 'p',
            text: 'simp 默认会用 List.length_map 直接证掉目标，归纳假设反而用不上；这里用 simp only 只展开构造子，再 rw [ih] 显式使用它。',
          },
          {
            kind: 'p',
            text: 'structure 把若干字段打包成一个类型，匿名构造子按声明顺序填值；点号可以直接访问字段。',
          },
          {
            kind: 'code',
            code: 'structure Point where\n  x : Nat\n  y : Nat\n\ndef Point.sum (p : Point) : Nat := p.x + p.y\n\n#eval (Point.mk 3 4).sum',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'structure 属于 Init，可以用；但别指望 Std 里的 deriving 实例和扩展语法，这个运行时只带 Init。',
          },
          {
            kind: 'details',
            summary: '为什么这里不直接 simp？',
            text: '全量 simp 确实可能直接证掉这条定理，但它会自己找到 List.length_map 之类的高层引理，归纳假设 ih 就没机会出场。学习阶段用 simp only 只展开构造子，再显式 rw [ih]，你才能看到「归纳假设如何被使用」这条主线。',
          },
          {
            kind: 'note',
            text: '下一节开始进入数学篇。你会反复用到今天的三件事：把概念写成定义、构造 witness、对数据结构做归纳。区别只是对象从 List 换成了整除、奇偶和集合。',
          },
        ],
        exercise: {
          title: '练习',
          body: '给 Point 加一个 scale 函数，把两个坐标同时乘以 k，并证明乘以 1 不变。',
          hint: '证明两个 structure 相等，通常先 cases p 把字段拆开，再用 simp [Point.scale] 化简两个坐标。',
          cta: '在编辑器中动手',
          starter:
            'structure Point where\n  x : Nat\n  y : Nat\n\ndef Point.scale (p : Point) (k : Nat) : Point :=\n  ⟨p.x * k, p.y * k⟩\n\ntheorem scale_one (p : Point) : p.scale 1 = p := by\n  sorry\n',
        },
      },
      {
        slug: 'math-proof-style',
        track: 'math',
        navTitle: 'M0 · 数学证明翻译',
        title: '把数学证明翻译成 Lean',
        lead: '先不急着做整除题：把「设、取、分情况、归纳」这些数学课上的说法，逐句对应到 Lean 策略。',
        blocks: [
          {
            kind: 'p',
            text: '数学证明和 Lean 证明不是两套东西，差别只在精确度：数学课上可以写「显然」，Lean 要求每一步都能被检查。下面用四个常见句式做对照。',
          },
          {
            kind: 'p',
            text: '对照一：「设 a = 2x、b = 2y」——数学课上这句话是在引入记号，Lean 里必须先把存在量词拆开。rcases 就是把「存在某个 x」变成「手上有一个具体的 x 和等式」。',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\nexample (a b : Nat) (ha : Even a) (hb : Even b) :\n    ∃ x y, a = 2 * x ∧ b = 2 * y := by\n  rcases ha with ⟨x, hx⟩\n  rcases hb with ⟨y, hy⟩\n  exact ⟨x, y, hx, hy⟩',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ ∃ x y, a = 2 * x ∧ b = 2 * y\nrcases ha：x : Nat，hx : a = 2 * x（数学课上的「设 a = 2x」）\nrcases hb：y : Nat，hy : b = 2 * y\nexact ⟨x, y, hx, hy⟩：没有剩余目标',
          },
          {
            kind: 'p',
            text: '对照二：「取 k = x + y」——数学课上说出这个 witness 就够了；Lean 用 refine 或 exact 把它交出去，剩下的等式再逐步改写。下面把「偶数 + 偶数还是偶数」的完整自然语言证明逐句翻译成 Lean。',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\ntheorem even_add_even (a b : Nat) (ha : Even a) (hb : Even b) :\n    Even (a + b) := by\n  rcases ha with ⟨x, hx⟩\n  rcases hb with ⟨y, hy⟩\n  refine ⟨x + y, ?_⟩\n  rw [hx, hy]\n  grind',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ Even (a + b)，展开即 ⊢ ∃ k, a + b = 2 * k\nrcases：得到 x、y 与 hx : a = 2 * x、hy : b = 2 * y\nrefine ⟨x + y, ?_⟩：⊢ a + b = 2 * (x + y)（取 k = x + y）\nrw [hx, hy]：⊢ 2 * x + 2 * y = 2 * (x + y)\ngrind：没有剩余目标',
          },
          {
            kind: 'p',
            text: '对照三：「分情况讨论」——数学课上写「若 n = 0 则…，否则…」；Lean 用 by_cases，两个分支各证一次。',
          },
          {
            kind: 'code',
            code: 'example (n : Nat) : n = 0 ∨ n ≠ 0 := by\n  by_cases h : n = 0\n  · exact Or.inl h\n  · exact Or.inr h',
          },
          {
            kind: 'p',
            text: '对照四：「数学归纳法」——先证 n = 0，再假设 n = k 成立并证 n = k + 1。Lean 的写法是 induction n with | zero => ... | succ k ih => ...，第 05 节已经练过，后面的整除、奇偶证明会反复用到。',
          },
          {
            kind: 'note',
            text: 'grind 是 Lean 自带的自动化证明策略：线性算术、等式与命题推理都能自动处理。它不是「显然」，而是真的把每一步算清楚后才接受。',
          },
          {
            kind: 'details',
            summary: '自然语言里哪些词最容易被 Lean 卡住？',
            text: '「显然」「不妨设」「同理」在 Lean 里都不存在。遇到它们时先问自己：这一步到底用了哪个定义、哪条假设？把定义用 rw 或 rcases 展开，把假设用 exact 交出去，通常就能补上机器要求的那一步。',
          },
        ],
        exercise: {
          title: '练习',
          body: '先用 witness 证明 Even 8，再把「偶数 + 偶数还是偶数」按上面的步骤自己写一遍。',
          hint: 'Even 8 取 k = 4，用 ⟨4, rfl⟩；第二个定理先 rcases ha、rcases hb，再 refine ⟨x + y, ?_⟩，rw [hx, hy] 后用 grind 收尾。',
          cta: '在编辑器中动手',
          starter:
            'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\ntheorem even_eight : Even 8 := by\n  sorry\n\ntheorem even_sum (a b : Nat) (ha : Even a) (hb : Even b) : Even (a + b) := by\n  sorry\n',
        },
      },
      {
        slug: 'math-divisibility',
        track: 'math',
        navTitle: 'M1 · 整除',
        title: '整除：把一个词写成定义',
        lead: '“6 能被 2 整除”不只是做除法，而是说：存在一个数 k，使 6 = 2 × k。Lean 把这句话直接写成定义。',
        blocks: [
          {
            kind: 'p',
            text: '先看符号 ∣（读作“整除”）。2 ∣ 6 的意思是“存在整数 k，使 6 = 2 × k”。它和 2 / 6 完全不是一回事：前者是一个命题，后者是一个数。',
          },
          { kind: 'code', code: '#check (2 ∣ 6)\n\nexample : 2 ∣ 6 := ⟨3, rfl⟩' },
          {
            kind: 'goal',
            text: '证明开始：⊢ 2 ∣ 6\n把 ∣ 读成存在量词：⊢ ∃ k, 6 = 2 * k\n提供 witness 3：⊢ 6 = 2 * 3\nrfl 收尾：没有剩余目标',
          },
          {
            kind: 'p',
            text: '⟨3, rfl⟩ 就是证据：3 是那个 k，rfl 表示 6 和 2 × 3 按定义相等。证明存在性命题，核心就是构造一个 witness。',
          },
          {
            kind: 'details',
            summary: '从 List 到数学：怎么把 ∣ 拆开？',
            text: '上一节你对 List 的构造子做归纳；这一节对象变成了命题。∣ 本身就是一个返回 Prop 的定义，rcases h with ⟨k, hk⟩ 会把「存在 k」拆成具体的 k 和等式。想看它到底展开成什么，用 #print Dvd.dvd 或 #check (2 ∣ 6)，不需要额外导入 Mathlib。',
          },
          {
            kind: 'p',
            text: '整除可以传递：如果 a 整除 b，b 整除 c，那么 a 整除 c。证明方法就是把两个 witness 乘起来。',
          },
          {
            kind: 'code',
            code: 'theorem dvd_trans (a b c : Nat) (hab : a ∣ b) (hbc : b ∣ c) : a ∣ c := by\n  rcases hab with ⟨x, rfl⟩\n  rcases hbc with ⟨y, rfl⟩\n  exact ⟨x * y, by rw [Nat.mul_assoc]⟩',
          },
          { kind: 'p', text: '两个数都被 a 整除，它们的和也被 a 整除。' },
          {
            kind: 'code',
            code: 'theorem dvd_add (a b c : Nat) (hb : a ∣ b) (hc : a ∣ c) : a ∣ b + c := by\n  rcases hb with ⟨x, rfl⟩\n  rcases hc with ⟨y, rfl⟩\n  exact ⟨x + y, by rw [Nat.mul_add]⟩',
          },
          {
            kind: 'note',
            text: '这类证明的套路：rcases 把“存在 k”拆成具体的 witness；rw 把目标换成乘法等式；最后把新的 witness 交回去。',
          },
        ],
        exercise: {
          title: '练习',
          body: '证明任何数都整除 0，并且 1 整除任何数。',
          hint: '两个目标都是存在命题，直接给 witness：dvd_zero 用 0，one_dvd 用 a；对应的乘法等式都能被 rfl 收掉。',
          cta: '在编辑器中动手',
          starter:
            'theorem dvd_zero (a : Nat) : a ∣ 0 := by\n  sorry\n\ntheorem one_dvd (a : Nat) : 1 ∣ a := by\n  sorry\n',
        },
      },
      {
        slug: 'math-parity',
        track: 'math',
        navTitle: 'M2 · 奇偶',
        title: '奇偶：第一个不像“计算”的证明',
        lead: '偶数就是 2 的倍数，奇数就是 2 的倍数加一。把这两句话写成定义，就能证明“偶数 + 偶数还是偶数”。',
        blocks: [
          {
            kind: 'p',
            text: '定义不是越复杂越好，而是把“我知道它是什么”变成“机器也能检查它是什么”。偶数、奇数各用一行就能写完。',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\nexample : Even 6 := ⟨3, rfl⟩\nexample : Odd 7 := ⟨3, rfl⟩',
          },
          {
            kind: 'p',
            text: 'Even a 是一个存在命题。rcases 拆开它，就得到一个具体的 k；两个偶数相加，把两个 k 加在一起就是新的 witness。',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem even_add_even (a b : Nat) (ha : Even a) (hb : Even b) : Even (a + b) := by\n  rcases ha with ⟨x, rfl⟩\n  rcases hb with ⟨y, rfl⟩\n  exact ⟨x + y, by grind⟩',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ Even (a + b)，展开即 ⊢ ∃ k, a + b = 2 * k\nrcases ha with ⟨x, rfl⟩：a 被替换成 2 * x\nrcases hb with ⟨y, rfl⟩：b 被替换成 2 * y\nexact ⟨x + y, by grind⟩：取 k = x + y，grind 收掉乘法等式',
          },
          {
            kind: 'p',
            text: '奇数 + 奇数会多出一个 1，正好又凑成 2 的倍数。',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem odd_add_odd (a b : Nat) (ha : Odd a) (hb : Odd b) : Even (a + b) := by\n  rcases ha with ⟨x, rfl⟩\n  rcases hb with ⟨y, rfl⟩\n  exact ⟨x + y + 1, by grind⟩',
          },
          {
            kind: 'p',
            text: '同一个数不能既是偶数又是奇数。假设两者都成立，grind 会发现 2k = 2j + 1 不可能。',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by\n  intro h\n  rcases h with ⟨⟨x, hx⟩, ⟨y, hy⟩⟩\n  grind',
          },
          {
            kind: 'details',
            summary: 'rcases 后面为什么能直接写 rfl？',
            text: '⟨x, rfl⟩ 让 Lean 用 x 直接替换掉等式里的 a，相当于「不妨设 a = 2x」。如果写成 ⟨x, hx⟩，假设 hx : a = 2 * x 会保留下来，之后就要自己 rw [hx]。两种写法都能过，前者更短，后者在需要保留原值时更清楚。',
          },
          {
            kind: 'note',
            text: 'grind 是 Lean 自带的自动化证明策略，能做线性算术、等式与命题推理；遇到变量之间的乘法，就要自己给引理。',
          },
        ],
        exercise: {
          title: '练习',
          body: '证明偶数乘以任何自然数仍然是偶数。',
          hint: '先把 h 拆成 a = 2 * k；目标变成 ∃ j, a * b = 2 * j，取 j = k * b，再用 rw [hk] 和 grind 收尾。',
          cta: '在编辑器中动手',
          starter:
            'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\ntheorem even_mul (a b : Nat) (h : Even a) : Even (a * b) := by\n  sorry\n',
        },
      },
      {
        slug: 'math-gcd',
        track: 'math',
        navTitle: 'M3 · 最大公约数',
        title: '最大公约数：先写规格，再谈算法',
        lead: '“最大公约数”最重要的不是怎么算，而是它到底满足什么性质。把性质写成定义，算法正确性才有讨论对象。',
        blocks: [
          {
            kind: 'p',
            text: 'd 是 a、b 的公约数，并且任何公约数都整除 d。这三句话就是最大公约数的规格。',
          },
          {
            kind: 'code',
            code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\n#check IsGcd',
          },
          {
            kind: 'p',
            text: 'Init 自带 Nat.gcd（底层是欧几里得算法）。我们不需要重写算法，只需要证明它满足上面这条规格。',
          },
          {
            kind: 'code',
            code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem gcd_is_gcd (a b : Nat) : IsGcd a b (Nat.gcd a b) := by\n  constructor\n  · exact Nat.gcd_dvd_left a b\n  constructor\n  · exact Nat.gcd_dvd_right a b\n  · intro e hea heb\n    exact Nat.dvd_gcd hea heb',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ IsGcd a b (Nat.gcd a b)，展开为 (Nat.gcd a b ∣ a) ∧ (Nat.gcd a b ∣ b) ∧ 最大性\nconstructor：先拆成两个整除目标，再证「任何公约数都整除它」\nNat.gcd_dvd_left / Nat.gcd_dvd_right：直接给出两个整除\nintro e hea heb：进入最大性目标；Nat.dvd_gcd hea heb 收尾',
          },
          {
            kind: 'p',
            text: '规格还有一个好处：满足规格的值唯一。如果 d 和 e 都满足 IsGcd，那么 d = e。',
          },
          {
            kind: 'code',
            code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem gcd_unique (a b d e : Nat) (hd : IsGcd a b d) (he : IsGcd a b e) : d = e := by\n  rcases hd with ⟨hda, hdb, hdg⟩\n  rcases he with ⟨hea, heb, heg⟩\n  exact Nat.dvd_antisymm (heg d hda hdb) (hdg e hea heb)',
          },
          {
            kind: 'details',
            summary: '为什么不自己写一个 gcd 算法？',
            text: '因为「怎么算」和「算什么」是两件事。IsGcd 描述的是结果必须满足的性质；只要 Nat.gcd 满足这条规格，调用它的定理就不关心内部用的是欧几里得算法还是别的实现。这就是规格与实现分离。',
          },
          {
            kind: 'note',
            text: '这就是“规格与实现分离”：以后换一个更快的 gcd 算法，只要还能证明 IsGcd，所有依赖它的定理都不用改。',
          },
        ],
        exercise: {
          title: '练习',
          body: '证明：如果 2 整除 a 和 b，那么 2 整除它们的最大公约数。',
          hint: '不用展开 gcd，直接 exact Nat.dvd_gcd ha hb：它正好说的是「同时整除两个数，就整除它们的 gcd」。',
          cta: '在编辑器中动手',
          starter:
            'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem two_dvd_gcd (a b : Nat) (ha : 2 ∣ a) (hb : 2 ∣ b) : 2 ∣ Nat.gcd a b := by\n  sorry\n',
        },
      },
      {
        slug: 'math-primes',
        track: 'math',
        navTitle: 'M4 · 素数与反例',
        title: '素数：定义、反例与最小证明',
        lead: '素数不是“看起来很特别”的数，而是满足两条性质的数：至少为 2，且因子只有 1 和它自己。',
        blocks: [
          {
            kind: 'p',
            text: '把“只有 1 和它自己两个因子”写成一个全称命题，就得到素数的定义。',
          },
          {
            kind: 'code',
            code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\n#check Prime',
          },
          {
            kind: 'p',
            text: '反驳一个数是素数，只需要找到一个“多余的因子”。比如 4 有因子 2，而 2 既不是 1 也不是 4。',
          },
          {
            kind: 'code',
            code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem not_prime_one : ¬ Prime 1 := by\n  intro h\n  rcases h with ⟨h2, _⟩\n  grind\n\ntheorem not_prime_four : ¬ Prime 4 := by\n  intro h\n  rcases h with ⟨_, hd⟩\n  have h2 : 2 ∣ 4 := ⟨2, rfl⟩\n  have h := hd 2 h2\n  grind',
          },
          {
            kind: 'p',
            text: '证明 2 是素数则要处理任意因子 d：它必须先满足 d ≤ 2，又必须是正数，所以只能是 1 或 2。',
          },
          {
            kind: 'code',
            code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem prime_two : Prime 2 := by\n  constructor\n  · grind\n  · intro d hd\n    have hle : d ≤ 2 := Nat.le_of_dvd (by grind) hd\n    have hpos : 0 < d := Nat.pos_of_dvd_of_pos hd (by grind)\n    grind',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ Prime 2，展开为 2 ≤ 2 ∧ ∀ d, d ∣ 2 → d = 1 ∨ d = 2\nconstructor：分成两个目标\n第一个目标 2 ≤ 2 直接由 grind 收尾\nintro d hd：由 Nat.le_of_dvd 得 d ≤ 2，由 Nat.pos_of_dvd_of_pos 得 0 < d\ngrind：d 同时满足 0 < d 和 d ≤ 2，只能是 1 或 2',
          },
          {
            kind: 'details',
            summary: 'd ≤ 2 和 0 < d 是从哪来的？',
            text: 'Nat.le_of_dvd 说「正数整除 n，则除数 ≤ n」，所以要先给它 0 < 2；Nat.pos_of_dvd_of_pos 说「正数被 n 整除，则除数 > 0」。这两个引理把「d 是 2 的因子」翻译成范围条件，剩下的交给 grind。',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: '“素数有无穷多个”是欧几里得的经典结论。它的证明需要构造 n! + 1，而本运行时不带阶乘库，所以这里只保留思路：假设只有有限个素数，把它们乘起来加一，会得到一个不被任何已知素数整除的数。',
          },
        ],
        exercise: {
          title: '练习',
          body: '证明 6 不是素数。提示：找一个既不是 1 也不是 6 的因子。',
          hint: 'rcases h with ⟨_, hd⟩ 拿到「因子只能是 1 或 6」；再令 h2 : 2 ∣ 6 := ⟨3, rfl⟩，用 hd 2 h2 得到矛盾，最后 grind。',
          cta: '在编辑器中动手',
          starter:
            'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem not_prime_six : ¬ Prime 6 := by\n  sorry\n',
        },
      },
      {
        slug: 'math-sets',
        track: 'math',
        navTitle: 'M5 · 集合',
        title: '集合：把“属于”写成谓词',
        lead: '集合不是列表，而是一条规则：给我一个元素，我回答它在不在。用 Lean 说，集合就是返回 Prop 的函数。',
        blocks: [
          {
            kind: 'p',
            text: '在 Lean 里可以直接把集合定义成 A : α → Prop。x 属于 A，就是命题 A x 为真。',
          },
          {
            kind: 'code',
            code: 'def Set (α : Type) := α → Prop\n\ndef evens : Set Nat := fun n => ∃ k, n = 2 * k\n\n#check evens\n#check evens 4',
          },
          {
            kind: 'p',
            text: '子集：A 的每个元素都在 B 里。这是一条全称命题，证明就是 intro 一个元素再往下推。',
          },
          {
            kind: 'code',
            code: 'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ntheorem subset_trans {α : Type} (A B C : Set α) (h1 : Subset A B) (h2 : Subset B C) : Subset A C := by\n  intro x hx\n  exact h2 x (h1 x hx)',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ Subset A C\n展开 Subset：⊢ ∀ x, A x → C x\n执行 intro x hx：x : α，hx : A x ⊢ C x\n把 hx 喂给 h1：得到 h1 x hx : B x\n再把结果喂给 h2：得到 h2 x (h1 x hx) : C x，目标关闭',
          },
          {
            kind: 'p',
            text: '并集：A ∪ B 的元素满足 A x 或 B x，所以 A 一定是 A ∪ B 的子集。',
          },
          {
            kind: 'code',
            code: 'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ndef SetUnion {α : Type} (A B : Set α) : Set α := fun x => A x ∨ B x\n\ntheorem subset_union {α : Type} (A B : Set α) : Subset A (SetUnion A B) := by\n  intro x hx\n  exact Or.inl hx',
          },
          {
            kind: 'note',
            text: '符号 ∈ 只是 A x 的另一种写法；本课不用额外类型类，直接读作“A 接受 x”。',
          },
          {
            kind: 'details',
            summary: '集合证明为什么总是 intro？',
            text: 'Subset 的定义是 ∀ x, A x → C x，所以证明一开头就是把任意 x 和前提 A x 拿进来；之后的 h1 x hx、h2 x ... 都是函数应用。集合论证明看起来在写文字，实际结构和第 03 节的函数复合完全一样。',
          },
        ],
        exercise: {
          title: '练习',
          body: '定义交集，并证明交集是左边集合的子集。',
          hint: '先 intro x hx；hx 的类型是 A x ∧ B x，取 hx.1 就是 A x。',
          cta: '在编辑器中动手',
          starter:
            'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ndef SetInter {α : Type} (A B : Set α) : Set α := fun x => A x ∧ B x\n\ntheorem inter_subset_left {α : Type} (A B : Set α) : Subset (SetInter A B) A := by\n  sorry\n',
        },
      },
      {
        slug: 'math-functions',
        track: 'math',
        navTitle: 'M6 · 函数',
        title: '单射、满射与双射',
        lead: '函数就是映射。单射保证不撞车，满射保证目标都能到，双射则是完美的来回转换。',
        blocks: [
          {
            kind: 'p',
            text: '单射：不同输入给出不同输出。满射：每个目标值都有原像。两者都有就是双射。',
          },
          {
            kind: 'code',
            code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ndef Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ndef Bijective {α β : Type} (f : α → β) : Prop := Injective f ∧ Surjective f\n\n#check Injective',
          },
          {
            kind: 'p',
            text: '两个单射复合还是单射：如果 g (f a) = g (f b)，先用 g 的单射得到 f a = f b，再用 f 的单射得到 a = b。',
          },
          {
            kind: 'code',
            code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ntheorem injective_comp {α β γ : Type} (f : α → β) (g : β → γ)\n    (hf : Injective f) (hg : Injective g) : Injective (fun x => g (f x)) := by\n  intro a b h\n  apply hf\n  apply hg\n  exact h',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ Injective (fun x => g (f x))，展开为 ∀ a b, g (f a) = g (f b) → a = b\nintro a b h：h : g (f a) = g (f b)，目标 a = b\napply hf：目标变成 f a = f b\napply hg：目标变成 g (f a) = g (f b)\nexact h：没有剩余目标',
          },
          {
            kind: 'p',
            text: '恒等函数既单又满，所以是双射。',
          },
          {
            kind: 'code',
            code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ndef Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ndef Bijective {α β : Type} (f : α → β) : Prop := Injective f ∧ Surjective f\n\ntheorem surjective_id {α : Type} : Surjective (fun x : α => x) := by\n  intro b\n  exact ⟨b, rfl⟩\n\ntheorem bijective_id {α : Type} : Bijective (fun x : α => x) := by\n  constructor\n  · intro a b h\n    exact h\n  · exact surjective_id',
          },
          {
            kind: 'details',
            summary: 'apply 和 exact 到底怎么选？',
            text: 'exact 要求你手里已经有一个和目标完全一致的证明；apply 则是把目标换成某个引理的前提。比如目标是 f a = f b，apply hf 会把目标变成 g (f a) = g (f b)，因为 hf 正好需要这个前提。',
          },
          {
            kind: 'note',
            text: '双射意味着可以来回转换而不丢信息；有限集合之间若存在双射，元素个数一定相同。',
          },
        ],
        exercise: {
          title: '练习',
          body: '证明两个满射的复合仍然是满射。',
          hint: 'intro c 后先用 hg 取 b 使 g b = c，再用 hf 取 a 使 f a = b；最后 exact ⟨a, by rw [ha, hb]⟩。',
          cta: '在编辑器中动手',
          starter:
            'def Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ntheorem surjective_comp {α β γ : Type} (f : α → β) (g : β → γ)\n    (hf : Surjective f) (hg : Surjective g) : Surjective (fun x => g (f x)) := by\n  sorry\n',
        },
      },
      {
        slug: 'math-relations',
        track: 'math',
        navTitle: 'M7 · 关系',
        title: '等价关系与分类',
        lead: '关系是接受两个元素的命题。等价关系满足自反、对称、传递，它把对象分成一堆一堆。',
        blocks: [
          {
            kind: 'p',
            text: '把三条性质写成一个结构，就是等价关系的定义。',
          },
          {
            kind: 'code',
            code: 'structure IsEquivalence {α : Type} (r : α → α → Prop) : Prop where\n  refl : ∀ x, r x x\n  symm : ∀ {x y}, r x y → r y x\n  trans : ∀ {x y z}, r x y → r y z → r x z\n\ndef SameLength {α : Type} (xs ys : List α) : Prop := xs.length = ys.length\n\n#check IsEquivalence',
          },
          {
            kind: 'p',
            text: '“长度相同”就是一个等价关系：长度等于自己、可以交换、可以传递。',
          },
          {
            kind: 'code',
            code: 'def SameLength {α : Type} (xs ys : List α) : Prop := xs.length = ys.length\n\ntheorem same_length_refl {α : Type} (xs : List α) : SameLength xs xs := rfl\n\ntheorem same_length_symm {α : Type} (xs ys : List α) (h : SameLength xs ys) :\n    SameLength ys xs := by\n  exact h.symm\n\ntheorem same_length_trans {α : Type} (xs ys zs : List α)\n    (h1 : SameLength xs ys) (h2 : SameLength ys zs) : SameLength xs zs := by\n  exact h1.trans h2',
          },
          {
            kind: 'goal',
            text: 'same_length_refl：⊢ SameLength xs xs，展开为 xs.length = xs.length，rfl 收尾\nsame_length_symm：h : xs.length = ys.length，h.symm 得到反向等式\nsame_length_trans：h1 : xs.length = ys.length，h2 : ys.length = zs.length，h1.trans h2 把两端接起来',
          },
          {
            kind: 'p',
            text: '等价关系把对象分堆：同一堆里的东西“在某种意义下一样”。数学里的分类，通常就是找一个合适的等价关系。',
          },
          {
            kind: 'details',
            summary: 'structure 的证明为什么能写 where？',
            text: 'IsEquivalence 是一个 structure，三个字段就是三条性质。where 只是逐字段填值的语法糖，等价于 refine ⟨?_, ?_, ?_⟩ 再分别证明。字段声明里的 {x y} 是隐式参数，Lean 会根据目标自动推断。',
          },
          {
            kind: 'note',
            text: '模 n 同余、同构、同伦都是等价关系；它们让复杂对象变成可以比较的“类”。',
          },
        ],
        exercise: {
          title: '练习',
          body: '把三条性质组合成一个 IsEquivalence 证明。',
          hint: '用 where 依次填：refl := fun _ => rfl；symm := fun h => h.symm；trans := fun h1 h2 => h1.trans h2。',
          cta: '在编辑器中动手',
          starter:
            'structure IsEquivalence {α : Type} (r : α → α → Prop) : Prop where\n  refl : ∀ x, r x x\n  symm : ∀ {x y}, r x y → r y x\n  trans : ∀ {x y z}, r x y → r y z → r x z\n\ndef SameLength {α : Type} (xs ys : List α) : Prop := xs.length = ys.length\n\ntheorem same_length_equiv {α : Type} : IsEquivalence (SameLength (α := α)) := by\n  sorry\n',
        },
      },
      {
        slug: 'math-strong-induction',
        track: 'math',
        navTitle: 'M8 · 强归纳',
        title: '强归纳与斐波那契',
        lead: '有些递推关系要用到前两项甚至所有更小的项；这时普通归纳不够，需要强归纳。',
        blocks: [
          {
            kind: 'p',
            text: '斐波那契数列：F(0)=0，F(1)=1，之后每一项等于前两项之和。',
          },
          {
            kind: 'code',
            code: 'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\n#eval fib 10',
          },
          {
            kind: 'p',
            text: '普通归纳只给你前一项；强归纳给你所有更小的项。Lean 的 Nat.strongRecOn 把“对所有 m < n 成立”直接交给你。',
          },
          {
            kind: 'code',
            code: 'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\ntheorem fib_lt_two_pow (n : Nat) : fib n ≤ 2 ^ n := by\n  induction n using Nat.strongRecOn with\n  | ind n ih =>\n    match n with\n    | 0 => simp [fib]\n    | 1 => simp [fib]\n    | k + 2 =>\n      have h1 := ih k (by grind)\n      have h2 := ih (k + 1) (by grind)\n      simp [fib, Nat.pow_succ]\n      grind',
          },
          {
            kind: 'goal',
            text: '强归纳假设：ih : ∀ m, m < n → fib m ≤ 2 ^ m\nk + 2 分支：⊢ fib (k + 2) ≤ 2 ^ (k + 2)\n展开 fib：⊢ fib k + fib (k + 1) ≤ 2 ^ (k + 2)\n用 ih k 和 ih (k + 1) 得到两个上界\nsimp 与 grind 收尾：没有剩余目标',
          },
          {
            kind: 'note',
            text: '强归纳不是新公理，它可以从普通归纳推出来；只是用起来更顺手。',
          },
          {
            kind: 'details',
            summary: '为什么这里要拿两个归纳假设？',
            text: 'fib 在 k + 2 处同时依赖 fib k 和 fib (k + 1)。普通归纳只给前一项，强归纳的 ih 则对每个 m < k + 2 都给假设，所以能分别取 m = k 和 m = k + 1。代价是每次使用都要证明 m < n，这里用 grind 完成。',
          },
        ],
        exercise: {
          title: '练习',
          body: '证明斐波那契数列单调不减：F(n) ≤ F(n+1)。',
          hint: '对 n 用强归纳；0 和 1 直接 simp [fib]；k + 2 分支把 fib (k + 2) 展开成 fib k + fib (k+1)，再用 ih (k+1) 和 grind。',
          cta: '在编辑器中动手',
          starter:
            'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\ntheorem fib_mono (n : Nat) : fib n ≤ fib (n + 1) := by\n  sorry\n',
        },
      },
      {
        slug: 'code-sorting',
        track: 'math',
        navTitle: 'M9 · 插入排序',
        title: '插入排序为什么是对的',
        lead: '排序的规格有两部分：结果有序，并且元素一个都没丢。把这两条写下来，正确性才有意义。',
        blocks: [
          {
            kind: 'p',
            text: '先定义“有序”：空表和单元素表天然有序，多元素表要求头 ≤ 第二个元素，并且尾部有序。',
          },
          {
            kind: 'code',
            code: 'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ndef sort : List Nat → List Nat\n  | [] => []\n  | x :: xs => insertNat x (sort xs)\n\n#eval sort [3, 1, 2]',
          },
          {
            kind: 'p',
            text: '成员保持：y 在 insertNat x xs 里，当且仅当 y = x 或者 y 本来就在 xs 里。',
          },
          {
            kind: 'code',
            code: 'def insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ntheorem mem_insertNat (x y : Nat) (xs : List Nat) :\n    y ∈ insertNat x xs ↔ y = x ∨ y ∈ xs := by\n  induction xs with\n  | nil =>\n    unfold insertNat\n    simp\n  | cons z zs ih =>\n    unfold insertNat\n    by_cases h : x ≤ z\n    · simp [h]\n    · simp [h, ih, or_left_comm]',
          },
          {
            kind: 'note',
            text: '有序性的证明留作练习；先证成员保持，再证有序，是这类证明的常见拆法。',
          },
          {
            kind: 'goal',
            text: 'sorted_insert 要证：Sorted xs → Sorted (insertNat x xs)\nnil 分支：⊢ Sorted [x]，simp [insertNat, Sorted]\ncons 且 x ≤ y：⊢ Sorted (x :: y :: ys)\ncons 且 ¬ x ≤ y：⊢ Sorted (y :: insertNat x ys)\n主定理 sort_sorted 对 xs 归纳，cons 分支直接调用 sorted_insert',
          },
          {
            kind: 'details',
            summary: '为什么把排序证明拆成两步？',
            text: '插入排序的正确性依赖两个独立事实：insertNat 保持有序，以及 sort 递归地保持有序。先证 sorted_insert 这个辅助引理，主定理 sort_sorted 就只剩一次归纳和一次调用。把辅助引理单独命名，也让报错位置更容易定位。',
          },
          {
            kind: 'code',
            code: 'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ndef sort : List Nat → List Nat\n  | [] => []\n  | x :: xs => insertNat x (sort xs)\n\ntheorem sorted_insert (x : Nat) (xs : List Nat) (h : Sorted xs) :\n    Sorted (insertNat x xs) := by\n  induction xs with\n  | nil => simp [insertNat, Sorted]\n  | cons y ys ih =>\n    by_cases hxy : x ≤ y\n    · sorry\n    · sorry\n\ntheorem sort_sorted (xs : List Nat) : Sorted (sort xs) := by\n  induction xs with\n  | nil => simp [sort, Sorted]\n  | cons x xs ih =>\n    simp [sort]\n    exact sorted_insert x (sort xs) ih',
          },
          {
            kind: 'note',
            text: '上面的两个 sorry 是故意留下的练习骨架。运行时会出现 sorry 警告，那不是错误；把分支补完后警告会消失。',
          },
        ],
        exercise: {
          title: '练习',
          body: '补完辅助引理 sorted_insert 的两个分支，再运行整份文件，确认主定理 sort_sorted 不依赖 sorry。',
          hint: 'x ≤ y 分支要用 h 的前半段和 hxy；¬ x ≤ y 分支要先用 ih 得到 Sorted (insertNat x ys)，再证明 y ≤ insertNat x ys 的第一个元素。先拆 ys 会更清楚。',
          cta: '在编辑器中动手',
          starter:
            'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ndef sort : List Nat → List Nat\n  | [] => []\n  | x :: xs => insertNat x (sort xs)\n\ntheorem sorted_insert (x : Nat) (xs : List Nat) (h : Sorted xs) :\n    Sorted (insertNat x xs) := by\n  induction xs with\n  | nil => simp [insertNat, Sorted]\n  | cons y ys ih =>\n    by_cases hxy : x ≤ y\n    · sorry\n    · sorry\n\ntheorem sort_sorted (xs : List Nat) : Sorted (sort xs) := by\n  induction xs with\n  | nil => simp [sort, Sorted]\n  | cons x xs ih =>\n    simp [sort]\n    exact sorted_insert x (sort xs) ih\n',
        },
      },
      {
        slug: 'code-sum',
        track: 'math',
        navTitle: 'M10 · 列表求和',
        title: '递归函数与归纳证明',
        lead: '列表求和是最小但完整的例子：写一个递归函数，再用结构归纳证明它的性质。',
        blocks: [
          {
            kind: 'p',
            text: '求和的定义直接照抄数学：空表是 0，非空表是头加尾。',
          },
          {
            kind: 'code',
            code: 'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\n#eval sum [1, 2, 3]',
          },
          {
            kind: 'p',
            text: '拼接两个列表再求和，等于分别求和再相加。证明对第一个列表做结构归纳。',
          },
          {
            kind: 'code',
            code: 'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\ntheorem sum_append (xs ys : List Nat) : sum (xs ++ ys) = sum xs + sum ys := by\n  induction xs with\n  | nil => simp [sum]\n  | cons x xs ih =>\n    simp [sum, ih]\n    grind',
          },
          {
            kind: 'goal',
            text: '证明开始：⊢ sum (xs ++ ys) = sum xs + sum ys\ninduction xs with：xs 同时是 sum 和 ++ 递归的位置\nnil：simp [sum]，两边都化成 sum ys\ncons x xs ih：simp [sum, ih] 后剩加法结合律，grind 收尾',
          },
          {
            kind: 'details',
            summary: '为什么归纳 xs 而不是 ys？',
            text: 'sum 和 ++ 都按第一个列表递归：sum (x :: xs) 与 (x :: xs) ++ ys 都会先拆出 x。对 xs 归纳，归纳假设正好能套进这两个定义；对 ys 归纳则拆不开 sum (x :: xs)。归纳变量要跟着递归定义走。',
          },
          {
            kind: 'note',
            text: '如果加上累加器参数，求和可以写成尾递归；证明会变成“累加器不变量”，那是下一层练习。',
          },
        ],
        exercise: {
          title: '练习',
          body: '利用 sum_append 证明两个列表交换顺序后总和不变。',
          hint: 'rw [sum_append, Nat.add_comm]：先把左边换成 sum xs + sum ys，再用加法交换律收尾。',
          cta: '在编辑器中动手',
          starter:
            'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\ntheorem sum_append (xs ys : List Nat) : sum (xs ++ ys) = sum xs + sum ys := by\n  induction xs with\n  | nil => simp [sum]\n  | cons x xs ih =>\n    simp [sum, ih]\n    grind\n\ntheorem sum_swap (xs ys : List Nat) : sum (xs ++ ys) = sum ys + sum xs := by\n  sorry\n',
        },
      },
      {
        slug: 'math-axioms',
        track: 'math',
        navTitle: 'M11 · 公理与 sorry',
        title: '公理、sorry 与可信代码',
        lead: '公理是不证明就接受的命题；定理是从公理推出来的。Lean 能告诉你一条定理到底依赖哪些公理。',
        blocks: [
          {
            kind: 'p',
            text: '#print axioms 会列出定理依赖的公理。核心算术定理通常不依赖任何公理。',
          },
          {
            kind: 'code',
            code: '#print axioms Nat.add_comm\n\n#check Classical.choice\n#check Classical.em',
          },
          {
            kind: 'p',
            text: 'sorry 会生成 sorryAx，让任何命题“成立”。它适合草稿，不适合交付。',
          },
          {
            kind: 'code',
            code: 'theorem cheat : 1 = 2 := by\n  sorry\n\n#print axioms cheat',
          },
          {
            kind: 'details',
            summary: '为什么核心算术定理不依赖公理？',
            text: 'Nat.add_comm 这类结论是从 Nat 的定义一步步证出来的，没有额外的假设，所以 #print axioms 输出为空。Classical.choice 则是主动接受的公理，用来做非构造性推理；用到它的定理会把 Classical.choice 列在依赖里。',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: '看到 sorryAx 就说明证明还没完成；课程代码和 CI 都不应该留下 sorry。',
          },
        ],
        exercise: {
          title: '练习',
          body: '用 Classical.em 证明排中律，再用 #print axioms 看看它依赖了什么。',
          hint: '证明体直接写 exact Classical.em P；运行后看 #print axioms my_em 的输出，会看到 Classical.choice。',
          cta: '在编辑器中动手',
          starter: 'theorem my_em (P : Prop) : P ∨ ¬ P := by\n  sorry\n\n#print axioms my_em\n',
        },
      },
      {
        slug: 'math-mathlib',
        track: 'math',
        navTitle: 'M12 · 从 Init 到 Mathlib',
        title: '从 Init 到 Mathlib',
        lead: 'Mathlib 是 Lean 的数学库：集合、函数、数论、代数、分析都在里面。本运行时只带 Init，所以课程自己搭了一个迷你数学库。',
        blocks: [
          {
            kind: 'p',
            text: '课程里的 Even、Prime、IsGcd、Set、Injective、Sorted，在 Mathlib 里都有工业级版本。',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\n#check Even\n#check Nat.gcd\n#check List.length',
          },
          {
            kind: 'p',
            text: '对照表：Even/Odd、Nat.Prime、Nat.gcd、Set、Function.Injective、List.Perm 分别是这些概念的 Mathlib 名字。',
          },
          {
            kind: 'code',
            code: '#check Nat.gcd_dvd_left\n#check Nat.dvd_gcd\n#check List.mem_append',
          },
          {
            kind: 'details',
            summary: '课程的迷你库和 Mathlib 差在哪？',
            text: '名字和方向一致，但 Mathlib 的版本有完整的命名空间、实例、自动化引理和跨领域连接。比如课程里的 Even 只有定义和几条练习，Mathlib 的 Nat.Even 则和整除、模运算、素数分布都连在一起。先把定义和证明套路练熟，迁移到 Mathlib 主要是查名字。',
          },
          {
            kind: 'note',
            text: '本地继续学：先装 elan，再用 lake new 建项目，在 lakefile 里 require mathlib；首次编译会比较久，但之后就能用整套数学库。',
          },
        ],
        exercise: {
          title: '练习',
          body: '离开课程前，用 witness 证明 Even 4，再用 #check 看几个 Mathlib 名字。',
          hint: 'Even 4 就是 ∃ k, 4 = 2 * k，取 k = 2，用 ⟨2, rfl⟩ 收尾。',
          cta: '在编辑器中动手',
          starter:
            'theorem even_four : ∃ k, 4 = 2 * k := by\n  sorry\n\n#check List.mem_append\n#check Nat.gcd_dvd_left\n',
        },
      },
    ],
  },
  playground: {
    title: 'Lean 编辑器',
    hint: '首次启动需下载约 102MB 运行时，之后会持久缓存。',
    start: '启动 Lean',
    stop: '关闭 Lean',
    goalTitle: 'Goal',
    goalPlaceholder: '移动光标到证明内部查看 Goal',
    goalEmpty: '当前光标没有 Goal',
    goalUnsupported: '该 Lean LSP 不支持 Goal',
    goalHint: '将光标移入 by 块内查看当前证明目标',
    diagnosticsTitle: '诊断',
    diagnosticsPlaceholder: '启动 Lean 后显示诊断',
    runPassed: '运行通过',
    runPassedDetail: (warnings, ms) =>
      warnings > 0 ? `${warnings} 个警告 · ${ms}ms` : `没有错误 · ${ms}ms`,
    severityError: '错误',
    severityWarning: '警告',
    severityInfo: '信息',
    abbreviationDetail: 'Unicode 缩写',
    backToLesson: '回到本课',
    resetCode: '重置题目',
    resetConfirmAction: '确认重置？',
    exportCode: '导出 .lean',
    lessonPassed: '本关已通过',
    expand: '展开',
    panelsTitle: '面板显示',
    showPanels: '显示面板',
    resizeHint: '拖动调整编辑器高度',
    splitHint: '拖动调整左右栏宽度',
    logCompletion: (line, column, count) => `补全 @${line}:${column} -> ${count} 项`,
    logHover: (line, column, found) => `悬停 ${line}:${column} -> ${found ? '有结果' : 'null'}`,
    logRequestFailed: (method, message) => `${method} 失败：${message}`,
    logGoalFailed: (message) => `$/lean/plainGoal 失败：${message}`,
    logTitle: '日志',
    footer:
      '浏览器内真实 Lean LSP · 仅支持 Init，不支持 Std / Lean / Lake / Mathlib · Chromium 优先',
    openFull: '打开完整编辑器',
    statusIdle: '未启动',
    statusLowMemory: '低内存设备 · 手动启动',
    lowMemoryHint:
      '检测到可用内存偏小：启动 Lean 需要约 400MB 空闲内存，已关闭自动下载。确认设备有余量后手动点「启动 Lean」。',
    statusLoading: '加载运行时…（首次约 102MB）',
    statusStarting: '启动 LSP…',
    statusChunks: (loaded, total) => `${loaded} / ${total} MB`,
    statusChunkFallback: (name, message) => `分片回退 ${name}：${message}`,
    statusError: (message) => `错误：${message}`,
    statusFailure: (message) => `失败：${message}`,
    statusCrash: 'Lean 进程崩溃了',
    statusRecovering: 'Lean 进程崩溃，正在自动重启…',
    crashAutoTitle: 'Lean 进程崩溃，正在自动重启…',
    crashLoopTitle: 'Lean 进程连续崩溃',
    crashAutoDetail: (message) =>
      `代码已保留。如果再次崩溃，请修改代码后手动重启。错误：${message}`,
    crashLoopDetail: (message) =>
      `可能是当前代码触发了 Lean 内部递归或栈溢出。代码已保留，请修改后手动重启。错误：${message}`,
    crashRestartFailed: '自动重启失败，请检查网络或缓存后手动重试。',
    crashDiagnostics: 'Lean 进程已崩溃，旧诊断已清空',
    restartLean: '重启 Lean',
    copyError: '复制错误',
    copyErrorDone: '已复制',
    loadFailureTitle: '运行时资产下载失败',
    startFailureTitle: 'Lean 启动失败',
    loadFailureDetail:
      'Lean 运行时没有下载完整。可以重试，或换一个下载源；如果开着 VPN，先关掉 VPN 再试。',
    retryLoad: '重试',
    sourceCdn: '同源 R2',
    sourceMirror: '国内镜像',
    sourceGithub: 'GitHub',
    sourceAuto: '自动选择',
    sourceSwitching: (label) => `正在用${label}重试…`,
    assetFallbackLabel: (name, message) => `最近回退：${name}：${message}`,
    statusLspReady: 'LSP 就绪',
    statusWaitingDiagnostics: '等待诊断…',
    statusReady: (count, ms) => `就绪 · 诊断 #${count} ${ms}ms`,
    statusNoDiagnostics: (ms) => `无诊断 · ${ms}ms`,
    logSwReady: 'Service Worker 就绪，Lean 资产由站点同源 R2 网关分片下发',
    logSwFailed: (message) => `Service Worker 注册失败，回退 Pages：${message}`,
    logCacheCleared: '已清空 Lean 资产缓存（fresh=1）',
    logDraftRestored: '已恢复上次未提交的本地草稿',
    logRuntimeReady: '运行时资源就绪',
    logRuntimeError: (message) => `运行时错误：${message}`,
    logRuntimeCrash: (message) => `Lean 进程崩溃：${message}`,
    logAutoRestart: '正在自动重启 Lean…',
    logRecovered: 'Lean 已重新启动，编辑器内容已保留',
    logSourceSwitched: (label) => `已切换资产源：${label}，正在重试…`,
    logSourceAuto: '已恢复自动选择资产源',
    logRunBarrierFallback: '无法确认文件处理完成，已按当前诊断结果结算',
    logInitialize: (seconds) => `initialize 完成，总耗时 ${seconds}s`,
    logStartFailed: (message) => `启动失败：${message}`,
    logStopped: '已关闭 Lean 引擎，worker 与内存已释放',
    logLowMemory: '低内存设备：已关闭自动启动，持久缓存上限下调到 128MB',
  },
  reference: {
    eyebrow: 'Lean 4 · 速查',
    title: '策略与符号速查',
    lead: '写证明时最常用的策略、符号和报错，集中在一页。忘了就回来扫一眼，不用翻完整课程。',
    tacticsTitle: '常用策略',
    tacticsLead: '按「我想做什么」查，而不是背名字。',
    tactics: [
      {
        name: 'intro h',
        body: '目标形如 P → Q 或 ∀ x, ... 时，把前提或变量引入成假设。',
        example: '⊢ P → Q  →  intro h  →  h : P ⊢ Q',
      },
      {
        name: 'exact h',
        body: '手里有一个和目标类型完全一致的证明，直接交出去。',
        example: 'h : P  →  exact h 关闭 ⊢ P',
      },
      {
        name: 'apply h',
        body: '把目标换成引理 h 的前提，适合「用一条引理」而不是直接交证明。',
        example: 'hf : Injective f，⊢ a = b  →  apply hf  →  ⊢ f a = f b',
      },
      {
        name: 'rcases h with ⟨x, hx⟩',
        body: '拆开存在量词、合取或析取；h 是证明时用它。',
        example: 'h : ∃ k, n = 2 * k  →  rcases h with ⟨k, hk⟩',
      },
      {
        name: 'induction n with',
        body: '对自然数或列表做结构归纳；归纳变量要跟着递归定义走。',
        example: 'induction n with | zero => ... | succ k ih => ...',
      },
      {
        name: 'rw [h]',
        body: '按等式改写目标；方向不对时用 ←。',
        example: 'h : a = b  →  rw [h] 把目标里的 a 换成 b',
      },
      {
        name: 'simp [defs]',
        body: '用定义和 simp 引理化简目标；simp only 可以限制范围。',
        example: 'simp [sum, ih]',
      },
      {
        name: 'grind',
        body: '自动收尾线性算术、等式与命题推理。',
        example: 'rw [hx, hy] 之后  →  grind',
      },
      {
        name: 'by_cases h : P',
        body: '把目标分成 P 与 ¬P 两种情况。',
        example: 'by_cases h : n = 0  →  两个分支各证一次',
      },
      {
        name: 'constructor',
        body: '拆开 ∧、↔ 或 structure 目标，逐个子目标证明。',
        example: '⊢ P ∧ Q  →  constructor',
      },
    ],
    symbolsTitle: '常用符号',
    symbolsLead: '输入反斜杠缩写后按空格或 Tab 展开；课程编辑器里也会弹出候选。',
    symbols: [
      { symbol: '→', abbreviation: '\\to', meaning: '蕴含 / 函数类型' },
      { symbol: '←', abbreviation: '\\leftarrow', meaning: '反向 / 赋值（gets）' },
      { symbol: '↔', abbreviation: '\\iff', meaning: '当且仅当' },
      { symbol: '∀', abbreviation: '\\forall', meaning: '全称量词' },
      { symbol: '∃', abbreviation: '\\exists', meaning: '存在量词' },
      { symbol: '∧', abbreviation: '\\and', meaning: '并且' },
      { symbol: '∨', abbreviation: '\\or', meaning: '或者' },
      { symbol: '¬', abbreviation: '\\not', meaning: '否定' },
      { symbol: '∣', abbreviation: '\\mid', meaning: '整除' },
      { symbol: '∈', abbreviation: '\\in', meaning: '属于' },
      { symbol: '⊆', abbreviation: '\\subseteq', meaning: '子集' },
      { symbol: '⟨ ⟩', abbreviation: '\\langle \\rangle', meaning: '构造 / 匿名构造子' },
    ],
    errorsTitle: '常见报错',
    errorsLead: '先看报错指向哪一行，再把光标移到证明里看 Goal。',
    errors: [
      {
        error: 'type mismatch',
        cause: '证明或值的类型和期望不一致。',
        fix: '看报错里的 expected / got，用 #check 确认名字的类型。',
      },
      {
        error: 'unknown identifier',
        cause: '名字拼错、命名空间不对，或没有导入。',
        fix: '用 #check 搜名字；注意 Nat.、List. 这类前缀。',
      },
      {
        error: 'unsolved goals',
        cause: '还有目标没关闭，常见于少写分支或最后一步。',
        fix: '把光标放进证明看 Goal，补 exact、rfl 或 grind。',
      },
      {
        error: "declaration uses 'sorry'",
        cause: '还有 sorry 占位，证明没有真正完成。',
        fix: '逐个关闭 Goal；课程练习要求 sorry 清零。',
      },
      {
        error: 'function expected',
        cause: '把非函数当成函数应用，通常是括号或参数顺序错了。',
        fix: '用 #check 看类型，检查参数顺序与括号。',
      },
    ],
    ctaTitle: '继续动手',
    ctaBody: '速查只能救急，肌肉记忆还是靠写。',
    ctaPlayground: '打开编辑器',
    ctaLesson: '回到第一课',
  },
  privacy: {
    eyebrow: '透明度',
    title: '隐私说明',
    updated: '最后更新：2026-11-12',
    intro:
      '这是一个纯前端教学项目：Lean 运行时在浏览器里执行，你写的代码不会上传。为了定位启动失败和性能问题，我们会收集少量匿名运行指标。',
    sections: [
      {
        heading: '收集什么',
        paragraphs: [
          '页面类型（首页 / 课程 / 编辑器）、界面语言与时间戳。',
          '启动链路：Service Worker 是否注册成功、资产下载的来源与字节数、下载耗时、语言服务器就绪耗时、首帧诊断耗时。',
          '错误摘要：错误名称、截断到 120 字符的说明与调用栈行数；不包含编辑器里的代码。',
          '设备分档：是否属于低内存设备（由 navigator.deviceMemory 推导），不记录具体型号或设备标识。',
        ],
      },
      {
        heading: '不收集什么',
        paragraphs: [
          '站点代码不设置 cookie、不写入用户标识、不做设备指纹，也不接入广告或社交插件。',
          '编辑器内容与练习代码不会上传到服务器。',
        ],
      },
      {
        heading: '第三方统计',
        paragraphs: [
          '站点启用了 Cloudflare Web Analytics：由 Cloudflare 以无 cookie、无指纹的方式收集聚合的页面浏览与 Core Web Vitals，请求直接发往 Cloudflare，不经过本站的 /api/telemetry 接收端。',
          '这部分数据由 Cloudflare 按其隐私政策处理；本站只能看到聚合报表，无法关联到个人。',
        ],
      },
      {
        heading: '怎么使用',
        paragraphs: [
          '指标只用于回答「启动卡在哪一步、哪个源慢、低端设备是否失败」，按 50% 采样发送，错误事件优先。',
          '接收端只做校验并写短期服务日志（Cloudflare Workers Logs，默认数天后过期），不落数据库、不出售或共享。',
          'Cloudflare 作为托管方会在短期日志中处理请求元数据（含 IP），用于安全与排障，保留期由平台决定；本站不主动关联这些记录。',
        ],
      },
      {
        heading: '本地存储',
        paragraphs: [
          '主题、语言、自动启动偏好、课程阅读进度与练习草稿保存在 localStorage；草稿只留在本机，不会上传。',
          'Lean 运行时和诊断用的来源选择保存在 CacheStorage / IndexedDB，用于避免重复下载约 102MB。',
          '这些数据都可以在浏览器设置里随时清除，清除后站点仍可正常使用。',
        ],
      },
      {
        heading: '如何退出',
        paragraphs: [
          '浏览器开启「请勿跟踪（Do Not Track）」后，本站不再发送任何运行指标。',
          '也可以用内容拦截器屏蔽 /api/telemetry；不影响任何功能。',
        ],
      },
      {
        heading: '联系',
        paragraphs: ['与隐私相关的问题或数据删除请求，请通过仓库的 GitHub Issues 联系。'],
      },
    ],
    note: '本页是项目说明，不构成法律意见。',
    backHome: '回到首页',
  },
  footer: {
    license: 'Apache-2.0 OR MulanPSL-2.0',
    note: '浏览器内真实 Lean LSP · 仅支持 Init',
    repo: '源码',
    privacy: '隐私',
  },
  notFound: {
    title: '页面不存在',
    body: '链接可能已经失效，回到首页重新开始吧。',
    cta: '回到首页',
  },
};
