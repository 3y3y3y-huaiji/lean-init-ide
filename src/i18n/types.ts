/** 课程正文的块级元素：段落、可运行代码、提示框。 */
export type LessonBlock =
  | { kind: 'p'; text: string }
  | { kind: 'code'; code: string }
  | { kind: 'note'; text: string; tone?: 'info' | 'warn' };

/** 一节课程。slug 同时是路由片段与目录锚点。 */
export type LessonPage = {
  slug: string;
  /** 目录里显示的短标题，避免长标题撑破侧栏。 */
  navTitle: string;
  title: string;
  lead: string;
  blocks: LessonBlock[];
  exercise?: {
    title: string;
    body: string;
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
  };
  home: {
    eyebrow: string;
    title: string;
    lead: string;
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
  };
  lesson: {
    eyebrow: string;
    /** 左侧目录的标题。 */
    tocTitle: string;
    prev: string;
    next: string;
    /** 代码块上的按钮：就地运行并显示输出。 */
    runInEditor: string;
    /** 运行中的占位文案。 */
    running: string;
    /** 运行后没有任何输出时的提示。 */
    noOutput: string;
    /** 证明类代码没有诊断时的提示：说明目标已关闭，而不是“什么都没发生”。 */
    proofAccepted: string;
    editorHint: string;
    lessons: LessonPage[];
  };
  playground: {
    title: string;
    hint: string;
    start: string;
    /** 运行时已就绪后，同一个按钮变成释放内存的动作。 */
    stop: string;
    goalTitle: string;
    goalPlaceholder: string;
    goalEmpty: string;
    goalUnsupported: string;
    /** 光标停在声明行、证明体还有 sorry 时的引导。 */
    goalHint: string;
    diagnosticsTitle: string;
    diagnosticsPlaceholder: string;
    /** 诊断按 LSP severity 分组，避免把 #eval / #check 的输出当成报错。 */
    severityError: string;
    severityWarning: string;
    severityInfo: string;
    /** 反斜杠缩写候选的说明。 */
    abbreviationDetail: string;
    backToLesson: string;
    resetCode: string;
    /** 第一次点击重置后按钮变成的确认态。 */
    resetConfirmAction: string;
    exportCode: string;
    lessonPassed: string;
    expand: string;
    panelsTitle: string;
    showPanels: string;
    resizeHint: string;
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
    statusLspReady: string;
    statusWaitingDiagnostics: string;
    statusReady: (count: number, ms: number) => string;
    statusNoDiagnostics: (ms: number) => string;
    logSwReady: string;
    logSwFailed: (message: string) => string;
    logCacheCleared: string;
    logDraftRestored: string;
    logRuntimeReady: string;
    logRuntimeError: (message: string) => string;
    logInitialize: (seconds: string) => string;
    logStartFailed: (message: string) => string;
    logStopped: string;
    logLowMemory: string;
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
