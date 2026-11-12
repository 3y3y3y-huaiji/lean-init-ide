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
    continueCta: 'Continue learning',
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
    courseTitle: 'Lesson one: meet Lean',
    courseBody:
      'Start with what Lean is and why this course only uses Init, then move from #check and #eval to your first inductive proof.',
    courseCta: 'Start learning',
  },
  lesson: {
    eyebrow: 'Lean 4 basics',
    tocTitle: 'Contents',
    prev: 'Previous',
    next: 'Next',
    runInEditor: 'Run',
    running: 'Running…',
    noOutput: 'No errors, no output',
    proofAccepted: 'Proof accepted · Lean has no remaining goals',
    editorHint:
      'The right panel is the real editor. Opening this page starts loading Lean automatically; once it is ready, edits show diagnostics and goals.',
    lessons: [
      {
        slug: 'what-is-lean',
        navTitle: '01 · Meet Lean',
        title: 'What is Lean?',
        lead: 'Before writing the first proof, get clear on what Lean is and why this course only uses Init.',
        blocks: [
          {
            kind: 'p',
            text: 'Lean is both a programming language and an interactive theorem prover. In one file you can compute 2 + 3 and prove that a + b = b + a for all natural numbers.',
          },
          { kind: 'code', code: '#eval 2 + 3' },
          {
            kind: 'p',
            text: 'The most counter-intuitive idea in Lean: propositions are types, and a proof is an element of that type. Keep that in mind; lesson 2 unpacks it.',
          },
          { kind: 'code', code: '#check Nat.add' },
          {
            kind: 'note',
            text: 'This course only ships Init, the core library bundled with Lean. No Std, Lean, Lake or Mathlib, so you will not see import Mathlib later.',
          },
          {
            kind: 'p',
            text: 'The editor runs entirely in your browser: the first visit downloads about 143 MB, later visits use a persistent cache, and your code is never uploaded.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Change the #eval expression to something you like, then #check a name you are curious about.',
          cta: 'Try it in the editor',
          starter: '#eval 6 * 7\n#check Nat.mul\n',
        },
      },
      {
        slug: 'first-proof',
        navTitle: '02 · Ask Lean a question',
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
            text: 'Click Run: the output first shows the type of Nat.add, then the value of #eval. The goal of this lesson is to tell the two apart.',
          },
          {
            kind: 'p',
            text: 'In Lean, “2 + 2 = 4” is a type, and a proof is an element of that type. When both sides reduce to the same expression by computation, rfl closes the goal immediately.',
          },
          {
            kind: 'code',
            code: '#check (2 + 2 = 4)\nexample : 2 + 2 = 4 := rfl',
          },
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
        navTitle: '03 · Implication',
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
        navTitle: '04 · And, or',
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
        navTitle: '05 · Induction',
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
            code: 'theorem add_comm (a b : Nat) : a + b = b + a := by\n  induction a with\n  | zero => simp\n  | succ a ih => simp only [Nat.succ_add, Nat.add_succ, ih]',
          },
          {
            kind: 'note',
            text: 'In the zero branch simp turns 0 + b into b; in the succ branch Nat.succ_add rewrites succ a + b to succ (a + b), then ih finishes it.',
          },
          {
            kind: 'p',
            text: 'The goal of this lesson is commutativity, a + b = b + a. To watch the proof state step by step, open the editor and put the cursor inside the by block: the first line of the Goal panel is always the theorem’s goal, and the lines below describe the current step.',
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
      {
        slug: 'rewrite',
        navTitle: '06 · Rewriting with rw',
        title: 'Rewrite the goal with rw',
        lead: 'rfl only closes goals that are equal by definition. When a subexpression must be replaced, feed an equation into rw.',
        blocks: [
          {
            kind: 'p',
            text: 'Look at both sides first: if computation turns them into the same expression, rfl is enough. Otherwise, rewrite the goal with a known equation.',
          },
          {
            kind: 'code',
            code: 'theorem add_comm_rw (a b : Nat) : a + b = b + a := by\n  rw [Nat.add_comm]',
          },
          {
            kind: 'p',
            text: 'rw uses an equation left to right by default: it replaces the left side with the right side in the goal. rw [← h] goes the other way.',
          },
          {
            kind: 'code',
            code: 'theorem eq_swap (a b : Nat) (h : a = b) : b = a := by\n  rw [h]',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'rw rewrites every matching occurrence in the goal. If you want a single spot changed, reconsider the approach before one rw turns the goal inside out.',
          },
          {
            kind: 'code',
            code: 'theorem add_assoc_rw (a b c : Nat) : a + b + c = a + (b + c) := by\n  rw [Nat.add_assoc]',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Prove a * 1 = a with one existing multiplication equation, using only rw.',
          cta: 'Try it in the editor',
          starter: 'theorem mul_one_rw (a : Nat) : a * 1 = a := by\n  sorry\n',
        },
      },
      {
        slug: 'simp',
        navTitle: '07 · simp and simplification',
        title: 'Let simp finish the goal',
        lead: 'simp is a curated set of rewrite rules. Used well it closes computation goals in one line; used blindly it can wander.',
        blocks: [
          {
            kind: 'p',
            text: 'simp applies every equation tagged @[simp]. Goals like a + 0 = a reduce by definition, so one simp finishes them.',
          },
          {
            kind: 'code',
            code: 'theorem add_zero_simp (a : Nat) : a + 0 = a := by\n  simp',
          },
          {
            kind: 'p',
            text: 'simp only restricts the rule set to exactly what you list, which keeps behaviour predictable.',
          },
          {
            kind: 'code',
            code: 'theorem succ_add_simp (a b : Nat) : Nat.succ a + b = Nat.succ (a + b) := by\n  simp only [Nat.succ_add]',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'simp is a finisher: it stops when the goal becomes True. When it makes no progress, the goal needs intro, cases or induction instead.',
          },
          {
            kind: 'code',
            code: 'theorem add_succ_simp (a b : Nat) : a + Nat.succ b = Nat.succ (a + b) := by\n  simp only [Nat.add_succ]',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Remove both zeros in one go: a + 0 + 0 = a.',
          cta: 'Try it in the editor',
          starter: 'theorem add_zero_twice (a : Nat) : a + 0 + 0 = a := by\n  sorry\n',
        },
      },
      {
        slug: 'quantifiers',
        navTitle: '08 · Forall and exists',
        title: 'Using ∀ and ∃',
        lead: '∀ is a function type; ∃ is a dependent pair. One takes an argument, the other unpacks a witness.',
        blocks: [
          {
            kind: 'p',
            text: 'An element of ∀ n : Nat, P n is a function: give it n and it returns a proof of P n. So to prove a statement for every n, intro n brings n into context.',
          },
          {
            kind: 'code',
            code: 'theorem forall_apply (P : Nat → Prop) (h : ∀ n, P n) : P 0 := h 0',
          },
          {
            kind: 'p',
            text: '∃ n, P n is a package: a concrete n (the witness) plus a proof of P n. Build it with the anonymous constructor ⟨n, proof⟩.',
          },
          {
            kind: 'code',
            code: 'theorem exists_intro : ∃ n : Nat, n + n = 4 := ⟨2, rfl⟩',
          },
          {
            kind: 'p',
            text: 'To use an existential you must unpack it: cases h with | intro n hn => ... where n is the witness and hn is the property.',
          },
          {
            kind: 'code',
            code: 'theorem exists_swap (P Q : Nat → Prop) (h : ∃ n, P n ∧ Q n) : ∃ n, Q n ∧ P n := by\n  cases h with\n  | intro n hn => exact ⟨n, hn.2, hn.1⟩',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'Here intro unpacks an existential; it is not the intro that introduces a hypothesis at the start of a proof. Same name, different job.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Apply the forall statement to n = 3 and prove P 3.',
          cta: 'Try it in the editor',
          starter: 'theorem forall_three (P : Nat → Prop) (h : ∀ n, P n) : P 3 := by\n  sorry\n',
        },
      },
      {
        slug: 'list-structure',
        navTitle: '09 · Lists and structures',
        title: 'Inductive types and structures',
        lead: 'List inducts just like Nat, except the constructors are nil and cons; structure packs several values into one new type.',
        blocks: [
          {
            kind: 'p',
            text: 'List Nat has two constructors: [] and x :: xs. induction xs with therefore has two branches: nil and cons.',
          },
          {
            kind: 'code',
            code: 'theorem length_map_zero (xs : List Nat) : (xs.map (fun x => x + 0)).length = xs.length := by\n  induction xs with\n  | nil => rfl\n  | cons x xs ih => simp [ih]',
          },
          {
            kind: 'p',
            text: 'structure packs fields into a type; the anonymous constructor fills them in declaration order, and dot notation accesses fields.',
          },
          {
            kind: 'code',
            code: 'structure Point where\n  x : Nat\n  y : Nat\n\ndef Point.sum (p : Point) : Nat := p.x + p.y\n\n#eval (Point.mk 3 4).sum',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'structure ships with Init; do not expect Std deriving instances or extended syntax here.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Add a scale function to Point that multiplies both coordinates by k, then prove scaling by 1 leaves it unchanged.',
          cta: 'Try it in the editor',
          starter:
            'structure Point where\n  x : Nat\n  y : Nat\n\ndef Point.scale (p : Point) (k : Nat) : Point :=\n  ⟨p.x * k, p.y * k⟩\n\ntheorem scale_one (p : Point) : p.scale 1 = p := by\n  sorry\n',
        },
      },
    ],
  },
  playground: {
    title: 'Lean playground',
    hint: 'The first run downloads about 143 MB of runtime; later visits use the persistent cache.',
    start: 'Start Lean',
    stop: 'Stop Lean',
    goalTitle: 'Goal',
    goalPlaceholder: 'Move the cursor inside a proof to see the goal',
    goalEmpty: 'No goal at the cursor',
    goalUnsupported: 'This Lean LSP does not support goals',
    goalHint: 'Move the cursor inside the by block to see the current goal',
    diagnosticsTitle: 'Diagnostics',
    diagnosticsPlaceholder: 'Diagnostics appear after Lean starts',
    severityError: 'Error',
    severityWarning: 'Warning',
    severityInfo: 'Info',
    abbreviationDetail: 'Unicode abbreviation',
    backToLesson: 'Back to lesson',
    resetCode: 'Reset exercise',
    resetConfirm: 'Reset will discard your current code. Return to the starter?',
    exportCode: 'Export .lean',
    lessonPassed: 'Exercise passed',
    expand: 'Expand',
    panelsTitle: 'Panels',
    showPanels: 'Visible panels',
    resizeHint: 'Drag to resize the editor',
    logCompletion: (line, column, count) => `completion @${line}:${column} -> ${count} items`,
    logHover: (line, column, found) => `hover ${line}:${column} -> ${found ? 'result' : 'null'}`,
    logRequestFailed: (method, message) => `${method} failed: ${message}`,
    logGoalFailed: (message) => `$/lean/plainGoal failed: ${message}`,
    logTitle: 'Log',
    footer:
      'A real Lean LSP in the browser · Init only, no Std / Lean / Lake / Mathlib · Chromium first',
    openFull: 'Open the full playground',
    statusIdle: 'Not started',
    statusLowMemory: 'Low-memory device · start manually',
    lowMemoryHint:
      'This device reports limited memory. Lean needs about 400 MB free, so the download no longer starts automatically — start it yourself when the device has room.',
    statusLoading: 'Loading runtime… (about 143 MB on first run)',
    statusStarting: 'Starting the LSP…',
    statusChunks: (loaded, total) => `${loaded} / ${total} MB`,
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
    logDraftRestored: 'Restored the local draft from your last visit',
    logRuntimeReady: 'Runtime assets ready',
    logRuntimeError: (message) => `Runtime error: ${message}`,
    logInitialize: (seconds) => `initialize finished in ${seconds}s`,
    logStartFailed: (message) => `Startup failed: ${message}`,
    logStopped: 'Lean engine stopped, worker and memory released',
    logLowMemory:
      'Low-memory device: auto-start disabled and the persistent cache capped at 128 MB',
  },
  privacy: {
    eyebrow: 'Transparency',
    title: 'Privacy notice',
    updated: 'Last updated: 2026-11-12',
    intro:
      'This is a front-end-only teaching project: Lean runs inside your browser and the code you write is never uploaded. To diagnose startup failures and performance, we collect a small amount of anonymous runtime telemetry.',
    sections: [
      {
        heading: 'What we collect',
        paragraphs: [
          'The page type (home / lesson / playground), interface language and a timestamp.',
          'Startup stages: whether the service worker registered, which asset source was used, bytes downloaded, download duration, time until the language server is ready, and time to the first diagnostics.',
          'Error summaries: error name, a message truncated to 120 characters, and a stack frame count; never the code in your editor.',
          'A device tier flag: whether the device reports limited memory (derived from navigator.deviceMemory); no model or device identifier is recorded.',
        ],
      },
      {
        heading: 'What we do not collect',
        paragraphs: [
          'Our code sets no cookies, writes no user identifier, performs no fingerprinting, and loads no advertising or social scripts.',
          'Editor contents and exercise code are never sent to a server.',
        ],
      },
      {
        heading: 'Third-party analytics',
        paragraphs: [
          'The site enables Cloudflare Web Analytics: Cloudflare collects aggregate page views and Core Web Vitals without cookies or fingerprinting. Those requests go straight to Cloudflare and never touch our /api/telemetry receiver.',
          'Cloudflare processes that data under its own privacy policy; this site only sees aggregate reports and cannot link them to a person.',
        ],
      },
      {
        heading: 'How it is used',
        paragraphs: [
          'The data only answers questions such as “which startup step fails”, “which source is slow” and “do low-memory devices fail”. It is sent at a 50% sample rate, with error events always sent.',
          'The receiver validates the payload and writes short-lived service logs (Cloudflare Workers Logs, auto-expiring after a few days). It is never stored in a database, sold or shared.',
          'Cloudflare, as the host, processes request metadata (including IP) in short-lived logs for security and troubleshooting; retention is set by the platform and we do not correlate it with anything.',
        ],
      },
      {
        heading: 'Local storage',
        paragraphs: [
          'Theme, language, auto-start preference, lesson progress and exercise drafts live in localStorage; drafts never leave your browser.',
          'The Lean runtime and the diagnostic source preference live in CacheStorage / IndexedDB, so the ~143 MB download is not repeated.',
          'You can clear all of it from your browser settings at any time; the site still works.',
        ],
      },
      {
        heading: 'How to opt out',
        paragraphs: [
          'With Do Not Track enabled, this site sends no runtime telemetry at all.',
          'You can also block /api/telemetry with a content blocker; no functionality is affected.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          'For privacy questions or deletion requests, reach us through the GitHub Issues of the repository.',
        ],
      },
    ],
    note: 'This page describes the project; it is not legal advice.',
    backHome: 'Back home',
  },
  footer: {
    license: 'Apache-2.0 OR MulanPSL-2.0',
    note: 'A real Lean LSP in the browser · Init only',
    repo: 'Source',
    privacy: 'Privacy',
  },
  notFound: {
    title: 'Page not found',
    body: 'That link may have expired. Head back to the home page.',
    cta: 'Back home',
  },
};
