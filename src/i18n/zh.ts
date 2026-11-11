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
        body: '约 143MB 运行时由 Cloudflare R2 按 4MB 分片并行下发并做 SHA-256 校验，R2 故障时自动回退 GitHub raw，之后走持久缓存。',
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
    eyebrow: '入门课 01',
    title: '第一个 Lean 证明',
    lead: '这一课从零开始：先看 Lean 怎么求值，再读懂一条命题，最后用归纳法把它证出来。每段代码都可以直接送进编辑器运行。',
    openInEditor: '载入编辑器',
    editorHint: '右侧是真实编辑器：先点「启动 Lean」，再点任意代码段的「载入编辑器」，就能边读边跑。',
    sections: [
      {
        heading: '1. 先让 Lean 说句话',
        paragraphs: [
          'Lean 既是一门编程语言，也是一个交互式定理证明器。先用 #check 看一个名字的类型，用 #eval 直接求值。',
        ],
        code: '#check Nat.add\n#eval 2 + 3',
        after: '把光标停在 #check 那一行，诊断面板会给出 Nat.add 的类型；#eval 的结果会出现在信息里。',
      },
      {
        heading: '2. 命题也是类型',
        paragraphs: [
          '在 Lean 里，「2 + 2 = 4」是一个类型，而证明就是这个类型的一个元素。等式两边能靠计算化成同一个表达式时，rfl 就能直接给出证明。',
        ],
        code: '#check (show 2 + 2 = 4 from rfl)',
        after: 'rfl 表示「由定义直接成立」。它只能关闭计算型等式，遇到需要推理的命题就要换策略。',
      },
      {
        heading: '3. 用 induction 证明交换律',
        paragraphs: [
          '目标：对任意自然数 a、b，证明 a + b = b + a。直接展开做不完，需要对 a 做归纳。',
          'induction a with 把目标拆成两种情况：a = 0，以及 a = succ a 并附带归纳假设 ih。',
        ],
        code: 'theorem add_comm (a b : Nat) : a + b = b + a := by\n  induction a with\n  | zero => simp\n  | succ a ih => simp [Nat.succ_add, ih]',
        after: 'zero 分支里 simp 把 0 + b 化简成 b；succ 分支里 Nat.succ_add 把 succ a + b 变成 succ (a + b)，再用归纳假设改写。',
      },
      {
        heading: '4. 换你动手',
        paragraphs: ['照着上面的结构，证明 a + 0 = a。写完后把光标放到证明内部，看 Goal 面板每一步还剩什么。'],
        code: 'theorem add_zero (a : Nat) : a + 0 = a := by\n  induction a with\n  | zero => rfl\n  | succ a ih => simp [ih]',
      },
    ],
    exerciseTitle: '练习',
    exerciseBody: '把 add_zero 自己写一遍，再尝试证明 zero_add：0 + a = a。两个 sorry 都需要你补上。',
    exerciseCta: '在编辑器中动手',
    starter:
      'theorem add_zero (a : Nat) : a + 0 = a := by\n  sorry\n\ntheorem zero_add (a : Nat) : 0 + a = a := by\n  sorry\n',
  },
  playground: {
    title: 'Lean 编辑器',
    hint: '首次启动需下载约 143MB 运行时，之后会持久缓存。',
    start: '启动 Lean',
    goalTitle: 'Goal',
    goalPlaceholder: '移动光标到证明内部查看 Goal',
    goalEmpty: '当前光标没有 Goal',
    goalUnsupported: '该 Lean LSP 不支持 Goal',
    diagnosticsTitle: '诊断',
    diagnosticsPlaceholder: '启动 Lean 后显示诊断',
    logTitle: '日志',
    footer: '浏览器内真实 Lean LSP · 仅支持 Init，不支持 Std / Lean / Lake / Mathlib · Chromium 优先',
    openFull: '打开完整编辑器',
    statusIdle: '未启动',
    statusLoading: '加载运行时…（首次约 143MB）',
    statusStarting: '启动 LSP…',
    statusChunks: (name, loaded, total) => `分片下载 ${name} ${loaded}/${total}MB`,
    statusChunkFallback: (name, message) => `分片回退 ${name}：${message}`,
    statusError: (message) => `错误：${message}`,
    statusFailure: (message) => `失败：${message}`,
    statusLspReady: 'LSP 就绪',
    statusWaitingDiagnostics: '等待诊断…',
    statusReady: (count, ms) => `就绪 · 诊断 #${count} ${ms}ms`,
    statusNoDiagnostics: (ms) => `无诊断 · ${ms}ms`,
    logSwReady: 'Service Worker 就绪，Lean 资产由 Cloudflare R2 分片下发',
    logSwFailed: (message) => `Service Worker 注册失败，回退 Pages：${message}`,
    logCacheCleared: '已清空 Lean 资产缓存（fresh=1）',
    logRuntimeReady: '运行时资源就绪',
    logRuntimeError: (message) => `运行时错误：${message}`,
    logInitialize: (seconds) => `initialize 完成，总耗时 ${seconds}s`,
    logStartFailed: (message) => `启动失败：${message}`,
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
