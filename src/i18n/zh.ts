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
    courseTitle: '第一课：第一个 Lean 证明',
    courseBody: '不假设任何 Lean 基础，从 #check 和 #eval 开始，最后用归纳法证明加法交换律。',
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
    editorHint:
      '右侧是真实编辑器。打开本页会自动开始加载 Lean，完成后改动代码即可看到诊断与 Goal。',
    lessons: [
      {
        slug: 'first-proof',
        navTitle: '01 · 先让 Lean 说句话',
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
            text: '把光标停在 #check 那一行，右侧诊断面板会给出 Nat.add 的类型；#eval 的结果出现在信息里。',
          },
          {
            kind: 'p',
            text: '在 Lean 里，「2 + 2 = 4」是一个类型，而证明就是这个类型的一个元素。等式两边能靠计算化成同一个表达式时，rfl 就能直接给出证明。',
          },
          { kind: 'code', code: '#check (show 2 + 2 = 4 from rfl)' },
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
        navTitle: '02 · 蕴含与函数',
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
        navTitle: '03 · 合取与析取',
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
        navTitle: '04 · 归纳法',
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
            text: '写完后把光标放到 by 块内部逐行移动，右侧 Goal 面板第一行会一直显示这条定理要证什么，第二行才是当前这一步的状态。',
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
    diagnosticsTitle: '诊断',
    diagnosticsPlaceholder: '启动 Lean 后显示诊断',
    logTitle: '日志',
    footer:
      '浏览器内真实 Lean LSP · 仅支持 Init，不支持 Std / Lean / Lake / Mathlib · Chromium 优先',
    openFull: '打开完整编辑器',
    statusIdle: '未启动',
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
    logRuntimeReady: '运行时资源就绪',
    logRuntimeError: (message) => `运行时错误：${message}`,
    logInitialize: (seconds) => `initialize 完成，总耗时 ${seconds}s`,
    logStartFailed: (message) => `启动失败：${message}`,
    logStopped: '已关闭 Lean 引擎，worker 与内存已释放',
  },
  footer: {
    license: 'Apache-2.0 OR MulanPSL-2.0',
    note: '浏览器内真实 Lean LSP · 仅支持 Init',
    repo: '源码',
  },
  notFound: {
    title: '页面不存在',
    body: '链接可能已经失效，回到首页重新开始吧。',
    cta: '回到首页',
  },
};
