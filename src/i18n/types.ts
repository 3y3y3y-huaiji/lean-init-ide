/** 课程正文的块级元素：段落、可运行代码、目标旁白、折叠提示、提示框。 */
export type LessonBlock =
  | { kind: 'p'; text: string }
  | { kind: 'code'; code: string }
  /** 逐行 Goal 旁白：保留换行，用等宽字体显示 ⊢ 与假设。 */
  | { kind: 'goal'; text: string }
  /** 不直接给答案的折叠提示。 */
  | { kind: 'details'; summary: string; text: string }
  | { kind: 'note'; text: string; tone?: 'info' | 'warn' };

/** 课程路径：入门、数学与工程实战分开组织，但共用同一个路由。 */
export type LessonTrack = 'intro' | 'math' | 'eng';

/** 课程依赖的扩展分包；与 runtimeExtensions 的 id 保持一致。 */
export type LessonLibrary = 'std' | 'batteries';

/** 一节课程。slug 同时是路由片段与目录锚点。 */
export type LessonPage = {
  slug: string;
  /** 缺省视为入门路径，历史课程不必逐条补字段。 */
  track?: LessonTrack;
  /** 目录里显示的短标题，避免长标题撑破侧栏。 */
  navTitle: string;
  title: string;
  lead: string;
  /**
   * 本课代码依赖的扩展库。课程页与 Playground 据此在启动前自动挂载，
   * 避免用户看到 `unknown module prefix 'Std'` 才发现要手动开库。
   */
  requires?: LessonLibrary[];
  blocks: LessonBlock[];
  exercise?: {
    title: string;
    body: string;
    hint?: string;
    cta: string;
    starter: string;
  };
};

