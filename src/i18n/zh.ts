import { REPO_URL } from '../feedback';
import { LEAN_RUNTIME_VERSION, SITE_LICENSE } from '../meta';
import type { Messages } from './types';

export const zh: Messages = {
  nav: {
    home: '首页',
    lesson: '入门课',
    playground: '编辑器',
    github: 'GitHub',
    reference: '速查表',
    challenges: '趣味挑战',
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
    assetSource: 'Lean 运行时下载源',
    assetSourceHint:
      '自动会按浏览器语言与时区就近选择：中文或国内环境优先国内镜像，其他优先站点 CDN。修改后下次启动 Lean 生效。',
    clearCache: '清理运行时缓存',
    clearCacheHint: '删除已下载的 Lean 运行时（约 102MB），下次启动会重新下载。',
    clearCacheBusy: '清理中…',
    clearCacheDone: '已清理，下次启动会重新下载运行时。',
    clearCacheFailed: '清理失败，请稍后重试。',
  },
  home: {
    eyebrow: 'Lean 4.35.0 · Init + Std + Batteries · 浏览器内 LSP',
    title: '在浏览器里跑真正的 Lean 4 定理证明器',
    lead: '不是正则模拟，也不是把代码发到云端：完整编译器和语言服务器就塞在 Web Worker 里。打开网页 30 秒，写下第一行证明。',
    heroNote:
      '单元测试只能测出你写到的那几个用例没错；Lean 能用数学逻辑把所有可能输入一次性证死，错一步编译器当场红线拦住。',
    factsTitle: '核心事实',
    facts: (lessons, challenges) => [
      `${LEAN_RUNTIME_VERSION} 编译器与语言服务器编译为 WebAssembly，在浏览器 Web Worker 内运行`,
      '内置 Init，Std 与 Batteries 按需挂载；不含 Lean / Lake / Mathlib',
      '100% 浏览器端运行，零后端，代码不上传服务器',
      `${lessons} 节中英双语课程 + ${challenges} 道趣味数学挑战`,
      `免费开源（${SITE_LICENSE}）：${REPO_URL}`,
    ],
    ctaPrimary: '从第一课开始',
    continueCta: '继续学习',
    ctaSecondary: '直接打开编辑器',
    featuresTitle: '底层架构拆解',
    features: [
      {
        title: '真编译器，不是模拟',
        body: 'Lean 4.35.0 的编译器和语言服务器编译成 WebAssembly，在 Web Worker 里完成解析、精化与诊断；页面里没有任何靠正则判断“证明对错”的捷径。',
      },
      {
        title: '跨源隔离撑起 wasm 线程',
        body: 'COOP/COEP 与 SharedArrayBuffer 让 Lean 的内存模型原样运行，这也是它和普通在线沙盒最大的区别。',
      },
      {
        title: '102MB 运行时按 4MB 分片校验',
        body: 'Service Worker 经同源网关从 R2 拉取运行时，逐块做 SHA-256 校验，失败自动回退其他源，之后走浏览器持久缓存。',
      },
      {
        title: 'Init + Std + Batteries 分包',
        body: '默认只下载 Init；工程实战课会按需挂载 Std 与 Batteries，不用时释放，不占额外内存。',
      },
    ],
    limitsTitle: '当前边界',
    limitsBody:
      '内置 Init；Std 与 Batteries 作为扩展包按需加载，不含 Lean / Lake / Mathlib。需要 cross-origin isolation，Chromium 系浏览器体验最佳。',
    courseTitle: '第一课：会做数学题的编译器',
    courseBody:
      '把 Lean 当成一个能读懂数学句子的类型检查器：先跑通 #eval 和 #check，再写第一个零漏洞证明。',
    courseCta: '开始学习',
    pathsTitle: '三条学习路径',
    pathMeta: (count) => `${count} 节课`,
    challengesTitle: '趣味数学挑战',
    challengesBody:
      '6 道非程序员也能看懂的经典数学题：不用装环境，点开就能在浏览器里亲手证明。与系统课程并列，共用同一套 Lean 运行时。',
    challengesCta: '去挑战',
    demo: {
      title: '先看 5 秒：证明就是让目标一行行消失',
      body: '不用下载 102MB 运行时。下面是一个真实目标，点「下一步」看 Lean 每走一步把 ⊢ 变成什么。',
      steps: [
        {
          goal: '⊢ 2 + 2 = 4',
          note: '裁判给出待证目标：证明 2 + 2 等于 4。',
        },
        {
          goal: '⊢ 4 = 4',
          note: 'Lean 先算值：2 + 2 化简成 4，目标变成「4 等于 4」。',
        },
        {
          goal: '没有剩余目标',
          note: '两边一模一样，rfl 直接盖章；这一行证明就完成了。',
        },
      ],
      stepLabel: (current, total) => `第 ${current} / ${total} 步`,
      next: '下一步',
      reset: '重来',
    },
  },
  challenges: {
    eyebrow: '趣味数学挑战',
    title: '用 Lean 亲手证明 6 道经典数学题',
    lead: '每道题都从一句人话开始：什么是偶数、为什么交换加法不改变结果、为什么一个数不能同时是奇数又是偶数。不需要编程基础，代码里的「--」注释会一步步带你看懂。',
    cardCta: '开始挑战',
    editorTitle: '证明练习',
    intro: {
      title: '第一次来？30 秒看懂这一页',
      body: 'Lean 是一个数学证明检查器：你在编辑器里写证明，它像编译器一样逐步检查每一步是否成立。它不靠试几个例子，而是确认命题对所有情况都成立。你不需要会编程，先读代码里以「--」开头的注释就行。',
      steps: [
        {
          title: '① 先读题面',
          text: '每道题都先用日常语言说明结论为什么成立；题面本身没有 Lean 代码。',
        },
        {
          title: '② 盯住 Goal 面板',
          text: '「⊢」后面就是 Lean 等你证明的结论。把光标放进证明里，它会跟着光标实时变化。',
        },
        {
          title: '③ 用策略补上证明',
          text: '点策略按钮会把名字插进代码，再按注释提示补参数；卡住时可以展开「参考解法」逐步对照。',
        },
      ],
      codeNote:
        '代码里以「--」开头的灰色行是讲解注释，Lean 会跳过；「sorry」表示这里还没证，是留给你替换的占位符。',
    },
    detail: {
      back: '← 返回挑战列表',
      goalsRemaining: (count) => `当前还剩 ${count} 个待证目标`,
      goalsNone: '当前没有待证目标：把光标放进证明里，Goal 面板会实时更新',
      tacticsTitle: '这道题会用到的策略',
      tacticsHint: '点策略名会把它插到光标处；下面一句话说明每个策略在做什么。',
      copyLink: '复制本关分享链接',
      copyLinkDone: '链接已复制',
      copyLinkFailed: '复制失败，请从地址栏复制',
      hintLabel: '提示',
      solutionTitle: '参考解法',
      solutionHint: '先自己试，卡住再展开对照。',
      loadSolution: '载入参考解法',
      openInPlayground: '在编辑器中打开',
      starterNote:
        '骨架里以「--」开头的行是讲解注释，Lean 会跳过；把 sorry 换成真正的证明就能关闭目标。',
      feedbackHint: '这道题哪里不对劲？反馈会自动带上当前挑战。',
      feedbackBug: '题目有误',
      feedbackIssueTitle: (title) => `[挑战] ${title}`,
    },
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
        lead: '从整除、奇偶到集合与算法正确性，用 Lean 把中学数学直觉写成可检查的代码。',
      },
      eng: {
        title: '工程实战',
        lead: '面向后端、系统与安全工程师：用 Std 与 Batteries 验证真实数据结构、边界条件与状态不变量。',
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
    requiresHint: (libraries) => `本课需要 ${libraries} 库，启动 Lean 时会自动加载。`,
    feedbackHint: '没看懂或发现题目有误？反馈会自动带上当前课时。',
    feedbackClarity: '这课没看懂',
    feedbackBug: '题目有误',
    feedbackIssueTitle: (title) => `[课程] ${title}`,
    completedCount: (done, total) => `已完成 ${done} / ${total}`,
    running: '运行中…',
    noOutput: '没有错误，也没有输出',
    proofAccepted: '证明通过 · Lean 已接受，没有待证目标',
    editorHint:
      '右侧是真实编辑器。打开本页会自动开始加载 Lean，完成后改动代码即可看到诊断与 Goal。',
  },
  playground: {
    title: 'Lean 编辑器',
    hint: '首次启动需下载约 102MB 运行时，之后会持久缓存。',
    summary: `${LEAN_RUNTIME_VERSION} 真编译器 · Init 内置，Std / Batteries 按需挂载 · 100% 浏览器端 WebAssembly Worker · 零后端`,
    defaultCode: `open Classical

noncomputable section

-- “这很显然。”
example (n : Nat) : n + 0 = n := rfl

-- “留作习题。”
theorem exercise_for_reader (a b : Nat) : a + b = b + a := by
  sorry

-- “由选择公理，挑一个就行。”
example (α : Type) (h : Nonempty α) : α := Classical.choice h

#check Classical.choice

end
`,
    start: '启动 Lean',
    stop: '关闭 Lean',
    goalTitle: 'Goal',
    goalPlaceholder: '移动光标到证明内部查看 Goal',
    goalEmpty: '当前光标没有 Goal',
    goalUnsupported: '该 Lean LSP 不支持 Goal',
    goalHint: '将光标移入 by 块内查看当前证明目标',
    goalSorryHint:
      '当前用 sorry 占位，Lean 会暂时把目标当成已完成。把光标移到 by 内，或删掉 sorry，就能看到待证目标。',
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
    challengeNoticeTitle: '已从趣味挑战进入',
    challengeNoticeBody: '题面就在下方；如果本机已有编辑器草稿，我们不会自动覆盖。',
    challengeNoticeLoad: '载入本题骨架',
    challengeNoticeKeep: '保留我的草稿',
    challengeNoticeKept: '已保留你的草稿，随时可以点「载入本题骨架」。',
    challengeLoaded: '已载入本题骨架代码。',
    resetCode: '重置题目',
    resetConfirmAction: '确认重置？',
    exportCode: '导出 .lean',
    lessonPassed: '本关已通过',
    librariesTitle: '库',
    librariesHint: '勾选的库会在启动 Lean 时自动加载；按钮只加载或释放对应库。',
    libraryBuiltin: '内置',
    libraryDefault: '启动时自动加载',
    libraryLoad: '加载',
    libraryLoading: (ratio) => `下载 ${ratio}`,
    libraryLoaded: '已加载',
    libraryRelease: '释放',
    libraryReleaseAll: '释放全部',
    libraryRestarting: '正在重启 Lean…',
    libraryError: (message) => `扩展库加载失败：${message}`,
    expand: '展开',
    panelsTitle: '面板显示',
    showPanels: '显示面板',
    resizeHint: '拖动调整编辑器高度',
    splitHint: '拖动调整左右栏宽度',
    selectAll: '全选',
    copySelection: '复制',
    paste: '粘贴',
    copied: '已复制',
    pasted: '已粘贴',
    clipboardFailed: '无法访问剪贴板，请长按编辑区使用系统菜单',
    logCompletion: (line, column, count) => `补全 @${line}:${column} -> ${count} 项`,
    logHover: (line, column, found) => `悬停 ${line}:${column} -> ${found ? '有结果' : 'null'}`,
    logRequestFailed: (method, message) => `${method} 失败：${message}`,
    logGoalFailed: (message) => `$/lean/plainGoal 失败：${message}`,
    logTitle: '日志',
    footer:
      '浏览器内真实 Lean LSP · Init 内置，Std / Batteries 按需加载 · 不含 Lean / Lake / Mathlib · Chromium 优先',
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
    crashDiagnostics: 'Lean 进程已崩溃，暂未收到诊断',
    restartLean: '重启 Lean',
    copyError: '复制错误',
    copyErrorDone: '已复制',
    loadFailureTitle: '运行时资产下载失败',
    startFailureTitle: 'Lean 启动失败',
    loadFailureDetail:
      'Lean 运行时没有下载完整。可以重试，或换一个下载源；如果开着 VPN，先关掉 VPN 再试。',
    compatibilityTitle: '当前浏览器无法启动 Lean',
    compatibilityDetail:
      '编辑器需要跨源隔离（COOP/COEP）和 SharedArrayBuffer。请使用桌面版 Chrome 或 Edge，或改用系统浏览器打开；应用内浏览器和部分安卓 WebView 暂不支持。',
    compatibilityError:
      'Lean LSP 需要 cross-origin isolation 与 SharedArrayBuffer；当前浏览器未启用。',
    retryLoad: '重试',
    sourceCdn: '站点 CDN',
    sourceMirror: '国内镜像',
    sourceGithub: 'GitHub',
    sourceAuto: '自动选择',
    sourceSwitching: (label) => `正在用${label}重试…`,
    assetFallbackLabel: (name, message) => `最近回退：${name}：${message}`,
    statusLspReady: 'LSP 就绪',
    statusWaitingDiagnostics: '等待诊断…',
    statusChecking: '正在检查文件…',
    statusRunUnconfirmed: '检查尚未确认完成',
    statusReady: (count, ms) => `就绪 · 诊断 #${count} ${ms}ms`,
    statusNoDiagnostics: (ms) => `无诊断 · ${ms}ms`,
    diagnosticsUnconfirmed: '未能确认文件检查完成（Lean 仍在处理或已超时）',
    logSwReady: 'Service Worker 就绪，Lean 运行时将按当前源策略分片下发',
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
    logRunBarrierFallback: '无法确认文件处理完成，暂不显示运行通过',
    logInitialize: (seconds) => `initialize 完成，总耗时 ${seconds}s`,
    logStartFailed: (message) => `启动失败：${message}`,
    logStopped: '已关闭 Lean 引擎，worker 与内存已释放',
    logLowMemory: '低内存设备：已关闭自动启动，持久缓存上限下调到 128MB',
    statusMemoryLimit: '内存接近上限 · 已保护性停止',
    logMemorySoftRecycle: (mb) => `内存达到 ${mb} MB（软阈值），已在空闲时重建引擎释放堆`,
    logMemoryImportRecycle: (mb) =>
      `检测到 import 变更且当前堆水位达 ${mb} MB，已顺手重建引擎释放内存`,
    logMemoryBackgroundRelease: (mb) => `页面切入后台（峰值 ${mb} MB），已释放 Lean 引擎内存`,
    logMemoryHardLimit: (mb, limitMb) =>
      `内存达到硬上限（${mb} / ${limitMb} MB），已保护性停止引擎以防标签页崩溃`,
    runtimeTitle: '运行时',
    advancedTitle: '高级设置',
    runtimeWasm32: 'wasm32（稳定默认）',
    runtimeWasm64: 'wasm64（实验性）',
    runtimeExperimentalWarning:
      '实验性提醒：默认使用稳定版 wasm32（1 GiB 上限）。wasm64 目前为实验性功能，可能存在不稳定或浏览器兼容性问题，请勿作为生产环境使用，仅建议手动切换试用。',
    runtimeWasm64NoLibraries:
      'wasm64 运行包只含 Init，Std / Batteries 扩展库已禁用；需要扩展库时请切回 wasm32。',
    logRuntimeAutoStable: '本课需要扩展库，已自动切回稳定版 wasm32 运行时',
    libraryQuickFix: (library) => `一键启用 ${library} 并切回稳定运行时`,
    libraryQuickFixDone: (library) => `已启用 ${library}，正在重启 Lean…`,
    runtimeWasm64Unsupported: '当前浏览器不支持 Memory64，将继续使用 wasm32 运行时',
    runtimeWasm64AssetNote:
      '实验性提醒：wasm64（64 位 Memory64）将加载独立 64 位 Lean 4.36.0-rc2 + Init 运行包，仅作手动试用，请勿用于生产；Std / Batteries 扩展库仅随 wasm32 提供。',
    runtimeWasm64NotPublished: '当前未配置已发布的 wasm64 运行包，本次将继续使用稳定版 wasm32',
    logWasm64Loading: '正在加载实验性 wasm64 运行包（64 位 Lean 4.36.0-rc2 + Init）…',
    logRuntimeArchSelected: (arch) => `已切换运行时偏好：${arch}`,
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
      {
        name: 'decide',
        body: '具体数值命题（位掩码、小范围枚举）交给编译器穷举，不用手写证明。',
        example: '⊢ (0xF0 : BitVec 8) &&& 0x0F = 0  →  decide',
      },
      {
        name: 'ext i',
        body: '证明两个固定宽度位向量（或函数）相等时，逐位或逐点展开。',
        example: '⊢ x ||| 0#8 = x  →  ext i  →  simp',
      },
      {
        name: 'simp [HashMap.getD_insert]',
        body: '用数据结构的读写引理展开目标；工程课里常配合 h.symm 排除同 key 情况。',
        example: 'simp [transfer, balance, HashMap.getD_insert, h.symm]',
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
    updated: '最后更新：2026-11-19',
    intro:
      '这是一个纯前端教学项目：Lean 运行时在浏览器里执行，你写的代码不会上传。为了定位启动失败和性能问题，我们会收集少量匿名运行指标。',
    sections: [
      {
        heading: '收集什么',
        paragraphs: [
          '页面类型（首页 / 课程 / 编辑器）、界面语言与时间戳。',
          '启动链路：Service Worker 是否注册成功、资产下载的来源与字节数、下载耗时、运行时架构（wasm32 / wasm64）、语言服务器就绪耗时、首帧诊断耗时。',
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
    note: '浏览器内真实 Lean LSP · Init + Std + Batteries',
    repo: '源码',
    privacy: '隐私',
  },
  notFound: {
    title: '页面不存在',
    body: '链接可能已经失效，回到首页重新开始吧。',
    cta: '回到首页',
  },
};
