import type { Messages } from './types';

export const zh: Messages = {
  nav: {
    home: '首页',
    lesson: '入门课',
    playground: '编辑器',
    github: 'GitHub',
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
    autoStartHint: '关闭后需要手动点「启动 Lean」。首次下载约 143MB，只在你的浏览器里缓存。',
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
        body: '约 143MB 运行时由站点同源网关从 Cloudflare R2 按 4MB 分片并行下发并做 SHA-256 校验，网关故障时自动回退 GitHub raw，之后走持久缓存。',
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
  },
  lesson: {
    eyebrow: 'Lean 4 入门',
    tocTitle: '课程目录',
    prev: '上一篇',
    next: '下一篇',
    runInEditor: '运行',
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
            kind: 'note',
            text: '这门课只带 Init——Lean 自带的基础库。没有 Std、Lean、Lake 或 Mathlib，所以后面的代码里不会出现 import Mathlib。',
          },
          {
            kind: 'p',
            text: '编辑器完整地跑在你的浏览器里：首次需要下载约 143MB 运行时，之后会缓存；代码不会上传到任何服务器。',
          },
        ],
        exercise: {
          title: '练习',
          body: '把 #eval 的算式换成你喜欢的，再 #check 一个你好奇的名字。',
          cta: '在编辑器中动手',
          starter: '#eval 6 * 7\n#check Nat.mul\n',
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
            kind: 'note',
            tone: 'warn',
            text: 'rfl 表示「由定义直接成立」。它只能关闭计算型等式，遇到需要推理的命题就要换策略。',
          },
        ],
        exercise: {
          title: '练习',
          body: '把 #eval 2 + 3 改成你喜欢的算式，再自己写一个 #check 看看结果。',
          cta: '在编辑器中动手',
          starter: '#check Nat.mul\n#eval 6 * 7\n',
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
            kind: 'note',
            tone: 'warn',
            text: '如果目标形如 P → Q，第一步几乎总是 intro。不 intro 直接想，很容易卡住。',
          },
        ],
        exercise: {
          title: '练习',
          body: '证明 (P → Q) → (Q → R) → P → R，也就是把 trans_imp 的前提写成箭头形式。',
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
            kind: 'p',
            text: '析取麻烦一点：要证 P ∨ Q，只需给出其中一边，用 Or.inl 或 Or.inr。要使用 P ∨ Q，则必须分两种情况讨论，这就是 cases。',
          },
          {
            kind: 'code',
            code: 'theorem or_comm (P Q : Prop) : P ∨ Q → Q ∨ P := by\n  intro h\n  cases h with\n  | inl hp => exact Or.inr hp\n  | inr hq => exact Or.inl hq',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: '构造用 inl / inr，使用用 cases。方向搞反是最常见的卡点：手里有「或」就想直接取，是不行的。',
          },
        ],
        exercise: {
          title: '练习',
          body: '证明 (P ∧ Q) → (Q ∧ P) 的析取版本：(P ∨ Q) → (Q ∨ P) 你已经见过了，试试 (P ∧ Q) ∨ R → P ∨ R。',
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
            kind: 'note',
            text: 'zero 分支里 simp 把 0 + b 化简成 b；succ 分支里 Nat.succ_add 把 succ a + b 变成 succ (a + b)，再用归纳假设 ih 改写。',
          },
          {
            kind: 'p',
            text: '本节的目标是交换律 a + b = b + a。写完后想逐步看证明状态，点「在编辑器中动手」，把光标移到 by 块内部：Goal 面板第一行始终是这条定理要证的目标，下面的行才是当前这一步的状态。',
          },
          {
            kind: 'code',
            code: 'theorem add_zero (a : Nat) : a + 0 = a := by\n  induction a with\n  | zero => rfl\n  | succ a ih => simp',
          },
        ],
        exercise: {
          title: '练习',
          body: '把 add_zero 自己写一遍，再尝试证明 zero_add：0 + a = a。两个 sorry 都需要你补上。',
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
            kind: 'note',
            tone: 'warn',
            text: 'rw 会重写目标中所有匹配的位置。只想改一处时，先想清楚是不是该换一种写法，别让一次 rw 改得面目全非。',
          },
          {
            kind: 'code',
            code: 'theorem add_assoc_rw (a b c : Nat) : a + b + c = a + (b + c) := by\n  rw [Nat.add_assoc]',
          },
        ],
        exercise: {
          title: '练习',
          body: '用一条已有的乘法等式证明 a * 1 = a，只允许用 rw。',
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
            kind: 'code',
            code: 'theorem add_succ_simp (a b : Nat) : a + Nat.succ b = Nat.succ (a + b) := by\n  simp only [Nat.add_succ]',
          },
        ],
        exercise: {
          title: '练习',
          body: '把两个 0 一次化掉：a + 0 + 0 = a。',
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
            kind: 'p',
            text: '使用存在命题时必须拆开它：cases h with | intro n hn => ...，n 是见证，hn 是它满足性质。',
          },
          {
            kind: 'code',
            code: 'theorem exists_swap (P Q : Nat → Prop) (h : ∃ n, P n ∧ Q n) : ∃ n, Q n ∧ P n := by\n  cases h with\n  | intro n hn => exact ⟨n, hn.2, hn.1⟩',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: '这里的 intro 是拆存在量词，不是证明开头引入假设的那个 intro。名字一样，作用完全不同。',
          },
        ],
        exercise: {
          title: '练习',
          body: '把「对所有 n 成立」用到 n = 3 上，证明 P 3。',
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
            code: 'theorem length_map_zero (xs : List Nat) : (xs.map (fun x => x + 0)).length = xs.length := by\n  induction xs with\n  | nil => rfl\n  | cons x xs ih => simp [ih]',
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
        ],
        exercise: {
          title: '练习',
          body: '给 Point 加一个 scale 函数，把两个坐标同时乘以 k，并证明乘以 1 不变。',
          cta: '在编辑器中动手',
          starter:
            'structure Point where\n  x : Nat\n  y : Nat\n\ndef Point.scale (p : Point) (k : Nat) : Point :=\n  ⟨p.x * k, p.y * k⟩\n\ntheorem scale_one (p : Point) : p.scale 1 = p := by\n  sorry\n',
        },
      },
    ],
  },
  playground: {
    title: 'Lean 编辑器',
    hint: '首次启动需下载约 143MB 运行时，之后会持久缓存。',
    start: '启动 Lean',
    stop: '关闭 Lean',
    goalTitle: 'Goal',
    goalPlaceholder: '移动光标到证明内部查看 Goal',
    goalEmpty: '当前光标没有 Goal',
    goalUnsupported: '该 Lean LSP 不支持 Goal',
    goalHint: '将光标移入 by 块内查看当前证明目标',
    diagnosticsTitle: '诊断',
    diagnosticsPlaceholder: '启动 Lean 后显示诊断',
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
    statusLoading: '加载运行时…（首次约 143MB）',
    statusStarting: '启动 LSP…',
    statusChunks: (loaded, total) => `${loaded} / ${total} MB`,
    statusChunkFallback: (name, message) => `分片回退 ${name}：${message}`,
    statusError: (message) => `错误：${message}`,
    statusFailure: (message) => `失败：${message}`,
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
    logInitialize: (seconds) => `initialize 完成，总耗时 ${seconds}s`,
    logStartFailed: (message) => `启动失败：${message}`,
    logStopped: '已关闭 Lean 引擎，worker 与内存已释放',
    logLowMemory: '低内存设备：已关闭自动启动，持久缓存上限下调到 128MB',
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
          'Lean 运行时和诊断用的来源选择保存在 CacheStorage / IndexedDB，用于避免重复下载约 143MB。',
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
