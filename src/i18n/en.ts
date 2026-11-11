import type { Messages } from './types';

export const en: Messages = {
  nav: {
    home: 'Home',
    lesson: 'First lesson',
    playground: 'Playground',
    github: 'GitHub',
  },
  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  language: {
    label: 'Language',
  },
  settings: {
    label: 'Settings',
    title: 'Preferences',
    autoStart: 'Download Lean automatically when the editor opens',
    autoStartHint: 'When off you start Lean yourself. The first download is about 143 MB and stays cached in this browser.',
  },
  home: {
    eyebrow: 'Lean 4 · WebAssembly · LSP in the browser',
    title: 'Learn Lean 4 in your browser',
    lead: 'A real Lean language server runs inside a Web Worker. Write code, read diagnostics and inspect goals with no toolchain install and no backend.',
    ctaPrimary: 'Start the first lesson',
    ctaSecondary: 'Open the playground',
    featuresTitle: 'Why this is different',
    features: [
      {
        title: 'A real compiler, not a mock',
        body: 'The Lean 4.34.1 Init runtime is compiled to WebAssembly, so parsing, elaboration and diagnostics all happen in the page.',
      },
      {
        title: 'Live diagnostics and goals',
        body: 'The LSP publishes diagnostics once typing settles, and the goal panel follows your cursor inside a proof.',
      },
      {
        title: 'Download once, cached for good',
        body: 'The 143 MB runtime arrives in parallel 4 MB ranges from a same-origin Cloudflare R2 gateway, is verified with SHA-256, falls back to GitHub raw, then persists in the browser.',
      },
      {
        title: 'Dual open-source license',
        body: 'Apache-2.0 or MulanPSL-2.0, your choice. Source and build pipeline are in the repository.',
      },
    ],
    limitsTitle: 'Current limits',
    limitsBody:
      'Only Init ships with it—no Std / Lean / Lake / Mathlib—so lessons stay within basic types, List and propositional logic. Cross-origin isolation is required; Chromium-based browsers work best.',
    courseTitle: 'Lesson one: your first Lean proof',
    courseBody: 'No prior Lean needed. Start with #check and #eval, then prove commutativity of addition by induction.',
    courseCta: 'Start learning',
  },
  lesson: {
    eyebrow: 'Lesson 01',
    title: 'Your first Lean proof',
    lead: 'Start from zero: evaluate an expression, read a proposition as a type, then prove it by induction. Every snippet can be sent straight to the editor.',
    openInEditor: 'Load in editor',
    editorHint: 'The panel on the right is the real editor. Start Lean, then load any snippet into it and run it while you read.',
    sections: [
      {
        heading: '1. Ask Lean a question',
        paragraphs: [
          'Lean is both a programming language and an interactive theorem prover. Use #check to inspect the type of a name and #eval to compute a value.',
        ],
        code: '#check Nat.add\n#eval 2 + 3',
        after: 'Put the cursor on the #check line and the diagnostics panel shows the type of Nat.add; #eval prints its result as information.',
      },
      {
        heading: '2. A proposition is a type',
        paragraphs: [
          'In Lean, “2 + 2 = 4” is a type, and a proof is an element of that type. When both sides reduce to the same expression by computation, rfl closes the goal immediately.',
        ],
        code: '#check (show 2 + 2 = 4 from rfl)',
        after: 'rfl means “true by definition”. It only closes computation goals; anything that needs reasoning requires a tactic.',
      },
      {
        heading: '3. Prove commutativity with induction',
        paragraphs: [
          'Goal: for any natural numbers a and b, show a + b = b + a. Unfolding alone will not finish it, so induct on a.',
          'induction a with splits the goal into a = 0 and a = succ a with the induction hypothesis ih.',
        ],
        code: 'theorem add_comm (a b : Nat) : a + b = b + a := by\n  induction a with\n  | zero => simp\n  | succ a ih => simp [Nat.succ_add, ih]',
        after: 'In the zero branch simp turns 0 + b into b; in the succ branch Nat.succ_add rewrites succ a + b to succ (a + b), then the induction hypothesis finishes it.',
      },
      {
        heading: '4. Your turn',
        paragraphs: [
          'Follow the same shape and prove a + 0 = a. Then put the cursor inside the proof and watch what the goal panel has left at each step.',
        ],
        code: 'theorem add_zero (a : Nat) : a + 0 = a := by\n  induction a with\n  | zero => rfl\n  | succ a ih => simp [ih]',
      },
    ],
    exerciseTitle: 'Exercise',
    exerciseBody: 'Write add_zero yourself, then try zero_add: 0 + a = a. Both sorry placeholders are yours to fill.',
    exerciseCta: 'Try it in the editor',
    starter:
      'theorem add_zero (a : Nat) : a + 0 = a := by\n  sorry\n\ntheorem zero_add (a : Nat) : 0 + a = a := by\n  sorry\n',
  },
  playground: {
    title: 'Lean playground',
    hint: 'The first run downloads about 143 MB of runtime; later visits use the persistent cache.',
    start: 'Start Lean',
    goalTitle: 'Goal',
    goalPlaceholder: 'Move the cursor inside a proof to see the goal',
    goalEmpty: 'No goal at the cursor',
    goalUnsupported: 'This Lean LSP does not support goals',
    diagnosticsTitle: 'Diagnostics',
    diagnosticsPlaceholder: 'Diagnostics appear after Lean starts',
    logTitle: 'Log',
    footer: 'A real Lean LSP in the browser · Init only, no Std / Lean / Lake / Mathlib · Chromium first',
    openFull: 'Open the full playground',
    statusIdle: 'Not started',
    statusLoading: 'Loading runtime… (about 143 MB on first run)',
    statusStarting: 'Starting the LSP…',
    statusChunks: (name, loaded, total) => `Chunk ${name} ${loaded}/${total} MB`,
    statusChunkFallback: (name, message) => `Chunk fallback ${name}: ${message}`,
    statusError: (message) => `Error: ${message}`,
    statusFailure: (message) => `Failed: ${message}`,
    statusLspReady: 'LSP ready',
    statusWaitingDiagnostics: 'Waiting for diagnostics…',
    statusReady: (count, ms) => `Ready · diagnostics #${count} ${ms} ms`,
    statusNoDiagnostics: (ms) => `No diagnostics · ${ms} ms`,
    logSwReady: 'Service worker ready, Lean assets stream from the same-origin R2 gateway',
    logSwFailed: (message) => `Service worker registration failed, falling back to Pages: ${message}`,
    logCacheCleared: 'Cleared the Lean asset cache (fresh=1)',
    logRuntimeReady: 'Runtime assets ready',
    logRuntimeError: (message) => `Runtime error: ${message}`,
    logInitialize: (seconds) => `initialize finished in ${seconds}s`,
    logStartFailed: (message) => `Startup failed: ${message}`,
  },
  footer: {
    license: 'Apache-2.0 OR MulanPSL-2.0',
    note: 'A real Lean LSP in the browser · Init only',
    repo: 'Source',
  },
  notFound: {
    title: 'Page not found',
    body: 'That link may have expired. Head back to the home page.',
    cta: 'Back home',
  },
};
