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
    autoStartHint:
      'When off you start Lean yourself. The first download is about 143 MB and stays cached in this browser.',
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
    courseBody:
      'No prior Lean needed. Start with #check and #eval, then prove commutativity of addition by induction.',
    courseCta: 'Start learning',
  },
  lesson: {
    eyebrow: 'Lean 4 basics',
    tocTitle: 'Contents',
    prev: 'Previous',
    next: 'Next',
    runInEditor: 'Run on the right',
    editorHint:
      'The right panel is the real editor. Opening this page starts loading Lean automatically; once it is ready, edits show diagnostics and goals.',
    lessons: [
      {
        slug: 'first-proof',
        navTitle: '01 · Ask Lean a question',
        title: 'Ask Lean a question',
        lead: 'Start from zero: evaluate an expression, read a proposition as a type, then prove an equality yourself.',
        blocks: [
          {
            kind: 'p',
            text: 'Lean is both a programming language and an interactive theorem prover. Use #check to inspect the type of a name and #eval to compute a value.',
          },
          { kind: 'code', code: '#check Nat.add\n#eval 2 + 3' },
          {
            kind: 'note',
            text: 'Put the cursor on the #check line: the diagnostics panel shows the type of Nat.add, and #eval prints its result as information.',
          },
          {
            kind: 'p',
            text: 'In Lean, “2 + 2 = 4” is a type, and a proof is an element of that type. When both sides reduce to the same expression by computation, rfl closes the goal immediately.',
          },
          { kind: 'code', code: '#check (show 2 + 2 = 4 from rfl)' },
          {
            kind: 'note',
            tone: 'warn',
            text: 'rfl means “true by definition”. It only closes computation goals; anything that needs reasoning requires a tactic.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Change #eval 2 + 3 into a computation you like, then write your own #check.',
          cta: 'Try it in the editor',
          starter: '#check Nat.mul\n#eval 6 * 7\n',
        },
      },
      {
        slug: 'implication',
        navTitle: '02 · Implication',
        title: 'Propositions are types',
        lead: '“If P then Q” is a function type in Lean. Once that clicks, the shape of most proofs becomes obvious.',
        blocks: [
          {
            kind: 'p',
            text: 'In type theory, a proposition and a type are the same thing: P holds exactly when the type P has an element, and that element is the proof.',
          },
          {
            kind: 'p',
            text: 'So “P implies P” is just “a function from P to P”. Proving it means writing the identity function.',
          },
          {
            kind: 'code',
            code: 'theorem id_imp (P : Prop) : P → P := by\n  intro h\n  exact h',
          },
          {
            kind: 'note',
            text: 'intro h turns the goal P → P into “given h : P, prove P”; exact h hands back that assumption.',
          },
          {
            kind: 'p',
            text: 'Implications compose. Chaining two arrows means feeding the output of the first into the second.',
          },
          {
            kind: 'code',
            code: 'theorem trans_imp (P Q R : Prop) (h1 : P → Q) (h2 : Q → R) : P → R := by\n  intro hp\n  exact h2 (h1 hp)',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'If the goal is P → Q, your first move is almost always intro. Trying to reason about it without introducing the hypothesis is where people get stuck.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Prove (P → Q) → (Q → R) → P → R, the arrow form of trans_imp.',
          cta: 'Try it in the editor',
          starter: 'theorem chain (P Q R : Prop) : (P → Q) → (Q → R) → P → R := by\n  sorry\n',
        },
      },
      {
        slug: 'connectives',
        navTitle: '03 · And, or',
        title: 'Building and using ∧ and ∨',
        lead: 'Each connective has two rules: how to construct it, and how to use it. Four moves cover almost everything.',
        blocks: [
          {
            kind: 'p',
            text: 'To prove P ∧ Q you must supply a proof of P and a proof of Q. ⟨hp, hq⟩ is shorthand for And.intro.',
          },
          {
            kind: 'code',
            code: 'theorem and_self (P Q : Prop) (hp : P) (hq : Q) : P ∧ Q := ⟨hp, hq⟩',
          },
          {
            kind: 'p',
            text: 'Going the other way, if h : P ∧ Q then h.1 gives P and h.2 gives Q.',
          },
          {
            kind: 'code',
            code: 'theorem and_comm (P Q : Prop) : P ∧ Q → Q ∧ P := by\n  intro h\n  exact ⟨h.2, h.1⟩',
          },
          {
            kind: 'p',
            text: 'Disjunction is asymmetric: to prove P ∨ Q you only need one side, via Or.inl or Or.inr. To use P ∨ Q you must split into cases, which is what cases does.',
          },
          {
            kind: 'code',
            code: 'theorem or_comm (P Q : Prop) : P ∨ Q → Q ∨ P := by\n  intro h\n  cases h with\n  | inl hp => exact Or.inr hp\n  | inr hq => exact Or.inl hq',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'Construct with inl / inr, consume with cases. Reversing them is the most common blocker: you cannot extract a side out of an “or” without case analysis.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Prove (P ∧ Q) ∨ R → P ∨ R. Use cases on the disjunction, then project from the conjunction.',
          cta: 'Try it in the editor',
          starter: 'theorem or_and (P Q R : Prop) : (P ∧ Q) ∨ R → P ∨ R := by\n  sorry\n',
        },
      },
      {
        slug: 'induction',
        navTitle: '04 · Induction',
        title: 'Prove commutativity by induction',
        lead: 'Addition is not commutative by computation alone. It needs induction on one argument — the most important proof pattern in Lean.',
        blocks: [
          {
            kind: 'p',
            text: 'Goal: for any natural numbers a and b, show a + b = b + a. Unfolding alone will not finish it, so induct on a.',
          },
          {
            kind: 'p',
            text: 'induction a with splits the goal into a = 0 and a = succ a, the latter carrying the induction hypothesis ih.',
          },
          {
            kind: 'code',
            code: 'theorem add_comm (a b : Nat) : a + b = b + a := by\n  induction a with\n  | zero => simp\n  | succ a ih => simp [Nat.succ_add, Nat.add_succ, ih]',
          },
          {
            kind: 'note',
            text: 'In the zero branch simp turns 0 + b into b; in the succ branch Nat.succ_add rewrites succ a + b to succ (a + b), then ih finishes it.',
          },
          {
            kind: 'p',
            text: 'Afterwards, move the cursor line by line inside the by block. The first line of the goal panel keeps showing what the theorem claims; only the second line tracks where you are.',
          },
          {
            kind: 'code',
            code: 'theorem add_zero (a : Nat) : a + 0 = a := by\n  induction a with\n  | zero => rfl\n  | succ a ih => simp',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Write add_zero yourself, then try zero_add: 0 + a = a. Both sorry placeholders are yours to fill.',
          cta: 'Try it in the editor',
          starter:
            'theorem add_zero (a : Nat) : a + 0 = a := by\n  sorry\n\ntheorem zero_add (a : Nat) : 0 + a = a := by\n  sorry\n',
        },
      },
    ],
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
    footer:
      'A real Lean LSP in the browser · Init only, no Std / Lean / Lake / Mathlib · Chromium first',
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
    logSwFailed: (message) =>
      `Service worker registration failed, falling back to Pages: ${message}`,
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
