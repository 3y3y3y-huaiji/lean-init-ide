import { REPO_URL } from '../feedback';
import { LEAN_RUNTIME_VERSION, SITE_LICENSE } from '../meta';
import type { Messages } from './types';

export const en: Messages = {
  nav: {
    home: 'Home',
    lesson: 'First lesson',
    playground: 'Playground',
    github: 'GitHub',
    reference: 'Reference',
    challenges: 'Challenges',
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
      'When off you start Lean yourself. The first download is about 102 MB and stays cached in this browser.',
    assetSource: 'Lean runtime download source',
    assetSourceHint:
      'Auto picks the nearest source from browser language and timezone: China mirror for Chinese or Mainland China, Site CDN otherwise. Takes effect the next time Lean starts.',
    clearCache: 'Clear runtime cache',
    clearCacheHint:
      'Deletes the downloaded Lean runtime (about 102 MB). The next start downloads it again.',
    clearCacheBusy: 'Clearing…',
    clearCacheDone: 'Cleared. The runtime will be downloaded again on the next start.',
    clearCacheFailed: 'Could not clear the cache. Try again.',
  },
  home: {
    eyebrow: 'Lean 4.35.0 · Init + Std + Batteries · LSP in the browser',
    title: 'Run a real Lean 4 theorem prover in your browser',
    lead: 'Not a regex mock, and not code shipped to a server: the full compiler and language server live in a Web Worker. Open the page and write your first proof in 30 seconds.',
    heroNote:
      'Unit tests only cover the cases you remembered to write. Lean uses mathematical logic to rule out every possible input at once, and the compiler stops you with a red line the moment a step breaks.',
    factsTitle: 'Key facts',
    facts: (lessons, challenges) => [
      `${LEAN_RUNTIME_VERSION} compiler and language server compiled to WebAssembly, running in a browser Web Worker`,
      'Init built in; Std and Batteries mount on demand. No Lean / Lake / Mathlib',
      '100% client-side, zero backend; your code never leaves the browser',
      `${lessons} bilingual lessons (Chinese + English) and ${challenges} math challenges`,
      `Free and open source (${SITE_LICENSE}): ${REPO_URL}`,
    ],
    ctaPrimary: 'Start the first lesson',
    continueCta: 'Continue learning',
    ctaSecondary: 'Open the playground',
    featuresTitle: 'Under the hood',
    features: [
      {
        title: 'A real compiler, not a mock',
        body: 'The Lean 4.35.0 compiler and language server are compiled to WebAssembly and run in a Web Worker, handling parsing, elaboration and diagnostics. No regex shortcut ever decides whether a proof is valid.',
      },
      {
        title: 'Cross-origin isolation for wasm threads',
        body: 'COOP/COEP and SharedArrayBuffer let Lean’s memory model run unchanged, which is the biggest difference from an ordinary online sandbox.',
      },
      {
        title: '102 MB runtime in verified 4 MB ranges',
        body: 'A Service Worker streams the runtime from R2 through the same-origin gateway, verifies every range with SHA-256, falls back to other sources, and then uses the persistent browser cache.',
      },
      {
        title: 'Init + Std + Batteries, split into packs',
        body: 'Only Init downloads by default. Engineering lessons mount Std and Batteries on demand and release them when they are no longer needed.',
      },
    ],
    limitsTitle: 'Current limits',
    limitsBody:
      'Init ships built in; Std and Batteries load on demand as extension packs—no Lean / Lake / Mathlib. Cross-origin isolation is required; Chromium-based browsers work best.',
    courseTitle: 'Lesson one: a compiler that does math',
    courseBody:
      'Treat Lean as a type checker that understands mathematical sentences: run #eval and #check first, then write your first zero-gap proof.',
    courseCta: 'Start learning',
    pathsTitle: 'Three learning paths',
    pathMeta: (count) => `${count} lessons`,
    challengesTitle: 'Math challenges',
    challengesBody:
      'Six classic puzzles explained for non-programmers. No setup: open one and prove it in the browser. It sits beside the courses and shares the same Lean runtime.',
    challengesCta: 'Take a challenge',
    demo: {
      title: 'Five seconds first: a proof makes the goal shrink, line by line',
      body: 'No 102 MB runtime download. This is a real goal; press Next to see what Lean does to ⊢ at each step.',
      steps: [
        {
          goal: '⊢ 2 + 2 = 4',
          note: 'The referee hands you the goal: prove that 2 + 2 equals 4.',
        },
        {
          goal: '⊢ 4 = 4',
          note: 'Lean computes first: 2 + 2 reduces to 4, so the goal becomes “4 equals 4”.',
        },
        {
          goal: 'No goals left',
          note: 'Both sides are identical, so rfl stamps it; the proof is done.',
        },
      ],
      stepLabel: (current, total) => `Step ${current} / ${total}`,
      next: 'Next step',
      reset: 'Reset',
    },
  },
  challenges: {
    eyebrow: 'Math challenges',
    title: 'Prove six classic puzzles in Lean',
    lead: 'Every puzzle starts with a plain-language question: what makes a number even, why swapping addends changes nothing, and why nothing can be both odd and even. No programming background is needed—the "--" comments in the code walk you through it.',
    cardCta: 'Start the challenge',
    editorTitle: 'Proof practice',
    intro: {
      title: 'First time here? 30 seconds to understand this page',
      body: 'Lean is a proof checker: you write a proof in the editor and it checks every step, much like a compiler checks code. It does not try a few examples; it confirms the statement holds in every case. You do not need to know programming—start by reading the comments that begin with "--".',
      steps: [
        {
          title: '1. Read the question',
          text: 'Every challenge explains the result in everyday language first; the question itself contains no Lean code.',
        },
        {
          title: '2. Watch the Goal panel',
          text: 'Whatever follows “⊢” is what Lean still wants you to prove. Move the cursor through the proof and the goal updates.',
        },
        {
          title: '3. Close the gap with tactics',
          text: 'A tactic button inserts a name into the code; fill in its arguments as the comments suggest. Stuck? Expand the reference solution and compare step by step.',
        },
      ],
      codeNote:
        'Grey lines starting with "--" are explanation comments and Lean skips them. "sorry" marks a gap that is still unproved—that is the placeholder you replace.',
    },
    detail: {
      back: '← Back to all challenges',
      goalsRemaining: (count) => `${count} goal${count === 1 ? '' : 's'} left to prove`,
      goalsNone:
        'No goals right now: put the cursor inside the proof and the Goal panel updates live',
      tacticsTitle: 'Tactics for this challenge',
      tacticsHint:
        'Click a tactic name to insert it at the cursor; one line below explains what each one does.',
      copyLink: 'Copy share link',
      copyLinkDone: 'Link copied',
      copyLinkFailed: 'Copy failed—please copy from the address bar',
      hintLabel: 'Hint',
      solutionTitle: 'Reference solution',
      solutionHint: 'Try it yourself first; expand only when stuck.',
      loadSolution: 'Load reference solution',
      openInPlayground: 'Open in the editor',
      starterNote:
        'Lines starting with "--" are explanation comments that Lean ignores; replace sorry with a real proof to close the goal.',
      feedbackHint: 'Something wrong with this puzzle? Feedback includes the current challenge.',
      feedbackBug: 'Report a bug',
      feedbackIssueTitle: (title) => `[Challenge] ${title}`,
    },
  },
  lesson: {
    eyebrow: 'Lean 4 basics',
    tocTitle: 'Contents',
    tracks: {
      intro: {
        title: 'Getting started',
        lead: 'From #eval to induction: get comfortable with Lean syntax and the common proof patterns.',
      },
      math: {
        title: 'Math & verification',
        lead: 'From divisibility and parity to sets and algorithm correctness, written as machine-checked code.',
      },
      eng: {
        title: 'Engineering',
        lead: 'For backend, systems and security engineers: use Std and Batteries to verify real data structures, bounds and state invariants.',
      },
    },
    prev: 'Previous',
    next: 'Next',
    runInEditor: 'Run',
    goalLabel: 'Goal changes',
    hintLabel: 'Hint',
    runCrashed: 'Run failed: the Lean process may have crashed. Your code is preserved.',
    restartLean: 'Restart Lean',
    restarting: 'Restarting…',
    restartDone: 'Restarted — click Run again',
    restartFailed: 'Restart failed. Reload the page and try again.',
    completedLabel: 'Completed',
    exerciseCompletionHint:
      'Keep the named theorem, remove every sorry and leave no errors; the lesson is then marked as completed automatically.',
    requiresHint: (libraries) =>
      `This lesson needs ${libraries}; Lean loads it automatically on start.`,
    feedbackHint: 'Unclear or spotted a mistake? Feedback includes this lesson automatically.',
    feedbackClarity: 'Something is unclear',
    feedbackBug: 'Report a bug',
    feedbackIssueTitle: (title) => `[Lesson] ${title}`,
    completedCount: (done, total) => `${done} / ${total} completed`,
    running: 'Running…',
    noOutput: 'No errors, no output',
    proofAccepted: 'Proof accepted · Lean has no remaining goals',
    editorHint:
      'The right panel is the real editor. Opening this page starts loading Lean automatically; once it is ready, edits show diagnostics and goals.',
  },
  playground: {
    title: 'Lean playground',
    hint: 'The first run downloads about 102 MB of runtime; later visits use the persistent cache.',
    summary: `Real ${LEAN_RUNTIME_VERSION} compiler · Init built in, Std / Batteries on demand · 100% client-side WebAssembly Worker · zero backend`,
    defaultCode: `open Classical

noncomputable section

-- "This is obvious."
example (n : Nat) : n + 0 = n := rfl

-- "Left as an exercise to the reader."
theorem exercise_for_reader (a b : Nat) : a + b = b + a := by
  sorry

-- "By the axiom of choice, just pick one."
example (α : Type) (h : Nonempty α) : α := Classical.choice h

#check Classical.choice

end
`,
    start: 'Start Lean',
    stop: 'Stop Lean',
    goalTitle: 'Goal',
    goalPlaceholder: 'Move the cursor inside a proof to see the goal',
    goalEmpty: 'No goal at the cursor',
    goalUnsupported: 'This Lean LSP does not support goals',
    goalHint: 'Move the cursor inside the by block to see the current goal',
    goalSorryHint:
      'sorry closes the goal for now, so Lean reports no goal. Move the cursor inside the by block, or delete sorry, to see what still needs proving.',
    diagnosticsTitle: 'Diagnostics',
    diagnosticsPlaceholder: 'Diagnostics appear after Lean starts',
    runPassed: 'Run passed',
    runPassedDetail: (warnings, ms) =>
      warnings > 0
        ? `${warnings} warning${warnings === 1 ? '' : 's'} · ${ms} ms`
        : `No errors · ${ms} ms`,
    severityError: 'Error',
    severityWarning: 'Warning',
    severityInfo: 'Info',
    abbreviationDetail: 'Unicode abbreviation',
    backToLesson: 'Back to lesson',
    challengeNoticeTitle: 'Opened from a math challenge',
    challengeNoticeBody:
      'The puzzle statement is below. If this browser already has an editor draft, it will not be overwritten silently.',
    challengeNoticeLoad: 'Load this challenge',
    challengeNoticeKeep: 'Keep my draft',
    challengeNoticeKept: 'Your draft is preserved. Load the challenge whenever you are ready.',
    challengeLoaded: 'Loaded the challenge starter code.',
    resetCode: 'Reset exercise',
    resetConfirmAction: 'Confirm reset?',
    exportCode: 'Export .lean',
    lessonPassed: 'Exercise passed',
    librariesTitle: 'Libraries',
    librariesHint:
      'Checked libraries load automatically when Lean starts; each button only loads or releases its own library.',
    libraryBuiltin: 'built in',
    libraryDefault: 'Load automatically on start',
    libraryLoad: 'Load',
    libraryLoading: (ratio) => `Downloading ${ratio}`,
    libraryLoaded: 'Loaded',
    libraryRelease: 'Release',
    libraryReleaseAll: 'Release all',
    libraryRestarting: 'Restarting Lean…',
    libraryError: (message) => `Failed to load library: ${message}`,
    expand: 'Expand',
    panelsTitle: 'Panels',
    showPanels: 'Visible panels',
    resizeHint: 'Drag to resize the editor',
    splitHint: 'Drag to resize the columns',
    selectAll: 'Select all',
    copySelection: 'Copy',
    paste: 'Paste',
    copied: 'Copied',
    pasted: 'Pasted',
    clipboardFailed: 'Clipboard unavailable. Long-press the editor to use the system menu.',
    logCompletion: (line, column, count) => `completion @${line}:${column} -> ${count} items`,
    logHover: (line, column, found) => `hover ${line}:${column} -> ${found ? 'result' : 'null'}`,
    logRequestFailed: (method, message) => `${method} failed: ${message}`,
    logGoalFailed: (message) => `$/lean/plainGoal failed: ${message}`,
    logTitle: 'Log',
    footer:
      'A real Lean LSP in the browser · Init built in, Std / Batteries on demand · no Lean / Lake / Mathlib · Chromium first',
    openFull: 'Open the full playground',
    statusIdle: 'Not started',
    statusLowMemory: 'Low-memory device · start manually',
    lowMemoryHint:
      'This device reports limited memory. Lean needs about 400 MB free, so the download no longer starts automatically — start it yourself when the device has room.',
    statusLoading: 'Loading runtime… (about 102 MB on first run)',
    statusStarting: 'Starting the LSP…',
    statusChunks: (loaded, total) => `${loaded} / ${total} MB`,
    statusChunkFallback: (name, message) => `Chunk fallback ${name}: ${message}`,
    statusError: (message) => `Error: ${message}`,
    statusFailure: (message) => `Failed: ${message}`,
    statusCrash: 'The Lean process crashed',
    statusRecovering: 'Lean crashed — restarting automatically…',
    crashAutoTitle: 'Lean crashed — restarting automatically…',
    crashLoopTitle: 'Lean crashed repeatedly',
    crashAutoDetail: (message) =>
      `Your code is preserved. If it crashes again, edit the code and restart manually. Error: ${message}`,
    crashLoopDetail: (message) =>
      `The current code may have triggered deep recursion or a stack overflow inside Lean. Your code is preserved; edit it and restart manually. Error: ${message}`,
    crashRestartFailed:
      'Automatic restart failed. Check your network or cache, then retry manually.',
    crashDiagnostics: 'Lean crashed before producing diagnostics',
    restartLean: 'Restart Lean',
    copyError: 'Copy error',
    copyErrorDone: 'Copied',
    loadFailureTitle: 'Runtime download failed',
    startFailureTitle: 'Lean failed to start',
    loadFailureDetail:
      'The Lean runtime did not download completely. Retry, or switch to another source. If a VPN is on, turn it off and try again.',
    compatibilityTitle: 'This browser cannot run the Lean runtime',
    compatibilityDetail:
      'The playground needs cross-origin isolation (COOP/COEP) and SharedArrayBuffer. Use desktop Chrome or Edge, or open the site in a full browser; in-app browsers and some Android WebViews are not supported.',
    compatibilityError:
      'Lean LSP requires cross-origin isolation and SharedArrayBuffer; this browser does not expose them.',
    retryLoad: 'Retry',
    sourceCdn: 'Site CDN',
    sourceMirror: 'China mirror',
    sourceGithub: 'GitHub',
    sourceAuto: 'Auto',
    sourceSwitching: (label) => `Retrying with ${label}…`,
    assetFallbackLabel: (name, message) => `Last fallback: ${name}: ${message}`,
    statusLspReady: 'LSP ready',
    statusWaitingDiagnostics: 'Waiting for diagnostics…',
    statusChecking: 'Checking file…',
    statusRunUnconfirmed: 'File check unconfirmed',
    statusReady: (count, ms) => `Ready · diagnostics #${count} ${ms} ms`,
    statusNoDiagnostics: (ms) => `No diagnostics · ${ms} ms`,
    diagnosticsUnconfirmed:
      'Could not confirm file check completed (Lean may still be busy or timed out)',
    logSwReady: 'Service worker ready; Lean assets stream in parallel chunks',
    logSwFailed: (message) =>
      `Service worker registration failed, falling back to Pages: ${message}`,
    logCacheCleared: 'Cleared the Lean asset cache (fresh=1)',
    logDraftRestored: 'Restored the local draft from your last visit',
    logRuntimeReady: 'Runtime assets ready',
    logRuntimeError: (message) => `Runtime error: ${message}`,
    logRuntimeCrash: (message) => `Lean process crashed: ${message}`,
    logAutoRestart: 'Restarting Lean automatically…',
    logRecovered: 'Lean restarted; editor contents preserved',
    logSourceSwitched: (label) => `Switched asset source to ${label}; retrying…`,
    logSourceAuto: 'Restored automatic asset source selection',
    logRunBarrierFallback: 'Could not confirm file processing finished; holding pass banner',
    logInitialize: (seconds) => `initialize finished in ${seconds}s`,
    logStartFailed: (message) => `Startup failed: ${message}`,
    logStopped: 'Lean engine stopped, worker and memory released',
    logLowMemory:
      'Low-memory device: auto-start disabled and the persistent cache capped at 128 MB',
    statusMemoryLimit: 'Near memory limit · stopped safely',
    logMemorySoftRecycle: (mb) =>
      `Memory reached ${mb} MB (soft threshold); recycled idle engine to release heap`,
    logMemoryImportRecycle: (mb) =>
      `Imports changed at ${mb} MB heap; recycled engine cleanly before reopening`,
    logMemoryBackgroundRelease: (mb) =>
      `Tab hidden at ${mb} MB peak heap; released Lean engine memory`,
    logMemoryHardLimit: (mb, limitMb) =>
      `Memory reached hard limit (${mb} / ${limitMb} MB); stopped engine to protect tab stability`,
    runtimeTitle: 'Runtime',
    advancedTitle: 'Advanced',
    runtimeWasm32: 'wasm32 (stable default)',
    runtimeWasm64: 'wasm64 (experimental)',
    runtimeExperimentalWarning:
      'Experimental notice: stable wasm32 (1 GiB limit) is the production default. wasm64 is experimental, may be unstable or unsupported across browsers, and must not be used for production — switch manually only to try it.',
    runtimeWasm64NoLibraries:
      'The wasm64 runtime ships Init only, so Std / Batteries are disabled. Switch back to wasm32 to use extension libraries.',
    logRuntimeAutoStable:
      'This lesson needs an extension library; switched back to the stable wasm32 runtime',
    libraryQuickFix: (library) => `Enable ${library} and switch to the stable runtime`,
    libraryQuickFixDone: (library) => `${library} enabled; restarting Lean…`,
    runtimeWasm64Unsupported:
      'Memory64 is not supported in this browser; staying on the stable wasm32 runtime',
    runtimeWasm64AssetNote:
      'Experimental note: wasm64 loads a separate 64-bit Lean 4.36.0-rc2 + Init runtime for manual trial only (not for production). Std / Batteries extension packs are available on wasm32 only.',
    runtimeWasm64NotPublished:
      'No published wasm64 runtime assets are configured yet; falling back to stable wasm32',
    logWasm64Loading: 'Loading experimental wasm64 runtime pack (64-bit Lean 4.36.0-rc2 + Init)…',
    logRuntimeArchSelected: (arch) => `Runtime preference switched to ${arch}`,
  },
  reference: {
    eyebrow: 'Lean 4 · Reference',
    title: 'Tactics and symbols at a glance',
    lead: 'The tactics, symbols and errors you reach for most, all on one page. Come back when you forget one instead of rereading a whole lesson.',
    tacticsTitle: 'Tactics',
    tacticsLead: 'Look things up by “what am I trying to do”, not by memorising names.',
    tactics: [
      {
        name: 'intro h',
        body: 'When the goal is P → Q or ∀ x, ..., bring the premise or variable into context.',
        example: '⊢ P → Q  →  intro h  →  h : P ⊢ Q',
      },
      {
        name: 'exact h',
        body: 'You already hold a proof whose type matches the goal exactly.',
        example: 'h : P  →  exact h closes ⊢ P',
      },
      {
        name: 'apply h',
        body: 'Replace the goal with the premises of lemma h; useful when applying a lemma rather than handing over a proof.',
        example: 'hf : Injective f, ⊢ a = b  →  apply hf  →  ⊢ f a = f b',
      },
      {
        name: 'rcases h with ⟨x, hx⟩',
        body: 'Unpack an existential, conjunction or disjunction; use it when h is a proof.',
        example: 'h : ∃ k, n = 2 * k  →  rcases h with ⟨k, hk⟩',
      },
      {
        name: 'induction n with',
        body: 'Structural induction on a natural or a list; follow the recursive definition when choosing the variable.',
        example: 'induction n with | zero => ... | succ k ih => ...',
      },
      {
        name: 'rw [h]',
        body: 'Rewrite the goal with an equation; use ← for the other direction.',
        example: 'h : a = b  →  rw [h] replaces a with b in the goal',
      },
      {
        name: 'simp [defs]',
        body: 'Simplify with definitions and simp lemmas; simp only narrows the set of lemmas.',
        example: 'simp [sum, ih]',
      },
      {
        name: 'grind',
        body: 'Finish linear arithmetic, equalities and propositional reasoning automatically.',
        example: 'after rw [hx, hy]  →  grind',
      },
      {
        name: 'by_cases h : P',
        body: 'Split the goal into the P and ¬P cases.',
        example: 'by_cases h : n = 0  →  prove both branches',
      },
      {
        name: 'constructor',
        body: 'Split a ∧, ↔ or structure goal and prove each subgoal.',
        example: '⊢ P ∧ Q  →  constructor',
      },
      {
        name: 'decide',
        body: 'Let the compiler exhaust concrete numeric goals such as bitmasks or small enumerations.',
        example: '⊢ (0xF0 : BitVec 8) &&& 0x0F = 0  →  decide',
      },
      {
        name: 'ext i',
        body: 'Prove two fixed-width bitvectors (or functions) equal by expanding bit by bit or point by point.',
        example: '⊢ x ||| 0#8 = x  →  ext i  →  simp',
      },
      {
        name: 'simp [HashMap.getD_insert]',
        body: 'Unfold data-structure read/write lemmas; engineering lessons pair it with h.symm to rule out the same-key case.',
        example: 'simp [transfer, balance, HashMap.getD_insert, h.symm]',
      },
    ],
    symbolsTitle: 'Symbols',
    symbolsLead:
      'Type the backslash abbreviation and press space or Tab; the editor also offers completions.',
    symbols: [
      { symbol: '→', abbreviation: '\\to', meaning: 'implication / function type' },
      { symbol: '←', abbreviation: '\\leftarrow', meaning: 'reverse / assignment (gets)' },
      { symbol: '↔', abbreviation: '\\iff', meaning: 'if and only if' },
      { symbol: '∀', abbreviation: '\\forall', meaning: 'universal quantifier' },
      { symbol: '∃', abbreviation: '\\exists', meaning: 'existential quantifier' },
      { symbol: '∧', abbreviation: '\\and', meaning: 'and' },
      { symbol: '∨', abbreviation: '\\or', meaning: 'or' },
      { symbol: '¬', abbreviation: '\\not', meaning: 'not' },
      { symbol: '∣', abbreviation: '\\mid', meaning: 'divides' },
      { symbol: '∈', abbreviation: '\\in', meaning: 'member of' },
      { symbol: '⊆', abbreviation: '\\subseteq', meaning: 'subset' },
      {
        symbol: '⟨ ⟩',
        abbreviation: '\\langle \\rangle',
        meaning: 'constructor / anonymous constructor',
      },
    ],
    errorsTitle: 'Common errors',
    errorsLead:
      'Check which line the error points at, then put the cursor inside the proof to read the goal.',
    errors: [
      {
        error: 'type mismatch',
        cause: 'A proof or value has a different type from the one expected.',
        fix: 'Read expected / got in the message, and use #check to confirm the type of a name.',
      },
      {
        error: 'unknown identifier',
        cause: 'The name is misspelled, in another namespace, or not imported.',
        fix: 'Search with #check; watch for prefixes such as Nat. and List.',
      },
      {
        error: 'unsolved goals',
        cause: 'Some goal is still open, often a missing branch or final step.',
        fix: 'Put the cursor inside the proof and read the goal; add exact, rfl or grind.',
      },
      {
        error: "declaration uses 'sorry'",
        cause: 'A sorry placeholder is still present, so the proof is not finished.',
        fix: 'Close each goal; course exercises require zero sorry.',
      },
      {
        error: 'function expected',
        cause: 'A non-function is being applied, usually from brackets or argument order.',
        fix: 'Use #check to inspect the type, then fix argument order and brackets.',
      },
    ],
    ctaTitle: 'Keep practising',
    ctaBody: 'A reference saves you once; muscle memory comes from writing.',
    ctaPlayground: 'Open the playground',
    ctaLesson: 'Back to lesson one',
  },
  privacy: {
    eyebrow: 'Transparency',
    title: 'Privacy notice',
    updated: 'Last updated: 2026-11-19',
    intro:
      'This is a front-end-only teaching project: Lean runs inside your browser and the code you write is never uploaded. To diagnose startup failures and performance, we collect a small amount of anonymous runtime telemetry.',
    sections: [
      {
        heading: 'What we collect',
        paragraphs: [
          'The page type (home / lesson / playground), interface language and a timestamp.',
          'Startup stages: whether the service worker registered, which asset source was used, bytes downloaded, download duration, the runtime architecture (wasm32 / wasm64), time until the language server is ready, and time to the first diagnostics.',
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
          'The Lean runtime and the diagnostic source preference live in CacheStorage / IndexedDB, so the ~102 MB download is not repeated.',
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
    note: 'A real Lean LSP in the browser · Init + Std + Batteries',
    repo: 'Source',
    privacy: 'Privacy',
  },
  notFound: {
    title: 'Page not found',
    body: 'That link may have expired. Head back to the home page.',
    cta: 'Back home',
  },
};
