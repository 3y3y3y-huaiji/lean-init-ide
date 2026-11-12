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
      'When off you start Lean yourself. The first download is about 102 MB and stays cached in this browser.',
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
        body: 'The 102 MB runtime arrives in parallel 4 MB ranges from a same-origin Cloudflare R2 gateway, is verified with SHA-256, falls back to the mirror or the same-origin static copy, then persists in the browser.',
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
    pathsTitle: 'Two learning paths',
    pathMeta: (count) => `${count} lessons`,
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
    },
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
            text: 'The editor runs entirely in your browser: the first visit downloads about 102 MB, later visits use a persistent cache, and your code is never uploaded.',
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
      {
        slug: 'math-divisibility',
        track: 'math',
        navTitle: 'M1 · Divisibility',
        title: 'Divisibility: turn a word into a definition',
        lead: '"6 is divisible by 2" is not mainly about division: it says there is a k with 6 = 2 × k. Lean writes that sentence as a definition.',
        blocks: [
          {
            kind: 'p',
            text: 'The symbol ∣ means "divides". 2 ∣ 6 says there is an integer k with 6 = 2 × k. It is a proposition, not a number: do not confuse it with 2 / 6.',
          },
          { kind: 'code', code: '#check (2 ∣ 6)\n\nexample : 2 ∣ 6 := ⟨3, rfl⟩' },
          {
            kind: 'p',
            text: '⟨3, rfl⟩ is the evidence: 3 is the witness, and rfl checks that 6 and 2 × 3 are equal by definition. Proving an existence statement means constructing a witness.',
          },
          {
            kind: 'p',
            text: 'Divisibility is transitive: if a divides b and b divides c, then a divides c. The proof multiplies the two witnesses.',
          },
          {
            kind: 'code',
            code: 'theorem dvd_trans (a b c : Nat) (hab : a ∣ b) (hbc : b ∣ c) : a ∣ c := by\n  rcases hab with ⟨x, rfl⟩\n  rcases hbc with ⟨y, rfl⟩\n  exact ⟨x * y, by rw [Nat.mul_assoc]⟩',
          },
          { kind: 'p', text: 'If a divides b and c, it also divides b + c.' },
          {
            kind: 'code',
            code: 'theorem dvd_add (a b c : Nat) (hb : a ∣ b) (hc : a ∣ c) : a ∣ b + c := by\n  rcases hb with ⟨x, rfl⟩\n  rcases hc with ⟨y, rfl⟩\n  exact ⟨x + y, by rw [Nat.mul_add]⟩',
          },
          {
            kind: 'note',
            text: 'The pattern: rcases turns “there exists k” into a concrete witness, rw rewrites the goal into a multiplication identity, and exact hands the new witness back.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Prove that every number divides 0, and that 1 divides every number.',
          cta: 'Try it in the editor',
          starter:
            'theorem dvd_zero (a : Nat) : a ∣ 0 := by\n  sorry\n\ntheorem one_dvd (a : Nat) : 1 ∣ a := by\n  sorry\n',
        },
      },
      {
        slug: 'math-parity',
        track: 'math',
        navTitle: 'M2 · Parity',
        title: 'Parity: your first proof that is not a calculation',
        lead: 'An even number is a multiple of 2; an odd number is one more than a multiple of 2. Write those sentences down and you can prove that even + even is even.',
        blocks: [
          {
            kind: 'p',
            text: 'A good definition is not complicated; it turns “I know what this means” into something a machine can check. Even and Odd each take one line.',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\nexample : Even 6 := ⟨3, rfl⟩\nexample : Odd 7 := ⟨3, rfl⟩',
          },
          {
            kind: 'p',
            text: 'Even a is an existence statement. rcases unwraps a concrete k; adding two even numbers adds the two witnesses.',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem even_add_even (a b : Nat) (ha : Even a) (hb : Even b) : Even (a + b) := by\n  rcases ha with ⟨x, rfl⟩\n  rcases hb with ⟨y, rfl⟩\n  exact ⟨x + y, by omega⟩',
          },
          {
            kind: 'p',
            text: 'Adding two odd numbers leaves an extra 1, which again makes a multiple of 2.',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem odd_add_odd (a b : Nat) (ha : Odd a) (hb : Odd b) : Even (a + b) := by\n  rcases ha with ⟨x, rfl⟩\n  rcases hb with ⟨y, rfl⟩\n  exact ⟨x + y + 1, by omega⟩',
          },
          {
            kind: 'p',
            text: 'A number cannot be both even and odd. Assume both, and omega sees that 2k = 2j + 1 is impossible.',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by\n  intro h\n  rcases h with ⟨⟨x, hx⟩, ⟨y, hy⟩⟩\n  omega',
          },
          {
            kind: 'note',
            text: 'omega is Lean’s built-in linear arithmetic solver. It handles addition, subtraction, multiplication by constants and inequalities; for products of variables you need your own lemmas.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Prove that an even number times any natural number is still even.',
          cta: 'Try it in the editor',
          starter:
            'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\ntheorem even_mul (a b : Nat) (h : Even a) : Even (a * b) := by\n  sorry\n',
        },
      },
      {
        slug: 'math-gcd',
        track: 'math',
        navTitle: 'M3 · GCD',
        title: 'Greatest common divisor: specify first, implement later',
        lead: 'What matters about a GCD is not how to compute it, but which properties it satisfies. Write those properties down and correctness becomes a question you can answer.',
        blocks: [
          {
            kind: 'p',
            text: 'd is a common divisor of a and b, and every common divisor divides d. Those three clauses are the specification.',
          },
          {
            kind: 'code',
            code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\n#check IsGcd',
          },
          {
            kind: 'p',
            text: 'Init already ships Nat.gcd (Euclid’s algorithm). We do not need to rewrite it; we only need to prove that it meets the specification.',
          },
          {
            kind: 'code',
            code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem gcd_is_gcd (a b : Nat) : IsGcd a b (Nat.gcd a b) := by\n  constructor\n  · exact Nat.gcd_dvd_left a b\n  constructor\n  · exact Nat.gcd_dvd_right a b\n  · intro e hea heb\n    exact Nat.dvd_gcd hea heb',
          },
          {
            kind: 'p',
            text: 'Another benefit: a value satisfying the specification is unique. If both d and e satisfy IsGcd, then d = e.',
          },
          {
            kind: 'code',
            code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem gcd_unique (a b d e : Nat) (hd : IsGcd a b d) (he : IsGcd a b e) : d = e := by\n  rcases hd with ⟨hda, hdb, hdg⟩\n  rcases he with ⟨hea, heb, heg⟩\n  exact Nat.dvd_antisymm (heg d hda hdb) (hdg e hea heb)',
          },
          {
            kind: 'note',
            text: 'This is separation of specification and implementation: swap in a faster GCD algorithm later, prove IsGcd again, and every theorem that depends on it still holds.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Prove that if 2 divides a and b, then 2 divides their greatest common divisor.',
          cta: 'Try it in the editor',
          starter:
            'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem two_dvd_gcd (a b : Nat) (ha : 2 ∣ a) (hb : 2 ∣ b) : 2 ∣ Nat.gcd a b := by\n  sorry\n',
        },
      },
      {
        slug: 'math-primes',
        track: 'math',
        navTitle: 'M4 · Primes',
        title: 'Primes: definitions, counterexamples, small proofs',
        lead: 'A prime is not a number that “looks special”. It is a number satisfying two properties: at least 2, and its only divisors are 1 and itself.',
        blocks: [
          {
            kind: 'p',
            text: 'Write “only divisors are 1 and itself” as a universal statement and you have the definition.',
          },
          {
            kind: 'code',
            code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\n#check Prime',
          },
          {
            kind: 'p',
            text: 'To refute primality, it is enough to exhibit an extra divisor. For example 4 has divisor 2, which is neither 1 nor 4.',
          },
          {
            kind: 'code',
            code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem not_prime_one : ¬ Prime 1 := by\n  intro h\n  rcases h with ⟨h2, _⟩\n  omega\n\ntheorem not_prime_four : ¬ Prime 4 := by\n  intro h\n  rcases h with ⟨_, hd⟩\n  have h2 : 2 ∣ 4 := ⟨2, rfl⟩\n  have h := hd 2 h2\n  omega',
          },
          {
            kind: 'p',
            text: 'Proving that 2 is prime means handling an arbitrary divisor d: it must satisfy d ≤ 2 and d > 0, so it can only be 1 or 2.',
          },
          {
            kind: 'code',
            code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem prime_two : Prime 2 := by\n  constructor\n  · omega\n  · intro d hd\n    have hle : d ≤ 2 := Nat.le_of_dvd (by omega) hd\n    have hpos : 0 < d := Nat.pos_of_dvd_of_pos hd (by omega)\n    omega',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'Euclid proved that there are infinitely many primes by constructing n! + 1. This runtime does not include a factorial library, so we only keep the idea: assume finitely many primes, multiply them and add one, and get a number divisible by none of the known primes.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Prove that 6 is not prime. Hint: find a divisor that is neither 1 nor 6.',
          cta: 'Try it in the editor',
          starter:
            'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem not_prime_six : ¬ Prime 6 := by\n  sorry\n',
        },
      },
      {
        slug: 'math-sets',
        track: 'math',
        navTitle: 'M5 · Sets',
        title: 'Sets: membership as a predicate',
        lead: 'A set is not a list. It is a rule: give me an element and I say whether it belongs. In Lean, a set is simply a function returning Prop.',
        blocks: [
          {
            kind: 'p',
            text: 'Define a set as A : α → Prop. Saying x belongs to A means the proposition A x is true.',
          },
          {
            kind: 'code',
            code: 'def Set (α : Type) := α → Prop\n\ndef evens : Set Nat := fun n => ∃ k, n = 2 * k\n\n#check evens\n#check evens 4',
          },
          {
            kind: 'p',
            text: 'A is a subset of B when every element of A is also in B. It is a universal statement: introduce an element and push the proof forward.',
          },
          {
            kind: 'code',
            code: 'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ntheorem subset_trans {α : Type} (A B C : Set α) (h1 : Subset A B) (h2 : Subset B C) : Subset A C := by\n  intro x hx\n  exact h2 x (h1 x hx)',
          },
          {
            kind: 'p',
            text: 'The union A ∪ B contains x when A x or B x holds, so A is always a subset of A ∪ B.',
          },
          {
            kind: 'code',
            code: 'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ndef SetUnion {α : Type} (A B : Set α) : Set α := fun x => A x ∨ B x\n\ntheorem subset_union {α : Type} (A B : Set α) : Subset A (SetUnion A B) := by\n  intro x hx\n  exact Or.inl hx',
          },
          {
            kind: 'note',
            text: 'The notation x ∈ A is another way to write A x. This lesson avoids extra type classes and reads A x as “A accepts x”.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Define intersection and prove that it is a subset of its left argument.',
          cta: 'Try it in the editor',
          starter:
            'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ndef SetInter {α : Type} (A B : Set α) : Set α := fun x => A x ∧ B x\n\ntheorem inter_subset_left {α : Type} (A B : Set α) : Subset (SetInter A B) A := by\n  sorry\n',
        },
      },
      {
        slug: 'math-functions',
        track: 'math',
        navTitle: 'M6 · Functions',
        title: 'Injective, surjective, bijective',
        lead: 'A function is a mapping. Injectivity prevents collisions, surjectivity reaches every target, and bijectivity is a perfect round trip.',
        blocks: [
          {
            kind: 'p',
            text: 'Injective: different inputs give different outputs. Surjective: every target has a preimage. Both together mean bijective.',
          },
          {
            kind: 'code',
            code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ndef Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ndef Bijective {α β : Type} (f : α → β) : Prop := Injective f ∧ Surjective f\n\n#check Injective',
          },
          {
            kind: 'p',
            text: 'A composition of injections is injective: from g (f a) = g (f b), injectivity of g gives f a = f b, and injectivity of f gives a = b.',
          },
          {
            kind: 'code',
            code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ntheorem injective_comp {α β γ : Type} (f : α → β) (g : β → γ)\n    (hf : Injective f) (hg : Injective g) : Injective (fun x => g (f x)) := by\n  intro a b h\n  apply hf\n  apply hg\n  exact h',
          },
          {
            kind: 'p',
            text: 'The identity function is both injective and surjective, hence bijective.',
          },
          {
            kind: 'code',
            code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ndef Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ndef Bijective {α β : Type} (f : α → β) : Prop := Injective f ∧ Surjective f\n\ntheorem surjective_id {α : Type} : Surjective (fun x : α => x) := by\n  intro b\n  exact ⟨b, rfl⟩\n\ntheorem bijective_id {α : Type} : Bijective (fun x : α => x) := by\n  constructor\n  · intro a b h\n    exact h\n  · exact surjective_id',
          },
          {
            kind: 'note',
            text: 'A bijection lets you translate back and forth without losing information; finite sets with a bijection between them have the same number of elements.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Prove that a composition of surjections is surjective.',
          cta: 'Try it in the editor',
          starter:
            'def Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ntheorem surjective_comp {α β γ : Type} (f : α → β) (g : β → γ)\n    (hf : Surjective f) (hg : Surjective g) : Surjective (fun x => g (f x)) := by\n  sorry\n',
        },
      },
      {
        slug: 'math-relations',
        track: 'math',
        navTitle: 'M7 · Relations',
        title: 'Equivalence relations and classification',
        lead: 'A relation is a proposition about two elements. An equivalence relation is reflexive, symmetric and transitive, and it sorts objects into classes.',
        blocks: [
          {
            kind: 'p',
            text: 'Pack the three properties into a structure and you have the definition of an equivalence relation.',
          },
          {
            kind: 'code',
            code: 'structure IsEquivalence {α : Type} (r : α → α → Prop) : Prop where\n  refl : ∀ x, r x x\n  symm : ∀ {x y}, r x y → r y x\n  trans : ∀ {x y z}, r x y → r y z → r x z\n\ndef SameLength {α : Type} (xs ys : List α) : Prop := xs.length = ys.length\n\n#check IsEquivalence',
          },
          {
            kind: 'p',
            text: '“Same length” is an equivalence relation: length equals itself, equality can be swapped, and equalities compose.',
          },
          {
            kind: 'code',
            code: 'def SameLength {α : Type} (xs ys : List α) : Prop := xs.length = ys.length\n\ntheorem same_length_refl {α : Type} (xs : List α) : SameLength xs xs := rfl\n\ntheorem same_length_symm {α : Type} (xs ys : List α) (h : SameLength xs ys) :\n    SameLength ys xs := by\n  exact h.symm\n\ntheorem same_length_trans {α : Type} (xs ys zs : List α)\n    (h1 : SameLength xs ys) (h2 : SameLength ys zs) : SameLength xs zs := by\n  exact h1.trans h2',
          },
          {
            kind: 'p',
            text: 'An equivalence relation puts objects into classes: objects in the same class are “the same in some sense”. Mathematical classification usually means choosing the right equivalence relation.',
          },
          {
            kind: 'note',
            text: 'Congruence modulo n, isomorphism and homotopy are all equivalence relations; they turn complicated objects into comparable classes.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Combine the three properties into one IsEquivalence proof.',
          cta: 'Try it in the editor',
          starter:
            'structure IsEquivalence {α : Type} (r : α → α → Prop) : Prop where\n  refl : ∀ x, r x x\n  symm : ∀ {x y}, r x y → r y x\n  trans : ∀ {x y z}, r x y → r y z → r x z\n\ndef SameLength {α : Type} (xs ys : List α) : Prop := xs.length = ys.length\n\ntheorem same_length_equiv {α : Type} : IsEquivalence (SameLength (α := α)) := by\n  sorry\n',
        },
      },
      {
        slug: 'math-strong-induction',
        track: 'math',
        navTitle: 'M8 · Strong induction',
        title: 'Strong induction and Fibonacci',
        lead: 'Some recursions need the previous two terms or all smaller ones. Ordinary induction is not enough; strong induction is.',
        blocks: [
          {
            kind: 'p',
            text: 'Fibonacci: F(0)=0, F(1)=1, and every later term is the sum of the previous two.',
          },
          {
            kind: 'code',
            code: 'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\n#eval fib 10',
          },
          {
            kind: 'p',
            text: 'Ordinary induction gives you the previous term; strong induction gives you every smaller term. Lean’s Nat.strongRecOn hands you “true for all m < n” directly.',
          },
          {
            kind: 'code',
            code: 'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\ntheorem fib_lt_two_pow (n : Nat) : fib n ≤ 2 ^ n := by\n  induction n using Nat.strongRecOn with\n  | ind n ih =>\n    match n with\n    | 0 => simp [fib]\n    | 1 => simp [fib]\n    | k + 2 =>\n      have h1 := ih k (by omega)\n      have h2 := ih (k + 1) (by omega)\n      simp [fib, Nat.pow_succ]\n      omega',
          },
          {
            kind: 'note',
            text: 'Strong induction is not a new axiom; it follows from ordinary induction. It is just more convenient.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Prove that Fibonacci is nondecreasing: F(n) ≤ F(n+1).',
          cta: 'Try it in the editor',
          starter:
            'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\ntheorem fib_mono (n : Nat) : fib n ≤ fib (n + 1) := by\n  sorry\n',
        },
      },
      {
        slug: 'code-sorting',
        track: 'math',
        navTitle: 'M9 · Insertion sort',
        title: 'Why insertion sort is correct',
        lead: 'The specification of sorting has two parts: the result is sorted, and no element is lost. Write those down and correctness becomes meaningful.',
        blocks: [
          {
            kind: 'p',
            text: 'First define “sorted”: empty and singleton lists are sorted; a longer list needs head ≤ second and a sorted tail.',
          },
          {
            kind: 'code',
            code: 'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ndef sort : List Nat → List Nat\n  | [] => []\n  | x :: xs => insertNat x (sort xs)\n\n#eval sort [3, 1, 2]',
          },
          {
            kind: 'p',
            text: 'Membership preservation: y is in insertNat x xs exactly when y = x or y was already in xs.',
          },
          {
            kind: 'code',
            code: 'def insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ntheorem mem_insertNat (x y : Nat) (xs : List Nat) :\n    y ∈ insertNat x xs ↔ y = x ∨ y ∈ xs := by\n  induction xs with\n  | nil =>\n    unfold insertNat\n    simp\n  | cons z zs ih =>\n    unfold insertNat\n    by_cases h : x ≤ z\n    · simp [h]\n    · simp [h, ih, or_left_comm]',
          },
          {
            kind: 'note',
            text: 'Proving sortedness is left as the exercise; proving membership first and sortedness second is the usual split.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Prove that inserting x into a sorted list keeps it sorted.',
          cta: 'Try it in the editor',
          starter:
            'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ntheorem sorted_insert (x : Nat) (xs : List Nat) (h : Sorted xs) :\n    Sorted (insertNat x xs) := by\n  sorry\n',
        },
      },
      {
        slug: 'code-sum',
        track: 'math',
        navTitle: 'M10 · List sum',
        title: 'Recursive functions and inductive proofs',
        lead: 'List sum is the smallest complete example: write a recursive function, then prove its properties by structural induction.',
        blocks: [
          {
            kind: 'p',
            text: 'The definition copies the mathematics: empty is 0, a nonempty list is its head plus the sum of its tail.',
          },
          {
            kind: 'code',
            code: 'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\n#eval sum [1, 2, 3]',
          },
          {
            kind: 'p',
            text: 'Summing an appended list equals the sum of the two sums. Prove it by structural induction on the first list.',
          },
          {
            kind: 'code',
            code: 'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\ntheorem sum_append (xs ys : List Nat) : sum (xs ++ ys) = sum xs + sum ys := by\n  induction xs with\n  | nil => simp [sum]\n  | cons x xs ih =>\n    simp [sum, ih]\n    omega',
          },
          {
            kind: 'note',
            text: 'With an accumulator argument, sum becomes tail recursive; the proof then needs an accumulator invariant, which is the next exercise.',
          },
        ],
        exercise: {
          title: 'Exercise',
          body: 'Use sum_append to prove that swapping the two lists does not change the total.',
          cta: 'Try it in the editor',
          starter:
            'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\ntheorem sum_append (xs ys : List Nat) : sum (xs ++ ys) = sum xs + sum ys := by\n  induction xs with\n  | nil => simp [sum]\n  | cons x xs ih =>\n    simp [sum, ih]\n    omega\n\ntheorem sum_swap (xs ys : List Nat) : sum (xs ++ ys) = sum ys + sum xs := by\n  sorry\n',
        },
      },
      {
        slug: 'math-axioms',
        track: 'math',
        navTitle: 'M11 · Axioms & sorry',
        title: 'Axioms, sorry and trustworthy code',
        lead: 'An axiom is accepted without proof; a theorem is derived from axioms. Lean can tell you exactly which axioms a theorem depends on.',
        blocks: [
          {
            kind: 'p',
            text: '#print axioms lists the axioms a theorem depends on. Core arithmetic theorems usually depend on none.',
          },
          { kind: 'code', code: '#print axioms Nat.add_comm\n\n#check Classical.choice' },
          {
            kind: 'p',
            text: 'sorry generates sorryAx and makes any proposition “true”. It is fine for drafts, not for delivery.',
          },
          {
            kind: 'code',
            code: 'theorem cheat : 1 = 2 := by\n  sorry\n\n#print axioms cheat',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'Seeing sorryAx means the proof is unfinished; course code and CI should never leave sorry behind.',
          },
        ],
      },
      {
        slug: 'math-mathlib',
        track: 'math',
        navTitle: 'M12 · Init to Mathlib',
        title: 'From Init to Mathlib',
        lead: 'Mathlib is Lean’s mathematics library: sets, functions, number theory, algebra and analysis. This runtime only ships Init, so the course built a mini library of its own.',
        blocks: [
          {
            kind: 'p',
            text: 'The Even, Prime, IsGcd, Set, Injective and Sorted definitions in this course all have industrial-strength counterparts in Mathlib.',
          },
          {
            kind: 'code',
            code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\n#check Even\n#check Nat.gcd\n#check List.length',
          },
          {
            kind: 'p',
            text: 'Mapping: Even/Odd, Nat.Prime, Nat.gcd, Set, Function.Injective and List.Perm are the Mathlib names for these concepts.',
          },
          {
            kind: 'code',
            code: '#check Nat.gcd_dvd_left\n#check Nat.dvd_gcd\n#check List.mem_append',
          },
          {
            kind: 'note',
            text: 'To continue locally: install elan, create a project with lake new, and require mathlib in the lakefile. The first build takes a while, but then the whole library is available.',
          },
        ],
      },
    ],
  },
  playground: {
    title: 'Lean playground',
    hint: 'The first run downloads about 102 MB of runtime; later visits use the persistent cache.',
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
    resetConfirmAction: 'Confirm reset?',
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
    statusLoading: 'Loading runtime… (about 102 MB on first run)',
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