export type Messages = {
  nav: {
    home: string;
    lesson: string;
    playground: string;
    github: string;
    /** 策略与符号速查页。 */
    reference: string;
    /** 面向大众数学爱好者的趣味挑战区。 */
    challenges: string;
  };
  theme: {
    label: string;
    light: string;
    dark: string;
    system: string;
  };
  language: {
    label: string;
  };
  settings: {
    label: string;
    title: string;
    autoStart: string;
    autoStartHint: string;
    /** 运行时资产下载源。 */
    assetSource: string;
    assetSourceHint: string;
    clearCache: string;
    clearCacheHint: string;
    clearCacheBusy: string;
    clearCacheDone: string;
    clearCacheFailed: string;
  };
  home: {
    eyebrow: string;
    title: string;
    lead: string;
    /** 首页 meta description：独立于首屏正文，便于控制检索长度与关键词。 */
    seoDescription: string;
    /** 首屏解释形式化证明价值的补充句。 */
    heroNote: string;
    /** 静态首屏即出现的 GEO 事实清单（版本、架构、库、课程数、开源）。 */
    facts: (lessonCount: number) => string;
    factsRepo: string;
    ctaPrimary: string;
    /** 已有进度时的主按钮文案。 */
    continueCta: string;
    ctaSecondary: string;
    featuresTitle: string;
    features: Array<{ title: string; body: string }>;
    limitsTitle: string;
    limitsBody: string;
    courseTitle: string;
    courseBody: string;
    courseCta: string;
    /** 两条学习路径的标题。 */
    pathsTitle: string;
    pathMeta: (count: number) => string;
    /** 首页与系统课程并列的趣味挑战入口。 */
    challengesTitle: string;
    challengesBody: string;
    challengesCta: string;
    /** 首屏零下载的证明步骤演示：不启动 Lean 也能看懂 Goal 怎么变短。 */
    demo: {
      title: string;
      body: string;
      steps: Array<{ goal: string; note: string }>;
      stepLabel: (current: number, total: number) => string;
      next: string;
      reset: string;
    };
  };
  challenges: {
    eyebrow: string;
    title: string;
    lead: string;
    cardCta: string;
    /** 详情页里包裹 Lean 编辑器的标题，避免与题目本身重复。 */
    editorTitle: string;
    /** 第一次进入挑战区的零基础导览：Lean 是什么、页面怎么玩。 */
    intro: {
      title: string;
      body: string;
      steps: Array<{ title: string; text: string }>;
      codeNote: string;
    };
    detail: {
      back: string;
      /** Goal 面板旁的通俗进度：还剩几个待证目标。 */
      goalsRemaining: (count: number) => string;
      goalsNone: string;
      tacticsTitle: string;
      tacticsHint: string;
      copyLink: string;
      copyLinkDone: string;
      copyLinkFailed: string;
      hintLabel: string;
      solutionTitle: string;
      solutionHint: string;
      loadSolution: string;
      openInPlayground: string;
      starterNote: string;
      /** 挑战详情页底部的反馈入口：自动带上当前挑战。 */
      feedbackHint: string;
      feedbackBug: string;
      feedbackIssueTitle: (title: string) => string;
    };
  };
  lesson: {
    eyebrow: string;
    /** 左侧目录的标题。 */
    tocTitle: string;
    tracks: Record<LessonTrack, { title: string; lead: string }>;
    prev: string;
    next: string;
    /** 代码块上的按钮：就地运行并显示输出。 */
    runInEditor: string;
    /** Goal 旁白块的标题。 */
    goalLabel: string;
    /** 练习折叠提示的标题。 */
    hintLabel: string;
    /** 课程代码块运行失败时的恢复文案。 */
    runCrashed: string;
    restartLean: string;
    restarting: string;
    restartDone: string;
    restartFailed: string;
    /** 目录里已完成课时的标记说明。 */
    completedLabel: string;
    /** 练习区的完成条件说明。 */
    exerciseCompletionHint: string;
    /** 本课依赖哪些扩展库，以及启动时会自动加载。 */
    requiresHint: (libraries: string) => string;
    /** 课程页底部的反馈入口：自动带上当前课时。 */
    feedbackHint: string;
    feedbackClarity: string;
    feedbackBug: string;
    feedbackIssueTitle: (title: string) => string;
    /** 目录顶部的完成计数。 */
    completedCount: (done: number, total: number) => string;
    /** 运行中的占位文案。 */
    running: string;
    /** 运行后没有任何输出时的提示。 */
    noOutput: string;
    /** 证明类代码没有诊断时的提示：说明目标已关闭，而不是“什么都没发生”。 */
    proofAccepted: string;
    editorHint: string;
    /** 课程页右侧 Goal 面板文案。 */
    goalPanelTitle: string;
    goalStepLabel: (current: number, total: number) => string;
    goalPrev: string;
    goalNext: string;
    goalLive: string;
    goalBackToSteps: string;
    goalOpenPlayground: string;
    goalChecking: string;
    goalNoRemaining: string;
    goalClickHint: string;
    goalError: string;
    goalOutput: string;
    goalLocation: (block: number, line: number) => string;
  };
  playground: {
    title: string;
    hint: string;
    /** 编辑器主包加载前的占位文案。 */
    editorLoading: string;
    editorLoadingHint: string;
    editorLoadFailed: string;
    /** Playground 的 meta description：独立控制检索长度与关键词。 */
    seoDescription: string;
    /** 未启动 Lean 前就能被爬虫读到的 GEO 事实清单。 */
    facts: (lessonCount: number) => string;
    factsRepo: string;
    /** playground 的默认示例：同一段 Lean，注释按语言本地化。 */
    defaultCode: string;
    start: string;
    /** 运行时已就绪后，同一个按钮变成释放内存的动作。 */
    stop: string;
    goalTitle: string;
    goalPlaceholder: string;
    goalEmpty: string;
    goalUnsupported: string;
    /** 光标停在声明行、证明体还有 sorry 时的引导。 */
    goalHint: string;
    /** 光标停在 sorry 行、Lean 因此返回 no goals 时的解释。 */
    goalSorryHint: string;
    diagnosticsTitle: string;
    diagnosticsPlaceholder: string;
    /** 诊断批次没有错误时，在诊断面板顶部显示的成功提示。 */
    runPassed: string;
    /** 成功提示的细节：警告数量与诊断耗时。 */
    runPassedDetail: (warnings: number, ms: number) => string;
    /** 诊断按 LSP severity 分组，避免把 #eval / #check 的输出当成报错。 */
    severityError: string;
    severityWarning: string;
    severityInfo: string;
    /** 反斜杠缩写候选的说明。 */
    abbreviationDetail: string;
    backToLesson: string;
    /** Playground 通过 ?lesson= 载入课后练习时展示的本课题目与提示。 */
    lessonNoticeTitle: string;
    lessonNoticeHint: string;
    /** Playground 通过 ?challenge= 载入挑战题时的题面与草稿提示。 */
    challengeNoticeTitle: string;
    challengeNoticeBody: string;
    challengeNoticeLoad: string;
    challengeNoticeKeep: string;
    challengeNoticeKept: string;
    challengeLoaded: string;
    resetCode: string;
    /** 第一次点击重置后按钮变成的确认态。 */
    resetConfirmAction: string;
    exportCode: string;
    /** 与导出成对的 .lean 导入入口。 */
    importCode: string;
    /** 导入成功后写入日志面板的文案。 */
    logCodeImported: (name: string) => string;
    /** 导入失败（如文件过大或读取失败）时写入日志面板的文案。 */
    logImportFailed: (reason: string) => string;
    lessonPassed: string;
    /** 扩展库菜单：Init 内置，Std / Batteries 按需下载并占用额外内存。 */
    librariesTitle: string;
    librariesHint: string;
    libraryBuiltin: string;
    /** 库名前的勾选框：勾选后启动 Lean 时自动加载。 */
    libraryDefault: string;
    libraryLoad: string;
    libraryLoading: (ratio: string) => string;
    libraryLoaded: string;
    libraryRelease: string;
    /** 一次释放所有已挂载的扩展库。 */
    libraryReleaseAll: string;
    libraryRestarting: string;
    libraryError: (message: string) => string;
    expand: string;
    panelsTitle: string;
    showPanels: string;
    resizeHint: string;
    /** 左右栏分隔条的拖拽提示。 */
    splitHint: string;
    /** 手机端编辑器工具栏：触屏没有 Ctrl+A/C/V，用按钮补齐。 */
    selectAll: string;
    copySelection: string;
    paste: string;
    copied: string;
    pasted: string;
    clipboardFailed: string;
    logCompletion: (line: number, column: number, count: number) => string;
    logHover: (line: number, column: number, found: boolean) => string;
    logRequestFailed: (method: string, message: string) => string;
    logGoalFailed: (message: string) => string;
    logTitle: string;
    footer: string;
    openFull: string;
    statusIdle: string;
    /** 低内存设备不自动启动时替代 statusIdle 的说明。 */
    statusLowMemory: string;
    /** 低内存设备的额外提示，放在启动按钮的 title 上。 */
    lowMemoryHint: string;
    statusLoading: string;
    statusStarting: string;
    statusChunks: (loaded: string, total: string) => string;
    statusChunkFallback: (name: string, message: string) => string;
    statusError: (message: string) => string;
    statusFailure: (message: string) => string;
    /** Lean 进程崩溃后的状态与恢复动作。 */
    statusCrash: string;
    statusRecovering: string;
    crashAutoTitle: string;
    crashLoopTitle: string;
    crashAutoDetail: (message: string) => string;
    crashLoopDetail: (message: string) => string;
    crashRestartFailed: string;
    crashDiagnostics: string;
    restartLean: string;
    copyError: string;
    copyErrorDone: string;
    /** 运行时资产下载失败时的换源与重试。 */
    loadFailureTitle: string;
    startFailureTitle: string;
    loadFailureDetail: string;
    /** 浏览器不支持 cross-origin isolation / SharedArrayBuffer 时的说明。 */
    compatibilityTitle: string;
    compatibilityDetail: string;
    compatibilityError: string;
    retryLoad: string;
    sourceCdn: string;
    sourceMirror: string;
    sourceGithub: string;
    sourceAuto: string;
    sourceSwitching: (label: string) => string;
    assetFallbackLabel: (name: string, message: string) => string;
    statusLspReady: string;
    statusWaitingDiagnostics: string;
    statusChecking: string;
    statusRunUnconfirmed: string;
    statusReady: (count: number, ms: number) => string;
    statusNoDiagnostics: (ms: number) => string;
    diagnosticsUnconfirmed: string;
    logSwReady: string;
    logSwFailed: (message: string) => string;
    logCacheCleared: string;
    logDraftRestored: string;
    logRuntimeReady: string;
    logRuntimeError: (message: string) => string;
    logRuntimeCrash: (message: string) => string;
    logAutoRestart: string;
    logRecovered: string;
    logSourceSwitched: (label: string) => string;
    logSourceAuto: string;
    /** documentSymbol 屏障不可用时的退化结算。 */
    logRunBarrierFallback: string;
    logInitialize: (seconds: string) => string;
    logStartFailed: (message: string) => string;
    logStopped: string;
    logLowMemory: string;
    statusMemoryLimit: string;
    logMemorySoftRecycle: (mb: string) => string;
    logMemoryImportRecycle: (mb: string) => string;
    logMemoryBackgroundRelease: (mb: string) => string;
    logMemoryHardLimit: (mb: string, limitMb: string) => string;
    /** 运行时架构手动切换（默认 wasm32，wasm64 仅作实验性试用）。 */
    runtimeTitle: string;
    /** 折叠菜单标题：实验性运行时、扩展库等高级选项收在这里。 */
    advancedTitle: string;
    runtimeWasm32: string;
    runtimeWasm64: string;
    runtimeExperimentalWarning: string;
    /** wasm64 只带 Init，扩展库选项必须置灰。 */
    runtimeWasm64NoLibraries: string;
    /** 课程需要 Std/Batteries 时自动切回稳定版运行时的提示。 */
    logRuntimeAutoStable: string;
    /** 诊断里出现缺库报错时的一键修复按钮。 */
    libraryQuickFix: (library: string) => string;
    libraryQuickFixDone: (library: string) => string;
    runtimeWasm64Unsupported: string;
    runtimeWasm64AssetNote: string;
    runtimeWasm64NotPublished: string;
    logWasm64Loading: string;
    logWasm64Stage: (stage: string) => string;
    logRuntimeArchSelected: (arch: string) => string;
  };
  privacy: {
    eyebrow: string;
    title: string;
    updated: string;
    intro: string;
    sections: Array<{ heading: string; paragraphs: string[] }>;
    note: string;
    backHome: string;
  };
  reference: {
    eyebrow: string;
    title: string;
    lead: string;
    tacticsTitle: string;
    tacticsLead: string;
    tactics: Array<{ name: string; body: string; example: string }>;
    symbolsTitle: string;
    symbolsLead: string;
    symbols: Array<{ symbol: string; abbreviation: string; meaning: string }>;
    errorsTitle: string;
    errorsLead: string;
    errors: Array<{ error: string; cause: string; fix: string }>;
    ctaTitle: string;
    ctaBody: string;
    ctaPlayground: string;
    ctaLesson: string;
  };
  footer: {
    license: string;
    note: string;
    repo: string;
    privacy: string;
  };
  notFound: {
    title: string;
    body: string;
    cta: string;
  };
};
