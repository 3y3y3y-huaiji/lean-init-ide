export type LessonSection = {
  heading: string;
  paragraphs: string[];
  code?: string;
  after?: string;
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
    title: string;
    lead: string;
    openInEditor: string;
    editorHint: string;
    sections: LessonSection[];
    exerciseTitle: string;
    exerciseBody: string;
    exerciseCta: string;
    starter: string;
  };
  playground: {
    title: string;
    hint: string;
    start: string;
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
    statusChunks: (name: string, loaded: string, total: string) => string;
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
