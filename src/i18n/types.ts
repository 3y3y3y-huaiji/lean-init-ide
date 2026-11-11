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
    /** 代码块上的按钮：把这段送进右侧编辑器。 */
    runInEditor: string;
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
    diagnosticsTitle: string;
    diagnosticsPlaceholder: string;
    logTitle: string;
    footer: string;
    openFull: string;
    statusIdle: string;
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
    logRuntimeReady: string;
    logRuntimeError: (message: string) => string;
    logInitialize: (seconds: string) => string;
    logStartFailed: (message: string) => string;
    logStopped: string;
  };
  footer: {
    license: string;
    note: string;
    repo: string;
  };
  notFound: {
    title: string;
    body: string;
    cta: string;
  };
};
