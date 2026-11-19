import type { LessonPage } from './types';

export const lessonsEn: LessonPage[] = [
  {
    slug: 'what-is-lean',
    track: 'intro',
    navTitle: '01 · A compiler that does math',
    title: 'A compiler that does math homework',
    lead: 'Forget proofs for a second: think of Lean as a math referee that never lets anything slide. It checks every step you submit.',
    blocks: [
      {
        kind: 'p',
        text: 'A teacher might say “this is obvious”. Lean does not accept “obvious”: it asks which definition or lemma you used. One wrong step and it stops you with a red line.',
      },
      {
        kind: 'p',
        text: 'Ignore the Goal panel for now and watch the output. Think of `⊢` as the referee’s scoreboard: above the line are the cards in your hand, below it is the conclusion you must hand over.',
      },
      { kind: 'code', code: '#eval 2 + 3' },
      {
        kind: 'p',
        text: '`#eval` makes Lean compute the expression right there. `2 + 3` is not a string here; Lean really computes 5.',
      },
      { kind: 'code', code: '#check Nat.add' },
      {
        kind: 'p',
        text: '`#check` only asks “what is the type of this name?” without running it. `Nat.add` takes two naturals and returns a natural.',
      },
      { kind: 'code', code: 'example : 2 + 2 = 4 := rfl' },
      {
        kind: 'p',
        text: '`example : 2 + 2 = 4 := rfl` is a minimal proof. `rfl` means both sides simplify to exactly the same thing, so the referee stamps it immediately.',
      },
      {
        kind: 'note',
        text: 'Why a machine referee: an AI can produce text that looks like a proof while one step quietly swaps concepts. Lean does not read tone; it checks whether each step actually holds. That is what makes it stronger than “looks right”.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ 2 + 2 = 4\nAfter rfl: no goals left\n\nBelow the line is the conclusion the referee wants. rfl computes both sides to 4, so the conclusion holds automatically.',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `#eval 2 + 3` to `#eval 2 +`. Watch where Lean draws the red line: it fails before it can even finish reading the expression.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why is there no by here?',
        text: '`rfl` is already a proof term, so it can sit directly after `:=`. You only need `:= by` when a proof takes several steps; the two forms are equivalent, but the tactic form is better for showing intermediate states.',
      },
      {
        kind: 'note',
        text: 'One takeaway: Lean is both a calculator and a type checker. `#eval` shows values, `#check` shows types, and `rfl` closes goals where both sides are equal by definition.',
      },
      {
        kind: 'note',
        text: 'This site ships Init by default, with optional Std and Batteries packs; there is no Lean / Lake / Mathlib. Every lesson stays inside that boundary.',
      },
      {
        kind: 'p',
        text: 'The editor runs entirely in your browser: the first visit downloads about 102 MB, later visits use a persistent cache, and your code is never uploaded.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Change the `#eval` expression to something you like, then replace the `sorry` in `six_seven` with `rfl` and watch the Goal panel go from `⊢ 6 * 7 = 42` to no goals.',
      hint: '`#eval` shows a value and `#check` shows a type; `six_seven` closes with `rfl`. Change 6 to 5 and Lean reports an error immediately; change it back and it passes.',
      cta: 'Try it in the editor',
      starter: '#eval 6 * 7\n#check Nat.mul\n\ntheorem six_seven : 6 * 7 = 42 := by\n  sorry\n',
    },
  },
  {
    slug: 'first-proof',
    track: 'intro',
    navTitle: '02 · Your first proof',
    title: 'Your first leak-proof proof',
    lead: 'Walk the full loop with `rfl`: read the type, compute the value, let the compiler stamp it.',
    blocks: [
      {
        kind: 'p',
        text: 'A unit test only proves the handful of cases you wrote down. `rfl` is a stronger `assert`: it does not run a sample, it makes the compiler confirm that both sides are identical by definition.',
      },
      {
        kind: 'p',
        text: 'Watch the right panel: above `⊢` are your assumptions (none yet), below it is the goal. After every step, check whether `⊢` got shorter.',
      },
      { kind: 'code', code: '#check Nat.add\n#eval 2 + 3' },
      {
        kind: 'p',
        text: 'Click Run: the output first shows the type of `Nat.add`, then the value of `#eval`. The point of this lesson is to tell the two apart.',
      },
      { kind: 'code', code: '#check (2 + 2 = 4)\nexample : 2 + 2 = 4 := rfl' },
      {
        kind: 'p',
        text: 'In Lean, “2 + 2 = 4” is a type, and a proof is an element of that type. When both sides compute to the same expression, `rfl` closes the goal immediately.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ 2 + 2 = 4\nAfter rfl: no goals left\n\nThe `#check` line only asks for a type; it does not create a proof goal.',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `rfl` to `rfl 1` and read the error saying this proof takes no arguments. Then change `2 + 2` to `2 + 3` and look at the new goal.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why can rfl not prove 0 + a = a?',
        text: '`Nat.add` recurses on its second argument: `a + 0` reduces to `a`, so `a + 0 = a` is definitional. But `0 + a` is stuck when `a` is a variable, so it needs induction on `a`. Lesson 05 makes this distinction explicit.',
      },
      {
        kind: 'note',
        text: 'One takeaway: `rfl` only handles equalities where both sides compute to the same thing; anything else needs a different tactic.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Change `#eval 2 + 3` to something you like, then replace the `sorry` in `two_add_two` with `rfl`.',
      hint: 'Use `#check` for the type and `#eval` for the value; `two_add_two` opens with `:= by`, and `rfl` closes it by computation.',
      cta: 'Try it in the editor',
      starter: '#check Nat.mul\n#eval 6 * 7\n\ntheorem two_add_two : 2 + 2 = 4 := by\n  sorry\n',
    },
  },
  {
    slug: 'implication',
    track: 'intro',
    navTitle: '03 · Write a proof function',
    title: 'Write an if…then… proof function',
    lead: 'Read “if P then Q” as a chain of reasoning: whenever the premise holds, the conclusion must follow.',
    blocks: [
      {
        kind: 'p',
        text: 'The everyday example is “if it rains, the ground gets wet”. Lean’s `P → Q` is exactly that sentence: give it a proof that P holds and it returns a proof that Q holds.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is `P → P`: the referee wants a chain of reasoning, “assume P, conclude P”. `intro h` takes the premise into your hand.',
      },
      { kind: 'code', code: 'theorem id_imp (P : Prop) : P → P := by\n  intro h\n  exact h' },
      {
        kind: 'p',
        text: '`intro h` turns the goal `P → P` into “assume `h : P`, prove `P`”; `exact h` plays the card in your hand and finishes.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ P → P\nAfter intro h: h : P ⊢ P\nAfter exact h: no goals left',
      },
      {
        kind: 'code',
        code: 'theorem trans_imp (P Q R : Prop) (h1 : P → Q) (h2 : Q → R) : P → R := by\n  intro hp\n  exact h2 (h1 hp)',
      },
      {
        kind: 'p',
        text: 'Implications compose: if rain→wet ground and wet ground→slippery, then rain→slippery. Two arrows in a row mean the conclusion of the first reasoning step feeds the second.',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `exact h2 (h1 hp)` to `exact h1 (h2 hp)` and read how Lean refuses because the types do not line up.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'What does intro actually do?',
        text: 'The goal `P → Q` is a function type. `intro h` means “assume I am given a proof of P; call it h”, and the goal becomes Q. It does not prove P; it moves the left side of the arrow into your assumptions.',
      },
      {
        kind: 'note',
        text: 'One takeaway: when the goal is an arrow, the first move is almost always `intro` to grab the left side.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `chain`: `(P → Q) → (Q → R) → P → R`, the arrow-only version of `trans_imp`.',
      hint: 'The goal is all arrows, so `intro` repeatedly to bring `(P → Q)`, `(Q → R)` and `P` into scope; then feed the output of the first premise into the second.',
      cta: 'Try it in the editor',
      starter: 'theorem chain (P Q R : Prop) : (P → Q) → (Q → R) → P → R := by\n  sorry\n',
    },
  },
  {
    slug: 'connectives',
    track: 'intro',
    navTitle: '04 · Pack and unpack',
    title: 'Pack and unpack: ∧ and ∨',
    lead: '`∧` means both conditions hold; `∨` means at least one does. Everyday “both…and…” and “either…or…” are exactly these.',
    blocks: [
      {
        kind: 'p',
        text: '“It is both raining and windy today” requires two things, which is `P ∧ Q`. “This weekend we hike or visit the museum” requires at least one, which is `P ∨ Q`.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the conclusion. For `∧`, the referee wants two pieces of evidence; for `∨`, handing over one side is enough.',
      },
      {
        kind: 'code',
        code: 'theorem and_self (P Q : Prop) (hp : P) (hq : Q) : P ∧ Q := ⟨hp, hq⟩',
      },
      {
        kind: 'p',
        text: 'To prove `P ∧ Q`, give a proof of P and a proof of Q. `⟨hp, hq⟩` is shorthand for `And.intro`: both pieces of evidence in one parcel.',
      },
      {
        kind: 'code',
        code: 'theorem and_comm (P Q : Prop) : P ∧ Q → Q ∧ P := by\n  intro h\n  exact ⟨h.2, h.1⟩',
      },
      {
        kind: 'p',
        text: 'Conversely, if you have `h : P ∧ Q`, then `h.1` gives P and `h.2` gives Q, like taking the two items out of a parcel.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ P ∧ Q → Q ∧ P\nAfter intro h: h : P ∧ Q ⊢ Q ∧ P\nTake h.2 and h.1: proofs of Q and P\nPack with ⟨h.2, h.1⟩: no goals left',
      },
      {
        kind: 'code',
        code: 'theorem or_comm (P Q : Prop) : P ∨ Q → Q ∨ P := by\n  intro h\n  cases h with\n  | inl hp => exact Or.inr hp\n  | inr hq => exact Or.inl hq',
      },
      {
        kind: 'p',
        text: 'Disjunction is a bit more work: to prove `P ∨ Q`, give one side with `Or.inl` or `Or.inr`. To use `P ∨ Q`, you must `cases` it and handle both branches.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ P ∨ Q → Q ∨ P\nAfter intro h: h : P ∨ Q ⊢ Q ∨ P\nBranch inl hp: hp : P ⊢ Q ∨ P, use Or.inr hp\nBranch inr hq: hq : Q ⊢ Q ∨ P, use Or.inl hq',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `Or.inr hp` to `Or.inl hp` in `or_comm` and read the type error: `hp` is evidence for P, not Q.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why can we not just exact h?',
        text: '`h` has type `P ∨ Q`, while the goal is `Q ∨ P`. They are different types, so Lean rejects it. You must `cases` h into two possibilities and build the matching side in each branch.',
      },
      {
        kind: 'note',
        text: 'One takeaway: `∧` packs with `⟨⟩` and unpacks with `.1` / `.2`; `∨` is built with `inl` / `inr` and used with `cases`.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `or_comm_ex`: `(P ∨ Q) → (Q ∨ P)`, filling in both branches.',
      hint: 'Start with `intro h`, then `cases h with` to split into `inl` and `inr`; in each branch, use `Or.inl` or `Or.inr` to move the evidence to the other side.',
      cta: 'Try it in the editor',
      starter: 'theorem or_comm_ex (P Q : Prop) : P ∨ Q → Q ∨ P := by\n  sorry\n',
    },
  },
  {
    slug: 'induction',
    track: 'intro',
    navTitle: '05 · Dominoes',
    title: 'Dominoes: why “the previous one falls, the next one falls too” topples the row',
    lead: '`n = 0` knocks over the first domino; `n + 1` says “if the previous one fell, the next one must fall too”.',
    blocks: [
      {
        kind: 'p',
        text: 'Imagine a row of dominoes. You only need two facts: the first one will fall; and whenever any one falls, the next one falls too. Then the whole row goes down. Mathematical induction is exactly those two facts.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is `a + b = b + a`. The referee wants it for every natural number, so expanding one step is not enough: you have to knock over the whole row.',
      },
      {
        kind: 'code',
        code: 'example (a : Nat) : a + 0 = a := rfl\n\nexample (a : Nat) : 0 + a = a := by\n  induction a with\n  | zero => rfl\n  | succ a ih => simp',
      },
      {
        kind: 'p',
        text: 'Two small examples first: `a + 0 = a` closes by `rfl` because addition recurses on its second argument; `0 + a = a` gets stuck and needs induction on `a`. `zero` knocks over the first domino; `succ a ih` says “assume the previous one fell (`ih`), prove the next one falls too”.',
      },
      {
        kind: 'goal',
        text: 'a + 0 = a: ⊢ a + 0 = a, closed by rfl\n\n0 + a = a:\nzero branch: ⊢ 0 + 0 = 0, rfl\nsucc branch: ih : 0 + a = a\ngoal: ⊢ 0 + succ a = succ a',
      },
      {
        kind: 'p',
        text: 'Now induct on `a` to prove commutativity. `induction a with` splits the goal into `a = 0` and `a = succ a` with an induction hypothesis `ih`.',
      },
      {
        kind: 'code',
        code: 'theorem add_comm (a b : Nat) : a + b = b + a := by\n  induction a with\n  | zero => simp\n  | succ a ih => simp only [Nat.succ_add, Nat.add_succ, ih]',
      },
      {
        kind: 'note',
        text: 'In the `zero` branch `simp` reduces `0 + b` to `b`; in the `succ` branch `Nat.succ_add` rewrites `succ a + b` to `succ (a + b)`, and then the induction hypothesis `ih` takes over.',
      },
      {
        kind: 'goal',
        text: 'Before induction a: ⊢ a + b = b + a\nzero branch: ⊢ 0 + b = b + 0, closed by simp\nsucc branch: ih : a + b = b + a\ngoal: ⊢ succ a + b = b + succ a',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `| zero => simp` to `| zero => rfl` and see whether it still passes; then delete `ih` and watch which key fact `simp` is missing.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why can rfl not prove 0 + a = a?',
        text: '`Nat.add` recurses on its second argument. `a + 0` reduces to `a`, so `a + 0 = a` is definitional; but in `0 + a` the second argument is the variable `a`, so recursion is stuck and you must induct on `a`.',
      },
      {
        kind: 'p',
        text: 'To inspect the proof state step by step, click “Try it in the editor” and put the cursor inside the `by` block: the first line of the Goal panel is always the theorem’s goal, and the lines below it are the local assumptions of the current branch.',
      },
      {
        kind: 'note',
        text: 'One takeaway: induction is recursion for proofs—handle `zero`, then assume `ih` and handle `succ`.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove both `add_zero` and `zero_add`: one follows directly from the definition, the other needs induction on `a`.',
      hint: 'Keep the two branches of `induction a with`; the `zero` branch is usually one `simp` or `rfl`, and the `succ` branch must use `ih`.',
      cta: 'Try it in the editor',
      starter:
        'theorem add_zero (a : Nat) : a + 0 = a := by\n  sorry\n\ntheorem zero_add (a : Nat) : 0 + a = a := by\n  sorry\n',
    },
  },
  {
    slug: 'rewrite',
    track: 'intro',
    navTitle: '06 · Substitution',
    title: 'Substitution: how `rw` shortens the goal',
    lead: '`rw` is the substitution you learned in algebra: take a known equality and replace part of the goal with it.',
    blocks: [
      {
        kind: 'p',
        text: 'When solving `x + 2 = 5` you substitute `x = 3` and get `3 + 2 = 5`. `rw` does exactly that: it takes a known equality and replaces the matching expression in the goal.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the conclusion. `rw` edits that region; after each rewrite, check whether `⊢` is closer to “both sides look the same”.',
      },
      {
        kind: 'code',
        code: 'theorem add_comm_rw (a b : Nat) : a + b = b + a := by\n  rw [Nat.add_comm]',
      },
      {
        kind: 'p',
        text: '`rw [Nat.add_comm]` replaces `a + b` with `b + a`, so both sides become identical and Lean closes the goal with `rfl` automatically.',
      },
      { kind: 'code', code: 'theorem eq_swap (a b : Nat) (h : a = b) : b = a := by\n  rw [h]' },
      {
        kind: 'p',
        text: 'By default `rw` uses an equality left-to-right; `rw [← h]` uses it right-to-left. The direction depends on how you wrote the equality.',
      },
      {
        kind: 'goal',
        text: 'Start: h : a = b ⊢ b = a\nAfter rw [h]: replace a with b in the goal, giving ⊢ b = b\nrw notices both sides are equal and closes the goal with rfl',
      },
      {
        kind: 'code',
        code: 'theorem add_assoc_rw (a b c : Nat) : a + b + c = a + (b + c) := by\n  rw [Nat.add_assoc]',
      },
      {
        kind: 'p',
        text: 'Associativity also works with `rw`: `Nat.add_assoc` rewrites `(a + b) + c` into `a + (b + c)`, and the goal becomes an identity.',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `rw [Nat.add_comm]` to `rw [← Nat.add_comm]` and look at what the goal becomes—and why it no longer closes automatically.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'When do I need rw [← h]?',
        text: 'Look at the direction of your equality and of the goal. If the equality is `a = b`, the goal contains `b`, and you want `a`, use `← h`. When unsure, run `rw [h]` first and inspect the result.',
      },
      {
        kind: 'note',
        text: 'One takeaway: `rw` is substitution with evidence; if the direction is wrong, add `←`.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Use `rw` to prove `eq_swap`: `b = a` from `h : a = b`, then try rewriting the associativity equality backwards once.',
      hint: '`rw [h]` replaces `a` with `b` in the goal; if nothing moves, check that the left side of the equality matches the expression in the goal exactly.',
      cta: 'Try it in the editor',
      starter: 'theorem eq_swap (a b : Nat) (h : a = b) : b = a := by\n  sorry\n',
    },
  },
  {
    slug: 'simp',
    track: 'intro',
    navTitle: '07 · Let simp clean up',
    title: 'Let `simp` clean up',
    lead: '`simp` is like Prettier + `eslint --fix`: it repeatedly applies a rule set until nothing is left to simplify.',
    blocks: [
      {
        kind: 'p',
        text: 'You run a formatter after writing code and let it apply a fixed rule set. `simp` does the same for proofs: it applies lemmas tagged `@[simp]` over and over until the goal is as simple as it gets.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the goal; when `simp` works, you see it shrink and eventually disappear.',
      },
      { kind: 'code', code: 'theorem add_zero_simp (a : Nat) : a + 0 = a := by\n  simp' },
      {
        kind: 'p',
        text: 'A goal like `a + 0 = a` closes with one `simp`. You do not have to name the rule.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ a + 0 = a\nAfter simp: both sides reduce to the same expression, no goals left',
      },
      {
        kind: 'p',
        text: '`simp only` uses exactly the lemmas you list and nothing else, which makes behavior predictable. Prefer it in production proofs.',
      },
      {
        kind: 'code',
        code: 'theorem succ_add_simp (a b : Nat) : Nat.succ a + b = Nat.succ (a + b) := by\n  simp only [Nat.succ_add]',
      },
      {
        kind: 'p',
        text: '`simp only [Nat.succ_add]` does one job: rewrite `Nat.succ a + b` into `Nat.succ (a + b)`.',
      },
      {
        kind: 'details',
        summary: 'rw or simp: which one?',
        text: 'When the goal is one or two explicit equalities, `rw` is more controllable. When the goal is a pile of small simplifications and you only care about the normal form, `simp` is less work. `simp only` is the middle ground: automation, but you choose the rules.',
      },
      {
        kind: 'code',
        code: 'theorem add_succ_simp (a b : Nat) : a + Nat.succ b = Nat.succ (a + b) := by\n  simp only [Nat.add_succ]',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `simp only [Nat.add_succ]` to plain `simp` and see if it still passes; then misspell the lemma name and read the “unknown lemma” error.',
        tone: 'warn',
      },
      {
        kind: 'note',
        text: 'One takeaway: `simp` is a finisher; when it refuses to move, the goal needs `intro`, `cases` or `induction`.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `add_zero_twice` with both `simp` and `simp only`, and compare how controllable the two versions feel.',
      hint: '`simp` picks rules automatically; `simp only [Nat.add_zero]` allows just that one. A misspelled lemma name produces an “unknown identifier” error.',
      cta: 'Try it in the editor',
      starter: 'theorem add_zero_twice (a : Nat) : a + 0 + 0 = a := by\n  sorry\n',
    },
  },
  {
    slug: 'quantifiers',
    track: 'intro',
    navTitle: '08 · ∀ and ∃',
    title: '∀ passes an argument, ∃ hands in a sample',
    lead: 'Treat `∀` as an ordinary function parameter; `∃` requires a concrete value plus a proof.',
    blocks: [
      {
        kind: 'p',
        text: '`∀ n, P n` is an ordinary function: the caller gives you `n`, and you return a proof of `P n`. `∃ n, P n` is like submitting a test sample: you must hand over a concrete `n` and a proof that it satisfies `P`.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the conclusion. When you see `∀`, `intro` the parameter; when you see `∃`, decide which concrete value to submit.',
      },
      {
        kind: 'code',
        code: 'theorem forall_apply (P : Nat → Prop) (h : ∀ n, P n) : P 0 := h 0',
      },
      {
        kind: 'p',
        text: '`forall_apply` simply calls `h 0`: since `h` holds for every `n`, passing `0` gives a proof of `P 0`.',
      },
      { kind: 'code', code: 'theorem exists_intro : ∃ n : Nat, n + n = 4 := ⟨2, rfl⟩' },
      {
        kind: 'p',
        text: 'The proof of `∃ n, n + n = 4` is `⟨2, rfl⟩`: `2` is the witness, and `rfl` proves that it really satisfies the property.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ ∃ n, n + n = 4\nProvide witness 2: ⊢ 2 + 2 = 4\nrfl closes it: no goals left',
      },
      {
        kind: 'code',
        code: 'theorem exists_swap (P Q : Nat → Prop) (h : ∃ n, P n ∧ Q n) : ∃ n, Q n ∧ P n := by\n  cases h with\n  | intro n hn => exact ⟨n, hn.2, hn.1⟩',
      },
      {
        kind: 'p',
        text: 'To use an existential, you must unpack it: `cases h with | intro n hn => ...`, where `n` is the witness and `hn` is the proof that it satisfies the property.',
      },
      {
        kind: 'goal',
        text: 'Start: h : ∃ n, P n ∧ Q n ⊢ ∃ n, Q n ∧ P n\nAfter cases h: n : Nat, hn : P n ∧ Q n ⊢ ∃ n, Q n ∧ P n\nUse the same n as witness and swap hn.1 / hn.2',
      },
      {
        kind: 'note',
        text: 'Run it once, then change the `2` in `⟨2, rfl⟩` to `3` and see why `rfl` cannot close `3 + 3 = 4`. A witness is not arbitrary.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'A mnemonic for ∀ and ∃',
        text: '`∀` goes in: use `intro` to bring the parameter into scope. `∃` goes out: use `⟨witness, proof⟩` to hand it over. When using an existential, do the reverse and `cases` it apart.',
      },
      {
        kind: 'note',
        text: 'One takeaway: `∀` is a function parameter, `∃` is a concrete sample; one uses `intro`, the other uses `⟨⟩`.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `exists_six`: `∃ n : Nat, n + n = 6`, then prove `forall_three`: `(∀ n, P n) → P 3`.',
      hint: 'For the existential, pick the witness first (3 works) and then prove the equality. For the universal, `intro` the parameter or call the hypothesis as in `forall_apply`.',
      cta: 'Try it in the editor',
      starter:
        'theorem exists_six : ∃ n : Nat, n + n = 6 := by\n  sorry\n\ntheorem forall_three (P : Nat → Prop) (h : ∀ n, P n) : P 3 := by\n  sorry\n',
    },
  },
  {
    slug: 'list-structure',
    track: 'intro',
    navTitle: '09 · Build a data structure',
    title: 'Build your own data structure',
    lead: '`List Nat` is a linked list: either empty or a head plus a tail, and induction only needs those two cases.',
    blocks: [
      {
        kind: 'p',
        text: 'A mathematical sequence can be defined like this: either the empty sequence, or one element followed by a shorter sequence. Lean’s `List Nat` has exactly those two constructors: `[]` and `x :: xs`. So induction on a list always has two branches.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the conclusion. In the `nil` branch the list is empty; in the `cons` branch you get the head, the tail, and an induction hypothesis for the tail.',
      },
      {
        kind: 'code',
        code: 'theorem length_map_zero (xs : List Nat) : (xs.map (fun x => x + 0)).length = xs.length := by\n  induction xs with\n  | nil => rfl\n  | cons x xs ih =>\n    simp only [List.map_cons, List.length_cons]\n    rw [ih]',
      },
      {
        kind: 'p',
        text: '`induction xs with` splits the goal into `nil` and `cons`. In the `cons` branch, `ih` says the statement holds for the tail; use it to finish the whole list.',
      },
      {
        kind: 'goal',
        text: 'Before induction xs: ⊢ (xs.map (fun x => x + 0)).length = xs.length\nnil branch: ⊢ ([].map ...).length = [].length, rfl\ncons branch: ih is the hypothesis for xs, then simp finishes',
      },
      {
        kind: 'p',
        text: 'Plain `simp` would use `List.length_map` and close the goal without touching the induction hypothesis; here `simp only` unfolds the constructors and `rw [ih]` uses the hypothesis explicitly.',
      },
      {
        kind: 'code',
        code: 'structure Point where\n  x : Nat\n  y : Nat\n\ndef Point.sum (p : Point) : Nat := p.x + p.y\n\n#eval (Point.mk 3 4).sum',
      },
      {
        kind: 'p',
        text: 'A `structure` packs several fields into a new type; the anonymous constructor fills them in declaration order, and dot notation accesses them. It can also describe mathematical objects such as points and vectors.',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `Point.mk 3 4` to `Point.mk 3` and read the error saying a field is missing.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why not just simp?',
        text: 'Plain `simp` passes too, but it never uses the induction hypothesis `ih`, so you do not see how structural induction works. `simp only` + `rw [ih]` lays every step out in the open.',
      },
      {
        kind: 'note',
        text: 'One takeaway: list induction has only `nil` and `cons`; a `structure` is just a name for a group of values.',
      },
      {
        kind: 'note',
        text: 'Next comes the math track. You will reuse three moves constantly: write a definition, construct a witness, and induct on a data structure. Only the objects change.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `scale_one`: `p.scale 1 = p`, then add a `z` field to `Point` and see how many arguments the constructor needs.',
      hint: '`p.scale 1` unfolds to `⟨p.x * 1, p.y * 1⟩`; simplify each field. After adding `z`, the `⟨...⟩` constructor needs one more component.',
      cta: 'Try it in the editor',
      starter:
        'structure Point where\n  x : Nat\n  y : Nat\n\ndef Point.scale (p : Point) (k : Nat) : Point :=\n  ⟨p.x * k, p.y * k⟩\n\ntheorem scale_one (p : Point) : p.scale 1 = p := by\n  sorry\n',
    },
  },
  {
    slug: 'math-proof-style',
    track: 'math',
    navTitle: '10 · Translate a math draft',
    title: 'Translating a paper draft into Lean',
    lead: 'Map “assume, choose, split into cases, induct” from a math class onto Lean tactics.',
    blocks: [
      {
        kind: 'p',
        text: 'In a math class you write “without loss of generality, let a = 2x”, and the reader fills in that x exists. Lean wants you to unpack “there exists some x” into a concrete x first. It is the same math, just more precise.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the current conclusion. After translating each sentence, check whether the assumptions above `⊢` grew.',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\nexample (a b : Nat) (ha : Even a) (hb : Even b) :\n    ∃ x y, a = 2 * x ∧ b = 2 * y := by\n  rcases ha with ⟨x, hx⟩\n  rcases hb with ⟨y, hy⟩\n  exact ⟨x, y, hx, hy⟩',
      },
      {
        kind: 'p',
        text: 'Mapping one: “let a = 2x and b = 2y”—use `rcases` to unpack both existentials, so `x`, `y` and their equalities move above `⊢`.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ ∃ x y, a = 2 * x ∧ b = 2 * y\nrcases ha: x : Nat, hx : a = 2 * x (the math-class “let a = 2x”)\nrcases hb: y : Nat, hy : b = 2 * y\nFinish with ⟨x, y, hx, hy⟩',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\ntheorem even_add_even (a b : Nat) (ha : Even a) (hb : Even b) :\n    Even (a + b) := by\n  rcases ha with ⟨x, hx⟩\n  rcases hb with ⟨y, hy⟩\n  refine ⟨x + y, ?_⟩\n  rw [hx, hy]\n  grind',
      },
      {
        kind: 'p',
        text: 'Mapping two: “take k = x + y”—saying the witness is enough in class; in Lean you hand it over with `refine` or `exact`, then rewrite the remaining equality.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ Even (a + b), which unfolds to ⊢ ∃ k, a + b = 2 * k\nrcases: get x, y and hx : a = 2 * x, hy : b = 2 * y\nrefine ⟨x + y, ?_⟩: hand over the new witness\nFinish the equality with rw and ring',
      },
      {
        kind: 'code',
        code: 'example (n : Nat) : n = 0 ∨ n ≠ 0 := by\n  by_cases h : n = 0\n  · exact Or.inl h\n  · exact Or.inr h',
      },
      {
        kind: 'p',
        text: 'Mapping three: “split into cases”—in class you write “if n = 0 then …, otherwise …”; in Lean you write `by_cases h : n = 0` and prove both branches.',
      },
      {
        kind: 'p',
        text: 'Mapping four: “mathematical induction”—prove `n = 0`, assume `n = k`, then prove `n = k + 1`. In Lean this is `induction n with | zero => ... | succ k ih => ...`.',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `by_cases h : n = 0` to `by_cases h : n = 1` and see how the two branch goals change, and why the old proof no longer applies.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Which everyday words trip Lean up?',
        text: '“Obviously”, “without loss of generality” and “similarly” are the usual suspects. Lean does not accept “obviously”; it wants the specific lemma or hypothesis. Treat those words as prompts: unpack with `rcases`, simplify with `simp`, or repeat the proof.',
      },
      {
        kind: 'note',
        text: 'One takeaway: translate sentence by sentence—`rcases` for “let”, `⟨witness, proof⟩` for “take”, `by_cases` for cases, `induction` for induction.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Write “even + even is even” in plain English first, then translate it sentence by sentence into Lean tactics; prove `even_eight` first, then `even_sum`.',
      hint: '`rcases` both definitions, provide the new witness `x + y`, then finish with `rw` / `ring`.',
      cta: 'Try it in the editor',
      starter:
        'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\ntheorem even_eight : Even 8 := by\n  sorry\n\ntheorem even_sum (a b : Nat) (ha : Even a) (hb : Even b) : Even (a + b) := by\n  sorry\n',
    },
  },
  {
    slug: 'math-divisibility',
    track: 'math',
    navTitle: '11 · Divisibility is multiplication',
    title: 'Divisibility is multiplication in disguise',
    lead: '`2 ∣ 6` says “there is a k with 6 = 2 × k”; it is not the same thing as `2 / 6`.',
    blocks: [
      {
        kind: 'p',
        text: 'To test divisibility in code you might write `n % d == 0`. Lean’s `∣` takes a different angle: instead of dividing, it asks you to produce the multiplier `k`. That way proofs never have to deal with fractions.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is `2 ∣ 6`. First read it as `∃ k, 6 = 2 * k`, then decide which `k` to submit.',
      },
      { kind: 'code', code: '#check (2 ∣ 6)\n\nexample : 2 ∣ 6 := ⟨3, rfl⟩' },
      {
        kind: 'p',
        text: '`⟨3, rfl⟩` is the evidence: `3` is the `k`, and `rfl` says `6` and `2 × 3` are equal by definition. Proving an existential is all about constructing the witness.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ 2 ∣ 6\nRead ∣ as an existential: ⊢ ∃ k, 6 = 2 * k\nProvide witness 3: ⊢ 6 = 2 * 3\nrfl closes it: no goals left',
      },
      {
        kind: 'p',
        text: 'Divisibility is transitive: if `a` divides `b` and `b` divides `c`, then `a` divides `c`. The proof multiplies the two witnesses.',
      },
      {
        kind: 'code',
        code: 'theorem dvd_trans (a b c : Nat) (hab : a ∣ b) (hbc : b ∣ c) : a ∣ c := by\n  rcases hab with ⟨x, rfl⟩\n  rcases hbc with ⟨y, rfl⟩\n  exact ⟨x * y, by rw [Nat.mul_assoc]⟩',
      },
      {
        kind: 'p',
        text: 'If both numbers are divisible by `a`, their sum is too—add the two witnesses.',
      },
      {
        kind: 'code',
        code: 'theorem dvd_add (a b c : Nat) (hb : a ∣ b) (hc : a ∣ c) : a ∣ b + c := by\n  rcases hb with ⟨x, rfl⟩\n  rcases hc with ⟨y, rfl⟩\n  exact ⟨x + y, by rw [Nat.mul_add]⟩',
      },
      {
        kind: 'note',
        text: 'Run it once, then change the `3` in `⟨3, rfl⟩` to `4` and see why `rfl` cannot close `6 = 2 * 4`.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'From List to math: how do I unpack ∣?',
        text: '`rcases h with ⟨k, rfl⟩` replaces `b` in the goal with `a * k`, which is why `rfl` or `ring` often finishes immediately. `rfl` works because both sides become literally the same expression.',
      },
      {
        kind: 'note',
        text: 'One takeaway: `a ∣ b` means `∃ k, b = a * k`; to prove it, hand over the witness.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `dvd_mul_right`: if `a ∣ b`, then `a ∣ b * c`.',
      hint: '`rcases h with ⟨k, rfl⟩`, hand over the new witness `k * c`, and finish with `ring` or `rfl`.',
      cta: 'Try it in the editor',
      starter: 'theorem dvd_mul_right (a b c : Nat) (h : a ∣ b) : a ∣ b * c := by\n  sorry\n',
    },
  },
  {
    slug: 'math-parity',
    track: 'math',
    navTitle: '12 · Your first parity proof',
    title: 'Your first complete parity proof',
    lead: 'Even means a multiple of 2; odd means a multiple of 2 plus 1. Write those down and “even + even is even” becomes provable.',
    blocks: [
      {
        kind: 'p',
        text: 'In code you check parity with `n % 2 === 0`. Lean defines “even” as an existential: there is a `k` with `n = 2 * k`. That way every proof has a concrete `k` in hand instead of a modulo result.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the conclusion. When you see `Even (a + b)`, unfold it to `∃ k, a + b = 2 * k` and decide on the witness.',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\nexample : Even 6 := ⟨3, rfl⟩\nexample : Odd 7 := ⟨3, rfl⟩',
      },
      {
        kind: 'p',
        text: 'A definition should turn “I know what it is” into “the machine can check what it is”. Even and odd each take one line.',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem even_add_even (a b : Nat) (ha : Even a) (hb : Even b) : Even (a + b) := by\n  rcases ha with ⟨x, rfl⟩\n  rcases hb with ⟨y, rfl⟩\n  exact ⟨x + y, by grind⟩',
      },
      {
        kind: 'p',
        text: '`Even a` is an existential. `rcases` unpacks it into a concrete `k`; to add two evens, add the two `k`s and that is the new witness.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ Even (a + b), i.e. ⊢ ∃ k, a + b = 2 * k\nrcases ha with ⟨x, rfl⟩: replace a by 2 * x\nrcases hb with ⟨y, rfl⟩: replace b by 2 * y\nHand over witness x + y, then finish with ring',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem odd_add_odd (a b : Nat) (ha : Odd a) (hb : Odd b) : Even (a + b) := by\n  rcases ha with ⟨x, rfl⟩\n  rcases hb with ⟨y, rfl⟩\n  exact ⟨x + y + 1, by grind⟩',
      },
      {
        kind: 'p',
        text: 'Odd + odd produces an extra 1, which pairs up into another multiple of 2.',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem not_even_and_odd (n : Nat) : ¬ (Even n ∧ Odd n) := by\n  intro h\n  rcases h with ⟨⟨x, hx⟩, ⟨y, hy⟩⟩\n  grind',
      },
      {
        kind: 'p',
        text: 'A number cannot be both even and odd. Assume both; `grind` sees that `2k = 2j + 1` is impossible.',
      },
      {
        kind: 'note',
        text: 'Run it once, then change the witness in `even_add_even` from `x + y` to `x + y + 1` and see why `ring` stops closing the goal.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why can rcases be followed directly by rfl?',
        text: '`rcases h with ⟨k, rfl⟩` substitutes `k` into the goal. If both sides become the same expression, `rfl` closes it. It is not guessing; it is definitional equality.',
      },
      {
        kind: 'note',
        text: 'One takeaway: write “even” as `∃ k, n = 2 * k`, and the proof becomes a search for a witness.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `even_plus_odd`: “even + odd is odd”.',
      hint: '`rcases` both definitions; the witness should be the two `k`s added together.',
      cta: 'Try it in the editor',
      starter:
        'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\ndef Odd (n : Nat) : Prop := ∃ k, n = 2 * k + 1\n\ntheorem even_plus_odd (a b : Nat) (ha : Even a) (hb : Odd b) : Odd (a + b) := by\n  sorry\n',
    },
  },
  {
    slug: 'math-gcd',
    track: 'math',
    navTitle: '13 · Specify the GCD',
    title: 'Specifying the greatest common divisor',
    lead: 'The important part of a GCD is not how to compute it, but which properties it must satisfy.',
    blocks: [
      {
        kind: 'p',
        text: 'When you build a backend API you write an OpenAPI spec before the implementation. `IsGcd` is the spec for a greatest common divisor: write down the properties first, then talk about algorithms.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the spec. `IsGcd a b d` unfolds into three facts: `d ∣ a`, `d ∣ b`, and every common divisor divides `d`.',
      },
      {
        kind: 'code',
        code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\n#check IsGcd',
      },
      {
        kind: 'p',
        text: '`d` divides both `a` and `b`, and every common divisor divides `d`. Those three sentences are the spec.',
      },
      {
        kind: 'code',
        code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem gcd_is_gcd (a b : Nat) : IsGcd a b (Nat.gcd a b) := by\n  constructor\n  · exact Nat.gcd_dvd_left a b\n  constructor\n  · exact Nat.gcd_dvd_right a b\n  · intro e hea heb\n    exact Nat.dvd_gcd hea heb',
      },
      {
        kind: 'p',
        text: 'Init already ships `Nat.gcd` (Euclid’s algorithm underneath). We do not rewrite the algorithm; we prove that it satisfies the spec.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ IsGcd a b (Nat.gcd a b), i.e. (Nat.gcd a b ∣ a) ∧ (Nat.gcd a b ∣ b) ∧ maximality\nconstructor: split into the divisibility goals\nUse Nat.gcd_dvd_left / Nat.gcd_dvd_right / Nat.dvd_gcd for the three parts',
      },
      {
        kind: 'code',
        code: 'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem gcd_unique (a b d e : Nat) (hd : IsGcd a b d) (he : IsGcd a b e) : d = e := by\n  rcases hd with ⟨hda, hdb, hdg⟩\n  rcases he with ⟨hea, heb, heg⟩\n  exact Nat.dvd_antisymm (heg d hda hdb) (hdg e hea heb)',
      },
      {
        kind: 'p',
        text: 'A spec also buys uniqueness: if `d` and `e` both satisfy `IsGcd`, then `d = e`.',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `Nat.gcd_dvd_left` in `gcd_is_gcd` to `Nat.gcd_dvd_right` and see why the first goal no longer matches.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why not write my own gcd?',
        text: 'You can, but then you also have to prove that your implementation satisfies the spec. Proving the existing `Nat.gcd` correct separates implementation from correctness: a faster implementation can replace it later as long as the spec proof still holds.',
      },
      {
        kind: 'note',
        text: 'One takeaway: write the spec (`IsGcd`) first, then prove the implementation meets it; that is much stronger than “it computes a result”.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `gcd_swap`: `IsGcd a b d → IsGcd b a d`, i.e. the spec still holds after swapping the two numbers.',
      hint: '`rcases hd` into three parts and rebuild with `constructor`; when you swap the arguments of `∣`, the lemma applications must swap too.',
      cta: 'Try it in the editor',
      starter:
        'def IsGcd (a b d : Nat) : Prop :=\n  d ∣ a ∧ d ∣ b ∧ ∀ e, e ∣ a → e ∣ b → e ∣ d\n\ntheorem gcd_swap (a b d : Nat) (hd : IsGcd a b d) : IsGcd b a d := by\n  sorry\n',
    },
  },
  {
    slug: 'math-primes',
    track: 'math',
    navTitle: '14 · Contradiction and primes',
    title: 'Proof by contradiction, with primes',
    lead: 'A prime is not “a number that looks special”; it satisfies two properties: at least 2, and its only divisors are 1 and itself.',
    blocks: [
      {
        kind: 'p',
        text: 'When validating input in code you check `n >= 2` and then look for other factors. Lean’s `Prime` writes that check as a universal statement: every divisor must be 1 or n itself.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is `Prime n`. Unfold it into two parts: `2 ≤ n`, and “for every d, d ∣ n → d = 1 ∨ d = n”.',
      },
      {
        kind: 'code',
        code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\n#check Prime',
      },
      {
        kind: 'p',
        text: 'Writing “the only divisors are 1 and itself” as a universal statement gives the definition of a prime.',
      },
      {
        kind: 'code',
        code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem not_prime_one : ¬ Prime 1 := by\n  intro h\n  rcases h with ⟨h2, _⟩\n  grind\n\ntheorem not_prime_four : ¬ Prime 4 := by\n  intro h\n  rcases h with ⟨_, hd⟩\n  have h2 : 2 ∣ 4 := ⟨2, rfl⟩\n  have h := hd 2 h2\n  grind',
      },
      {
        kind: 'p',
        text: 'To refute primality, find one extra divisor. For example, 4 has divisor 2, which is neither 1 nor 4.',
      },
      {
        kind: 'code',
        code: 'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem prime_two : Prime 2 := by\n  constructor\n  · grind\n  · intro d hd\n    have hle : d ≤ 2 := Nat.le_of_dvd (by grind) hd\n    have hpos : 0 < d := Nat.pos_of_dvd_of_pos hd (by grind)\n    grind',
      },
      {
        kind: 'p',
        text: 'To prove that 2 is prime you must handle an arbitrary divisor `d`: it satisfies `d ≤ 2` and is positive, so it can only be 1 or 2.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ Prime 2, i.e. 2 ≤ 2 ∧ ∀ d, d ∣ 2 → d = 1 ∨ d = 2\nconstructor: split into two goals\nThe first goal 2 ≤ 2 is closed by grind\nThe second: intro d hd, bound d, conclude d = 1 or d = 2',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `2 ∣ 4` in `not_prime_four` to `3 ∣ 4` and see whether `grind` still finds a contradiction. Contradiction is only as good as its evidence.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Where do d ≤ 2 and 0 < d come from?',
        text: '`Nat.le_of_dvd` uses “d divides 2 and 2 is positive” to get `d ≤ 2`; `Nat.pos_of_dvd_of_pos` gives `d > 0`. Together they squeeze `d` between 1 and 2, so it must be one of them.',
      },
      {
        kind: 'note',
        text: 'One takeaway: proof by contradiction assumes the conclusion is false, then uses definitions and known facts to force a contradiction.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `not_prime_six`: 6 is not prime.',
      hint: 'Follow `not_prime_four`: assume `Prime 6`, find divisor 2 or 3, then use `grind` to show it is neither 1 nor 6.',
      cta: 'Try it in the editor',
      starter:
        'def Prime (n : Nat) : Prop := 2 ≤ n ∧ ∀ d, d ∣ n → d = 1 ∨ d = n\n\ntheorem not_prime_six : ¬ Prime 6 := by\n  sorry\n',
    },
  },
  {
    slug: 'math-sets',
    track: 'math',
    navTitle: '15 · Sets are predicates',
    title: 'A set is just a function returning Prop',
    lead: 'A set is not a container of elements; it is a rule that answers “is x in?”.',
    blocks: [
      {
        kind: 'p',
        text: 'In code you write `isEven(n): boolean`. In Lean a set is a function returning `Prop`: `x` belongs to `A` exactly when the proposition `A x` holds. It does not store elements; it decides membership on demand.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the conclusion. Read `x ∈ A` as `A x`; read `Subset A B` as “for every x, A x → B x”.',
      },
      {
        kind: 'code',
        code: 'def Set (α : Type) := α → Prop\n\ndef evens : Set Nat := fun n => ∃ k, n = 2 * k\n\n#check evens\n#check evens 4',
      },
      {
        kind: 'p',
        text: 'In Lean you can define a set directly as `A : α → Prop`. `x` belongs to `A` when the proposition `A x` is true.',
      },
      {
        kind: 'code',
        code: 'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ntheorem subset_trans {α : Type} (A B C : Set α) (h1 : Subset A B) (h2 : Subset B C) : Subset A C := by\n  intro x hx\n  exact h2 x (h1 x hx)',
      },
      {
        kind: 'p',
        text: 'Subset means every element of `A` is in `B`. It is a universal statement, so the proof starts by `intro`ducing an element.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ Subset A C\nUnfold: ⊢ ∀ x, A x → C x\nintro x hx: x : α, hx : A x ⊢ C x\nFeed hx to h1 to get B x, then to h2 to get C x',
      },
      {
        kind: 'code',
        code: 'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ndef SetUnion {α : Type} (A B : Set α) : Set α := fun x => A x ∨ B x\n\ntheorem subset_union {α : Type} (A B : Set α) : Subset A (SetUnion A B) := by\n  intro x hx\n  exact Or.inl hx',
      },
      {
        kind: 'p',
        text: 'Union: an element of `A ∪ B` satisfies `A x` or `B x`, so `A` is always a subset of `A ∪ B`.',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `exact h2 (h1 hx)` in `subset_trans` to `exact h1 (h2 hx)` and see why the types no longer match.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why do set proofs always start with intro?',
        text: '`Subset`, `∈` and union all unfold into universal statements: “for every x, if … then …”. The first move for a universal is `intro` the element, then `intro` the premise.',
      },
      {
        kind: 'note',
        text: 'One takeaway: a set is a function `α → Prop`; a subset proof intros an element and pushes it through.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `subset_self` (`A ⊆ A`) and `subset_union_left` (`A ⊆ A ∪ B`).',
      hint: 'Unfold `Subset` and `intro x hx`, then `exact hx`, or use `Or.inl hx` to enter the left side of the union.',
      cta: 'Try it in the editor',
      starter:
        'def Set (α : Type) := α → Prop\n\ndef Subset {α : Type} (A B : Set α) : Prop := ∀ x, A x → B x\n\ndef SetUnion {α : Type} (A B : Set α) : Set α := fun x => A x ∨ B x\n\ntheorem subset_self {α : Type} (A : Set α) : Subset A A := by\n  sorry\n\ntheorem subset_union_left {α : Type} (A B : Set α) : Subset A (SetUnion A B) := by\n  sorry\n',
    },
  },
  {
    slug: 'math-functions',
    track: 'math',
    navTitle: '16 · Injective, surjective, bijective',
    title: 'Injective, surjective, bijective: no collisions, no misses, perfect pairing',
    lead: 'Injective means different inputs never collide; surjective means every target is hit; both together make a bijection.',
    blocks: [
      {
        kind: 'p',
        text: 'Picture a classroom where every person needs a chair and no chair can hold two people. Injectivity prevents collisions (two people squeezed into one chair); surjectivity prevents misses (every chair occupied); both together make a perfect one-to-one pairing.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is a function property. Injective unfolds to “for all a, b, f a = f b → a = b”; surjective unfolds to “for every b, there exists a with f a = b”.',
      },
      {
        kind: 'code',
        code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ndef Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ndef Bijective {α β : Type} (f : α → β) : Prop := Injective f ∧ Surjective f\n\n#check Injective',
      },
      {
        kind: 'p',
        text: 'Injective: different inputs give different outputs. Surjective: every target has a preimage. Having both is a bijection.',
      },
      {
        kind: 'code',
        code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ntheorem injective_comp {α β γ : Type} (f : α → β) (g : β → γ)\n    (hf : Injective f) (hg : Injective g) : Injective (fun x => g (f x)) := by\n  intro a b h\n  apply hf\n  apply hg\n  exact h',
      },
      {
        kind: 'p',
        text: 'A composition of two injective functions is injective: from `g (f a) = g (f b)`, injectivity of `g` gives `f a = f b`, then injectivity of `f` gives `a = b`.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ Injective (fun x => g (f x)), i.e. ∀ a b, g (f a) = g (f b) → a = b\nintro a b h: h : g (f a) = g (f b)\nUse hg to get f a = f b, then hf to get a = b',
      },
      {
        kind: 'code',
        code: 'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ndef Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ndef Bijective {α β : Type} (f : α → β) : Prop := Injective f ∧ Surjective f\n\ntheorem surjective_id {α : Type} : Surjective (fun x : α => x) := by\n  intro b\n  exact ⟨b, rfl⟩\n\ntheorem bijective_id {α : Type} : Bijective (fun x : α => x) := by\n  constructor\n  · intro a b h\n    exact h\n  · exact surjective_id',
      },
      {
        kind: 'p',
        text: 'The identity function is both injective and surjective, hence bijective.',
      },
      {
        kind: 'note',
        text: 'Run it once, then swap `hg` and `hf` in `injective_comp` and see where Lean refuses: the inner function must be unpacked first.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'apply or exact: which one?',
        text: '`exact` means “I have a complete proof, take it”. `apply` means “my goal looks like the conclusion of this lemma; turn the lemma’s premises into new goals”. For composed injectivity, `apply hg` turns `g ... = g ...` into `f ... = f ...`.',
      },
      {
        kind: 'note',
        text: 'One takeaway: injective prevents collisions, surjective prevents misses, bijective is a perfect pairing.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `bijective_id`: the identity function `fun x => x` is bijective.',
      hint: 'Both directions follow directly from the definitions: `intro a b h` then `exact h` for injectivity; for surjectivity, use the target value itself as the witness.',
      cta: 'Try it in the editor',
      starter:
        'def Injective {α β : Type} (f : α → β) : Prop := ∀ a b, f a = f b → a = b\n\ndef Surjective {α β : Type} (f : α → β) : Prop := ∀ b, ∃ a, f a = b\n\ndef Bijective {α β : Type} (f : α → β) : Prop := Injective f ∧ Surjective f\n\ntheorem bijective_id {α : Type} : Bijective (fun x : α => x) := by\n  sorry\n',
    },
  },
  {
    slug: 'math-relations',
    track: 'math',
    navTitle: '17 · Equivalence relations',
    title: 'Equivalence relations: three rules for sorting data into piles',
    lead: 'Reflexive, symmetric, transitive: three properties that justify grouping objects together.',
    blocks: [
      {
        kind: 'p',
        text: 'Grouping strings by length works because length is reflexive, symmetric and transitive. Those are exactly the three rules of an equivalence relation, and they make the grouping safe.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is something like `SameLength xs xs`. Unfold the definition to `xs.length = ys.length`, then check what each of the three properties needs.',
      },
      {
        kind: 'code',
        code: 'structure IsEquivalence {α : Type} (r : α → α → Prop) : Prop where\n  refl : ∀ x, r x x\n  symm : ∀ {x y}, r x y → r y x\n  trans : ∀ {x y z}, r x y → r y z → r x z\n\ndef SameLength {α : Type} (xs ys : List α) : Prop := xs.length = ys.length\n\n#check IsEquivalence',
      },
      {
        kind: 'p',
        text: 'Writing the three properties as a structure gives the definition of an equivalence relation.',
      },
      {
        kind: 'code',
        code: 'def SameLength {α : Type} (xs ys : List α) : Prop := xs.length = ys.length\n\ntheorem same_length_refl {α : Type} (xs : List α) : SameLength xs xs := rfl\n\ntheorem same_length_symm {α : Type} (xs ys : List α) (h : SameLength xs ys) :\n    SameLength ys xs := by\n  exact h.symm\n\ntheorem same_length_trans {α : Type} (xs ys zs : List α)\n    (h1 : SameLength xs ys) (h2 : SameLength ys zs) : SameLength xs zs := by\n  exact h1.trans h2',
      },
      {
        kind: 'p',
        text: '“Same length” is an equivalence relation: a length equals itself, equality can be flipped, and equalities compose.',
      },
      {
        kind: 'goal',
        text: 'same_length_refl: ⊢ SameLength xs xs, i.e. xs.length = xs.length, closed by rfl\nsame_length_symm: h : xs.length = ys.length ⊢ ys.length = xs.length, use h.symm\nsame_length_trans: h1 and h2 compose with h1.trans h2',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `h.symm` in `same_length_symm` to `h` and see how Lean complains when the goal direction and the hypothesis direction disagree.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why can a structure proof use where?',
        text: '`IsEquivalence` is a structure whose fields are propositions. Writing `where` followed by proofs for the three fields is just proving reflexivity, symmetry and transitivity separately.',
      },
      {
        kind: 'note',
        text: 'One takeaway: an equivalence relation is reflexive + symmetric + transitive; it gives you a legal way to sort data into piles.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `mod_two_equiv`: “congruent modulo 2” is reflexive, symmetric and transitive.',
      hint: 'Define `ModTwo x y` as `x % 2 = y % 2`; use `rfl`, `h.symm` and `h1.trans h2` for the three properties.',
      cta: 'Try it in the editor',
      starter:
        'structure IsEquivalence {α : Type} (r : α → α → Prop) : Prop where\n  refl : ∀ x, r x x\n  symm : ∀ {x y}, r x y → r y x\n  trans : ∀ {x y z}, r x y → r y z → r x z\n\ndef ModTwo (x y : Nat) : Prop := x % 2 = y % 2\n\ntheorem mod_two_equiv : IsEquivalence ModTwo := by\n  sorry\n',
    },
  },
  {
    slug: 'math-strong-induction',
    track: 'math',
    navTitle: '18 · Strong induction',
    title: 'Strong induction: borrow every earlier step',
    lead: 'Some recurrences need the previous two terms, or all smaller terms; ordinary induction is not enough.',
    blocks: [
      {
        kind: 'p',
        text: 'The next Fibonacci number depends on the previous two, but ordinary induction only gives you one. Strong induction hands you “all smaller cases hold” as a package, so you can borrow whichever step you need.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the bound for the current term. The strong hypothesis usually looks like `ih : ∀ m, m < n → ...`; when you use it, supply a concrete `m` and a proof of `m < n`.',
      },
      {
        kind: 'code',
        code: 'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\n#eval fib 10',
      },
      {
        kind: 'p',
        text: 'Fibonacci: `F(0)=0`, `F(1)=1`, and every later term is the sum of the previous two.',
      },
      {
        kind: 'code',
        code: 'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\ntheorem fib_lt_two_pow (n : Nat) : fib n ≤ 2 ^ n := by\n  induction n using Nat.strongRecOn with\n  | ind n ih =>\n    match n with\n    | 0 => simp [fib]\n    | 1 => simp [fib]\n    | k + 2 =>\n      have h1 := ih k (by grind)\n      have h2 := ih (k + 1) (by grind)\n      simp [fib, Nat.pow_succ]\n      grind',
      },
      {
        kind: 'p',
        text: 'Ordinary induction gives only the previous term; strong induction gives every smaller term. Lean’s `Nat.strongRecOn` hands you “for all `m < n`” directly.',
      },
      {
        kind: 'goal',
        text: 'Strong hypothesis: ih : ∀ m, m < n → fib m ≤ 2 ^ m\nk + 2 branch: ⊢ fib (k + 2) ≤ 2 ^ (k + 2)\nUnfold fib: ⊢ fib k + fib (k + 1) ≤ 2 ^ (k + 2)\nBound each term with ih k and ih (k + 1), then finish with powers',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `ih (k + 1)` to `ih k` and see whether `omega` or `simp` can still prove the bound; missing one earlier step usually gets you stuck.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why two induction hypotheses here?',
        text: '`fib (k + 2)` unfolds to depend on both `fib k` and `fib (k + 1)`. Strong induction holds for both, so you borrow each once; ordinary induction only gives you `fib (k + 1)`, which is not enough.',
      },
      {
        kind: 'note',
        text: 'One takeaway: strong induction = ordinary induction plus a bigger package saying “every smaller m holds”.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Use strong induction to prove `fib_lt_two_pow`: `fib n ≤ 2 ^ n`, and notice where each of the two hypotheses is used.',
      hint: 'Unfold `fib (k + 2)`, then apply the strong hypothesis to `k` and to `k + 1`; finish with `Nat.pow_succ` or `omega`.',
      cta: 'Try it in the editor',
      starter:
        'def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n + 2 => fib n + fib (n + 1)\n\ntheorem fib_lt_two_pow (n : Nat) : fib n ≤ 2 ^ n := by\n  sorry\n',
    },
  },
  {
    slug: 'code-sorting',
    track: 'math',
    navTitle: '19 · Prove insertion sort correct',
    title: 'Prove insertion sort never sorts wrong',
    lead: 'The spec has two parts: the result is sorted, and no element was lost.',
    blocks: [
      {
        kind: 'p',
        text: 'A unit test for sorting covers a few arrays. Here we write “the result is sorted” and “no element is lost” as two theorems, and the compiler checks them for every input.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the property being proved. For `Sorted (insertNat x xs)`, figure out what the `nil` and `cons` branches each need.',
      },
      {
        kind: 'code',
        code: 'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ndef sort : List Nat → List Nat\n  | [] => []\n  | x :: xs => insertNat x (sort xs)\n\n#eval sort [3, 1, 2]',
      },
      {
        kind: 'p',
        text: 'First define “sorted”: empty and single-element lists are sorted; a longer list needs head ≤ second and a sorted tail. `sort` repeatedly inserts elements into an already sorted tail.',
      },
      {
        kind: 'code',
        code: 'def insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ntheorem mem_insertNat (x y : Nat) (xs : List Nat) :\n    y ∈ insertNat x xs ↔ y = x ∨ y ∈ xs := by\n  induction xs with\n  | nil =>\n    unfold insertNat\n    simp\n  | cons z zs ih =>\n    unfold insertNat\n    by_cases h : x ≤ z\n    · simp [h]\n    · simp [h, ih, or_left_comm]',
      },
      {
        kind: 'p',
        text: 'Membership preservation: `y` is in `insertNat x xs` exactly when `y = x` or `y` was already in `xs`. This guarantees insertion creates no elements and loses none.',
      },
      {
        kind: 'note',
        text: 'The sortedness proof is left as an exercise; proving membership first and sortedness second is the usual split for this kind of theorem.',
      },
      {
        kind: 'goal',
        text: 'sorted_insert must prove: Sorted xs → Sorted (insertNat x xs)\nnil branch: ⊢ Sorted [x], closed by simp [insertNat, Sorted]\ncons branch: split on x ≤ y and maintain sortedness in each case',
      },
      {
        kind: 'code',
        code: 'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ndef sort : List Nat → List Nat\n  | [] => []\n  | x :: xs => insertNat x (sort xs)\n\ntheorem sorted_insert (x : Nat) (xs : List Nat) (h : Sorted xs) :\n    Sorted (insertNat x xs) := by\n  induction xs with\n  | nil => simp [insertNat, Sorted]\n  | cons y ys ih =>\n    by_cases hxy : x ≤ y\n    · sorry\n    · sorry\n\ntheorem sort_sorted (xs : List Nat) : Sorted (sort xs) := by\n  induction xs with\n  | nil => simp [sort, Sorted]\n  | cons x xs ih =>\n    simp [sort]\n    exact sorted_insert x (sort xs) ih',
      },
      {
        kind: 'note',
        text: 'Run it once, then delete one `sorry` in `sorted_insert` without filling it in and read the error; then replace it with `exact h` and see why the type is wrong.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why split the sorting proof in two?',
        text: '“No element lost” and “result sorted” are independent properties. Proving them separately keeps each induction focused; combining them makes the hypothesis carry two jobs and quickly becomes unreadable.',
      },
      {
        kind: 'note',
        text: 'One takeaway: algorithm correctness = a spec (sorted + no lost elements) + induction on the recursive structure.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Fill in the two `sorry`s in `sorted_insert` so `sort_sorted` no longer depends on unfinished proofs.',
      hint: 'In the `cons` branch, `by_cases hxy : x ≤ y`: if it holds, put `x` first and unpack sortedness from `h`; otherwise recurse into the tail and use the induction hypothesis.',
      cta: 'Try it in the editor',
      starter:
        'def Sorted : List Nat → Prop\n  | [] => True\n  | [_] => True\n  | x :: y :: rest => x ≤ y ∧ Sorted (y :: rest)\n\ndef insertNat (x : Nat) : List Nat → List Nat\n  | [] => [x]\n  | y :: ys => if x ≤ y then x :: y :: ys else y :: insertNat x ys\n\ndef sort : List Nat → List Nat\n  | [] => []\n  | x :: xs => insertNat x (sort xs)\n\ntheorem sorted_insert (x : Nat) (xs : List Nat) (h : Sorted xs) :\n    Sorted (insertNat x xs) := by\n  induction xs with\n  | nil => simp [insertNat, Sorted]\n  | cons y ys ih =>\n    by_cases hxy : x ≤ y\n    · sorry\n    · sorry\n\ntheorem sort_sorted (xs : List Nat) : Sorted (sort xs) := by\n  induction xs with\n  | nil => simp [sort, Sorted]\n  | cons x xs ih =>\n    simp [sort]\n    exact sorted_insert x (sort xs) ih\n',
    },
  },
  {
    slug: 'code-sum',
    track: 'math',
    navTitle: '20 · Concatenation and sums',
    title: 'Why concatenating two lists preserves sums',
    lead: 'List sum is the smallest complete example: write a recursive function, then prove its property by structural induction.',
    blocks: [
      {
        kind: 'p',
        text: 'When you write `sum(xs.concat(ys))`, your intuition says it should equal `sum(xs) + sum(ys)`. Lean asks you to turn that intuition into a theorem for all lists.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the equality. Induct on `xs`: the empty list is the base case, and the cons case uses the induction hypothesis on the tail.',
      },
      {
        kind: 'code',
        code: 'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\n#eval sum [1, 2, 3]',
      },
      {
        kind: 'p',
        text: 'The definition copies the math: the empty list sums to 0, a non-empty list sums its head plus the sum of its tail.',
      },
      {
        kind: 'code',
        code: 'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\ntheorem sum_append (xs ys : List Nat) : sum (xs ++ ys) = sum xs + sum ys := by\n  induction xs with\n  | nil => simp [sum]\n  | cons x xs ih =>\n    simp [sum, ih]\n    grind',
      },
      {
        kind: 'p',
        text: 'Summing a concatenation equals summing the pieces and adding. Prove it by structural induction on the first list.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ sum (xs ++ ys) = sum xs + sum ys\ninduction xs with: xs is the argument that sum and ++ recurse on\nnil: simp [sum], both sides reduce to sum ys\ncons: use ih to replace sum (xs ++ ys), then finish with associativity',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `induction xs` to `induction ys` and see whether the induction hypothesis is still enough. Induct on the argument that the function recurses on.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why induct on xs rather than ys?',
        text: 'Both `sum` and `++` recurse on their first argument. Inducting on `xs` lets the cons branch unfold both `sum (x :: xs ++ ys)` and `sum (x :: xs)`; inducting on `ys` leaves `xs` unknown and stuck.',
      },
      {
        kind: 'note',
        text: 'One takeaway: induct on whichever argument the recursive function recurses on.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Using the already proved `sum_append`, prove `sum_swap`: `sum (xs ++ ys) = sum ys + sum xs`.',
      hint: 'First `rw [sum_append]`, then swap the two terms on the right with `Nat.add_comm`. `sum_append` is already proved above, so do not reprove it.',
      cta: 'Try it in the editor',
      starter:
        'def sum : List Nat → Nat\n  | [] => 0\n  | x :: xs => x + sum xs\n\ntheorem sum_append (xs ys : List Nat) : sum (xs ++ ys) = sum xs + sum ys := by\n  induction xs with\n  | nil => simp [sum]\n  | cons x xs ih =>\n    simp [sum, ih]\n    grind\n\ntheorem sum_swap (xs ys : List Nat) : sum (xs ++ ys) = sum ys + sum xs := by\n  sorry\n',
    },
  },
  {
    slug: 'math-axioms',
    track: 'math',
    navTitle: '21 · sorry and axioms',
    title: 'The cheat detector: `sorry` and `#print axioms`',
    lead: '`sorry` is a TODO placeholder; `#print axioms` finds out whether a proof leaned on an axiom or left a back door.',
    blocks: [
      {
        kind: 'p',
        text: 'Writing `// TODO` is normal, but nobody treats a TODO as done. Lean’s `sorry` is a TODO in a proof: it makes any proposition “true” but leaves a `sorryAx` trace.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is what you must prove. `sorry` makes the goal disappear instantly, but the output tells you the proof depends on `sorryAx`.',
      },
      {
        kind: 'code',
        code: '#print axioms Nat.add_comm\n\n#check Classical.choice\n#check Classical.em',
      },
      {
        kind: 'p',
        text: '`#print axioms` lists the axioms a theorem depends on. Core arithmetic theorems usually depend on none.',
      },
      { kind: 'code', code: 'theorem cheat : 1 = 2 := by\n  sorry\n\n#print axioms cheat' },
      {
        kind: 'p',
        text: '`sorry` generates `sorryAx`, which makes any proposition “hold”. It is fine for drafts, not for delivery.',
      },
      {
        kind: 'goal',
        text: "Start: ⊢ 1 = 2\nAfter sorry: no goals left (but emits a warning and depends on sorryAx)\nAfter #print axioms cheat: prints 'cheat' depends on axioms: [sorryAx]",
      },
      {
        kind: 'note',
        text: 'Run it once, then replace `sorry` in `cheat` with `rfl` and see why `1 = 2` cannot be proved. That error is exactly what `sorry` was hiding.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why do core arithmetic theorems need no axioms?',
        text: 'Theorems like `Nat.add_comm` follow directly from inductive definitions and recursive functions; they need no extra assumptions. `Classical.choice` and `Classical.em` are the axioms you must explicitly accept, and they show up in `#print axioms`.',
      },
      {
        kind: 'note',
        text: 'One takeaway: search for `sorry` before shipping, then run `#print axioms`; a `sorryAx` means a hole is still open.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Use `#print axioms` on `my_em`: keep `sorry` first to see `sorryAx`, then replace it with a real proof.',
      hint: '`my_em` is the law of excluded middle; replace `sorry` with `Classical.em P`, then run `#print axioms my_em` to see the axiom list.',
      cta: 'Try it in the editor',
      starter: 'theorem my_em (P : Prop) : P ∨ ¬ P := by\n  sorry\n\n#print axioms my_em\n',
    },
  },
  {
    slug: 'math-mathlib',
    track: 'math',
    navTitle: '22 · From Init to Mathlib',
    title: 'From the browser sandbox to Mathlib',
    lead: 'Where this site’s standard library ends, and how to move to a full local toolchain smoothly.',
    blocks: [
      {
        kind: 'p',
        text: 'This site is a preloaded browser IDE: open it and write, but it ships Init, plus optional Std and Batteries. When you need sets, number theory, algebra or analysis, move the code into a local Mathlib project.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is what this site can prove. The course’s `Even`, `Prime`, `IsGcd` are miniature versions; Mathlib has production-grade counterparts.',
      },
      {
        kind: 'code',
        code: 'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\n#check Even\n#check Nat.gcd\n#check List.length',
      },
      {
        kind: 'p',
        text: 'The course’s `Even`, `Prime`, `IsGcd`, `Set`, `Injective`, `Sorted` all have industrial-grade versions in Mathlib.',
      },
      {
        kind: 'code',
        code: '#check Nat.gcd_dvd_left\n#check Nat.dvd_gcd\n#check List.mem_append',
      },
      {
        kind: 'p',
        text: 'Cheat sheet: `Even` / `Odd`, `Nat.Prime`, `Nat.gcd`, `Set`, `Function.Injective`, `List.Perm` are the Mathlib names for these concepts.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ ∃ k, 4 = 2 * k\nProvide witness 2: ⊢ 4 = 2 * 2\nrfl closes it: no goals left (#check only queries types and creates no goals)',
      },
      {
        kind: 'note',
        text: 'Run it once here with `#check Nat.Prime` and see whether it exists; then run the same line in a local Mathlib project to feel where the boundary really is.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'How is the course mini-library different from Mathlib?',
        text: 'The mini-library keeps only the definitions needed for the proofs; names are close to Mathlib but not guaranteed compatible. Mathlib has full typeclass hierarchies, instances, naming conventions and automation. When migrating, search by concept rather than copying lesson code verbatim.',
      },
      {
        kind: 'note',
        text: 'One takeaway: use this site for intuition and proof patterns; move real engineering and research to a local Mathlib setup.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `even_four`, then use `#check` to compare `List.mem_append` and `Nat.gcd_dvd_left` with their local Mathlib names.',
      hint: 'The witness for `even_four` is 2; `#check` only looks up names and creates no goal.',
      cta: 'Try it in the editor',
      starter:
        'theorem even_four : ∃ k, 4 = 2 * k := by\n  sorry\n\n#check List.mem_append\n#check Nat.gcd_dvd_left\n',
    },
  },
  {
    slug: 'eng-hashmap',
    track: 'eng',
    navTitle: '23 · HashMap membership',
    title: 'No more KeyNotFound: compile-time HashMap membership',
    lead: 'Turn “this key is definitely present” from a comment into a proof the compiler checks.',
    requires: ['std'],
    blocks: [
      {
        kind: 'p',
        text: 'One of the most common production crashes is calling `map.get(key)`, getting nothing, and panicking somewhere far away. Lean’s `HashMap` lets you carry a proof of `k ∈ m`, so the lookup can hand that proof to the compiler.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is `k ∈ m.insert k v`. On a HashMap, `∈` means “contains returns true”; there are no assumptions above the line yet, so the first step is to connect insertion with membership.',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\ndef scores : HashMap String Nat :=\n  (∅ : HashMap String Nat).insert "alice" 90 |>.insert "bob" 85\n\n#check scores',
      },
      {
        kind: 'p',
        text: '`scores["alice"]?` is the safe lookup: it returns an `Option` and never panics. Run it once to confirm the inserted key can be found.',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\ndef scores : HashMap String Nat :=\n  (∅ : HashMap String Nat).insert "alice" 90 |>.insert "bob" 85\n\n#eval scores["alice"]?',
      },
      {
        kind: 'p',
        text: 'Looking up a key immediately after inserting it always returns `some v`. This lemma is the foundation for every “inserted keys exist” proof.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ (m.insert k v)[k]? = some v\nsimp unfolds the HashMap lookup and insert rules\nThe condition k == k is true, so the goal closes',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\ntheorem lookup_after_insert (m : HashMap Nat Nat) (k v : Nat) :\n    (m.insert k v)[k]? = some v := by\n  simp',
      },
      {
        kind: 'p',
        text: 'Membership is also direct: `k ∈ m.insert k v` holds because the inserted key is definitely in the result.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ k ∈ m.insert k v\nrw [HashMap.mem_insert]\nGoal becomes k = k ∨ k ∈ m\nThe left side holds immediately',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\ntheorem mem_after_insert (m : HashMap Nat Nat) (k v : Nat) :\n    k ∈ m.insert k v := by\n  simp [HashMap.mem_insert]',
      },
      {
        kind: 'note',
        text: 'Run it once, then replace `HashMap.mem_insert` with `HashMap.getElem?_insert_self` and read why the lemma type does not match. Membership and lookup results are different statements.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why not just use get! ?',
        text: '`m[k]!` panics when the key is missing, which just hides the runtime risk deeper. Prove `k ∈ m` first, then use `m[k]` or a lookup that carries the proof, and the risk moves to compile time.',
      },
      {
        kind: 'p',
        text: "Put `k ∈ m` in the function signature and fetch with `m[k]'h`: the compiler demands a membership proof at every call site, so `KeyNotFound`-style runtime panics disappear during type checking.",
      },
      {
        kind: 'code',
        code: "import Std.Data.HashMap\n\nopen Std\n\ndef safeGet (m : HashMap Nat Nat) (k : Nat) (h : k ∈ m) : Nat := m[k]'h\n\ndef scores : HashMap Nat Nat := (∅ : HashMap Nat Nat).insert 1 42\n\nexample : safeGet scores 1 (by simp [scores]) = 42 := by\n  simp [safeGet, scores]",
      },
      {
        kind: 'note',
        text: 'One takeaway: prove `k ∈ m` before looking up; make “cannot happen” a fact in the type system.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `k ∈ m.insert k v`, then prove `(m.insert k v)[k]? = some v`.',
      hint: 'Use `simp [HashMap.mem_insert]` for membership and plain `simp` for the lookup. The two theorems do not say the same thing.',
      cta: 'Try it in the editor',
      starter:
        'import Std.Data.HashMap\n\nopen Std\n\ntheorem mem_after_insert (m : HashMap Nat Nat) (k v : Nat) :\n    k ∈ m.insert k v := by\n  sorry\n\ntheorem lookup_after_insert (m : HashMap Nat Nat) (k v : Nat) :\n    (m.insert k v)[k]? = some v := by\n  sorry\n',
    },
  },
  {
    slug: 'eng-bitvec',
    track: 'eng',
    navTitle: '24 · Bit operations and overflow',
    title: 'Bit operations and overflow guards: BitVec / UInt64 boundaries',
    lead: 'For systems, protocol, crypto and smart-contract developers: prove a mask works for every input, not just the ones in your test.',
    blocks: [
      {
        kind: 'p',
        text: 'When parsing a protocol you use `x & 0xFF` to take the low byte, and `a + b` to combine length fields. A unit test tries a few values; Lean can prove these operations work for every input, or demand an explicit “no overflow” proof.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is a bit-vector identity or an overflow condition. A bit vector is a fixed-width row of booleans; above the line you have width and boundary assumptions.',
      },
      {
        kind: 'code',
        code: 'example (x : BitVec 8) : x &&& 0xFF#8 = x := by\n  apply BitVec.eq_of_toNat_eq\n  have h255 : (0xFF#8).toNat = 255 := by decide\n  rw [BitVec.toNat_and, h255]\n  have hpow : (255 : Nat) = 2 ^ 8 - 1 := by rfl\n  rw [hpow, Nat.and_two_pow_sub_one_eq_mod, Nat.mod_eq_of_lt x.isLt]',
      },
      {
        kind: 'p',
        text: '`x &&& 0xFF#8 = x`: an 8-bit vector ANDed with an all-ones mask is unchanged. The proof converts to Nat and uses the lemma that AND with `2^8 - 1` is modulo arithmetic.',
      },
      { kind: 'code', code: 'example (x : BitVec 8) : x ||| 0#8 = x := by\n  ext i\n  simp' },
      {
        kind: 'p',
        text: '`x ||| 0#8 = x`: ORing with all zeros changes nothing. Expanding bit by bit with `ext i` closes it.',
      },
      { kind: 'code', code: 'example : (0xF0 : BitVec 8) &&& 0x0F = 0 := by\n  decide' },
      {
        kind: 'p',
        text: 'Concrete masks can be checked with `decide`: the compiler computes every bit and confirms `0xF0 &&& 0x0F` is 0.',
      },
      {
        kind: 'code',
        code: 'example (a b : UInt32) (h : a.toNat + b.toNat < 2^32) :\n    (a + b).toNat = a.toNat + b.toNat := by\n  rw [UInt32.toNat_add, Nat.mod_eq_of_lt h]',
      },
      {
        kind: 'p',
        text: 'Overflow guard: if `a.toNat + b.toNat < 2^32`, then `a + b` does not wrap and `toNat` agrees with ordinary addition. This is the compile-time guarantee that combining length fields will not overflow.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ (a + b).toNat = a.toNat + b.toNat\nrw [UInt32.toNat_add]: turn UInt32 addition into Nat addition plus modulo\nrw [Nat.mod_eq_of_lt h]: h says we stay below 2^32, so modulo is identity\nThe goal closes',
      },
      {
        kind: 'note',
        text: 'Run it once, then change the overflow hypothesis `h` to `a.toNat + b.toNat < 2^16` and see whether the proof still passes; then switch `UInt32` to `UInt8` and feel how width changes the boundary.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why not bv_decide?',
        text: '`bv_decide` encodes bit-vector goals as SAT and solves them; for large widths or complex expressions it can be slow or time out in browser WASM. These lessons use `decide`, `rw` and Nat lemmas instead: just as checkable, but more predictable.',
      },
      {
        kind: 'note',
        text: 'One takeaway: bit-mask identities can be proved bit by bit or reduced to Nat; overflow safety needs an explicit “stays within the width” premise.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `no_overflow`: 32-bit addition does not wrap when `a.toNat + b.toNat < 2^32`.',
      hint: '`rw [UInt32.toNat_add, Nat.mod_eq_of_lt h]`; first check that the direction of `h` matches what `Nat.mod_eq_of_lt` expects.',
      cta: 'Try it in the editor',
      starter:
        'theorem no_overflow (a b : UInt32) (h : a.toNat + b.toNat < 2^32) :\n    (a + b).toNat = a.toNat + b.toNat := by\n  sorry\n',
    },
  },
  {
    slug: 'eng-rbmap',
    track: 'eng',
    navTitle: '25 · Ordered TreeMap',
    title: 'Not a toy list: ordered TreeMap in practice',
    lead: 'An industrial `O(log n)` ordered map, with a theorem that insertion then lookup is correct.',
    requires: ['std'],
    blocks: [
      {
        kind: 'p',
        text: '`HashMap` is fast but iteration order is unstable. When you need output sorted by key, you switch to `TreeMap` (a red-black tree). `Std.TreeMap` is Lean’s ordered map with logarithmic insertion and lookup.',
      },
      {
        kind: 'note',
        text: 'Note: this site’s Batteries pack does not ship `Batteries.Data.RBMap`, so this lesson uses the standard-library `Std.TreeMap`. The interfaces and proof patterns are essentially the same; with a full local toolchain, change the import to `Batteries.Data.RBMap`.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is “lookup right after insert”. Above the line are the comparison function and the existing tree; the proof only needs to unfold insertion.',
      },
      {
        kind: 'code',
        code: 'import Std.Data.TreeMap\n\nopen Std\n\ndef prices : TreeMap Nat String compare :=\n  TreeMap.empty.insert 3 "c" |>.insert 1 "a" |>.insert 2 "b"\n\n#check prices',
      },
      {
        kind: 'p',
        text: 'Build a small tree and query a key. `#eval` follows the comparison function to the right node and prints `some "b"`.',
      },
      {
        kind: 'code',
        code: 'import Std.Data.TreeMap\n\nopen Std\n\ndef prices : TreeMap Nat String compare :=\n  TreeMap.empty.insert 3 "c" |>.insert 1 "a" |>.insert 2 "b"\n\n#eval prices.get? 2',
      },
      {
        kind: 'p',
        text: 'After inserting `k`, looking up `k` always returns the inserted `v`, for any tree and key, independent of balancing details.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ (t.insert k v)[k]? = some v\nsimp unfolds TreeMap getElem? and insert\nComparing k with k yields equal, so the goal closes',
      },
      {
        kind: 'code',
        code: 'import Std.Data.TreeMap\n\nopen Std\n\ntheorem tree_lookup_after_insert (t : TreeMap Nat Nat compare) (k v : Nat) :\n    (t.insert k v)[k]? = some v := by\n  simp',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `k` in `t.insert k v` to `k + 1` and see why the lookup now returns `none` or an old value.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'TreeMap or HashMap?',
        text: 'For pure point lookups `HashMap` is usually faster. When you need ordered traversal, range queries or stable output, `TreeMap` is the right tool. The “insert then lookup” proof pattern is nearly identical; only the underlying structure differs.',
      },
      {
        kind: 'note',
        text: 'One takeaway: `TreeMap` keeps order through its comparison function; lookup right after insert always finds the value.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove `lookup_after_insert`: a `TreeMap` lookup immediately after insertion returns the inserted value.',
      hint: 'Plain `simp` should do it; if you get stuck, `#check TreeMap.getElem?_insert` to see the insert rule.',
      cta: 'Try it in the editor',
      starter:
        'import Std.Data.TreeMap\n\nopen Std\n\ntheorem lookup_after_insert (t : TreeMap Nat Nat compare) (k v : Nat) :\n    (t.insert k v)[k]? = some v := by\n  sorry\n',
    },
  },
  {
    slug: 'eng-array-bounds',
    track: 'eng',
    navTitle: '26 · Eliminate out-of-bounds',
    title: 'Eliminate out-of-bounds access: put `i < arr.size` in the signature',
    lead: 'Move the boundary check from a runtime if to the function signature and its proof.',
    blocks: [
      {
        kind: 'p',
        text: 'Out-of-bounds access is a classic backend and systems crash: `arr[i]` explodes when `i >= size`. Lean’s `Array` offers indexed access and a version that takes “the index is valid” as an argument; if the signature contains `i < arr.size`, every caller must prove it first.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is “safe lookup definitely returns a value”. Above the line is `h : i < arr.size`, the boundary evidence the referee accepts.',
      },
      {
        kind: 'code',
        code: 'theorem getElem?_eq_some {α} (arr : Array α) (i : Nat) (h : i < arr.size) :\n    arr[i]? = some arr[i] :=\n  Array.getElem?_eq_getElem (xs := arr) (i := i) h',
      },
      {
        kind: 'p',
        text: '`getElem?_eq_some` translates “the index is valid” into “safe lookup returns `some`”. It is not a runtime check; it is a theorem for every array.',
      },
      {
        kind: 'code',
        code: 'theorem getElem?_eq_some {α} (arr : Array α) (i : Nat) (h : i < arr.size) :\n    arr[i]? = some arr[i] :=\n  Array.getElem?_eq_getElem (xs := arr) (i := i) h\n\ntheorem getElem?_isSome (arr : Array Nat) (i : Nat) (h : i < arr.size) :\n    (arr[i]?).isSome = true := by\n  rw [getElem?_eq_some arr i h]\n  rfl',
      },
      {
        kind: 'p',
        text: 'Given the previous theorem, `isSome` must be `true`: rewrite to `some arr[i]` and finish with `rfl`.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ (arr[i]?).isSome = true\nrw [getElem?_eq_some arr i h]: replace safe lookup with some arr[i]\nGoal becomes (some arr[i]).isSome = true\nrfl closes it',
      },
      {
        kind: 'note',
        text: 'Run it once, then change `h : i < arr.size` to `h : i ≤ arr.size` and see where the proof stops working. Relaxing the boundary by one kills the proof.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why not get! ?',
        text: '`arr[i]!` panics when out of bounds, just like `HashMap`’s `get!`: it postpones the risk to runtime. Indexing with `i < arr.size` hands the check to the caller, and the compiler ensures every call site did it.',
      },
      {
        kind: 'note',
        text: 'One takeaway: put `i < arr.size` in the signature so out-of-bounds access fails at compile time.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove that `arr[i]?` is `some` whenever the index is valid.',
      hint: 'First `rw [Array.getElem?_eq_getElem (xs := arr) (i := i) h]`, then `rfl`.',
      cta: 'Try it in the editor',
      starter:
        'theorem getElem?_isSome (arr : Array Nat) (i : Nat) (h : i < arr.size) :\n    (arr[i]?).isSome = true := by\n  sorry\n',
    },
  },
  {
    slug: 'eng-state-machine',
    track: 'eng',
    navTitle: '27 · Ledger conservation',
    title: 'State machines and ledger conservation',
    lead: 'Build a tiny ledger with `structure` and `HashMap`, then prove that every legal transfer conserves the total balance.',
    requires: ['std'],
    blocks: [
      {
        kind: 'p',
        text: 'A payment system fears money appearing or disappearing. Unit tests cover a few transfers; we model the ledger as a `HashMap`, write `transfer` as a state transition, and prove total-balance conservation for every legal input.',
      },
      {
        kind: 'p',
        text: 'Below `⊢` is the conservation equality. Above the line are `h : src ≠ dst` (different accounts) and `hbal : amt ≤ balance m src` (enough funds); those two assumptions define a legal transfer.',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\n#eval balance (∅ : Ledger) 1',
      },
      {
        kind: 'p',
        text: 'A ledger is just a `HashMap Nat Nat`; `balance` uses `getD`, so a missing account reads as 0.',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\ndef transfer (m : Ledger) (src dst amt : Nat) : Ledger :=\n  (m.insert src (balance m src - amt)).insert dst (balance m dst + amt)\n\n#eval balance (transfer (∅ : Ledger) 1 2 10) 2',
      },
      {
        kind: 'p',
        text: '`transfer` subtracts from the source and adds to the destination. It uses `Nat` subtraction: an insufficient balance truncates to 0, which is why the signature later requires `amt ≤ balance m src`.',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\ndef transfer (m : Ledger) (src dst amt : Nat) : Ledger :=\n  (m.insert src (balance m src - amt)).insert dst (balance m dst + amt)\n\ntheorem balance_src_after_transfer (m : Ledger) (src dst amt : Nat) (h : src ≠ dst) :\n    balance (transfer m src dst amt) src = balance m src - amt := by\n  simp [transfer, balance, HashMap.getD_insert, h.symm]',
      },
      {
        kind: 'p',
        text: 'First prove that the source account ends up with its old balance minus `amt`. Unfold insert and lookup, and use `src ≠ dst` to rule out reading the wrong account.',
      },
      {
        kind: 'code',
        code: "import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\ndef transfer (m : Ledger) (src dst amt : Nat) : Ledger :=\n  (m.insert src (balance m src - amt)).insert dst (balance m dst + amt)\n\ntheorem total_conserved (m : Ledger) (src dst amt : Nat) (h : src ≠ dst)\n    (hbal : amt ≤ balance m src) :\n    balance (transfer m src dst amt) src + balance (transfer m src dst amt) dst\n      = balance m src + balance m dst := by\n  simp [transfer, balance, HashMap.getD_insert, h.symm]\n  have hbal' : amt ≤ m.getD src 0 := hbal\n  rw [← Nat.add_assoc, Nat.add_right_comm, Nat.sub_add_cancel hbal']",
      },
      {
        kind: 'p',
        text: 'Then prove conservation: the source loses `amt`, the destination gains `amt`, and the total is unchanged.',
      },
      {
        kind: 'goal',
        text: 'Start: ⊢ balance (transfer m src dst amt) src + balance (transfer m src dst amt) dst\n        = balance m src + balance m dst\nsimp unfolds transfer, balance and getD_insert; h.symm rules out the same account\nGoal becomes (balance m src - amt) + (balance m dst + amt) = ...\nFinish with associativity and Nat.sub_add_cancel hbal',
      },
      {
        kind: 'code',
        code: 'import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\ndef transfer (m : Ledger) (src dst amt : Nat) : Ledger :=\n  (m.insert src (balance m src - amt)).insert dst (balance m dst + amt)\n\ntheorem balance_nonneg (m : Ledger) (k : Nat) : 0 ≤ balance m k := Nat.zero_le _',
      },
      {
        kind: 'p',
        text: 'Non-negative balances come for free with `Nat`: there are no negative numbers. The theorem is still worth stating, because choosing `Nat` over `Int` is a business decision.',
      },
      {
        kind: 'note',
        text: 'Run it once, then delete `hbal : amt ≤ balance m src` and see where conservation breaks; then switch `Nat` to `Int` and check whether “balance is non-negative” still comes for free.',
        tone: 'warn',
      },
      {
        kind: 'details',
        summary: 'Why not keep a total field?',
        text: 'A real ledger may keep an audit total, but that is redundant data: it must stay in sync with every account balance. Here the total is derived from the accounts, so proving conservation once removes the need for another synchronization invariant.',
      },
      {
        kind: 'note',
        text: 'One takeaway: write state-machine invariants as theorems, and put the preconditions of a legal transition (different accounts, enough funds) in the signature.',
      },
    ],
    exercise: {
      title: 'Exercise',
      body: 'Prove total-balance conservation for every legal transfer.',
      hint: 'Start with `simp [transfer, balance, HashMap.getD_insert, h.symm]`, then finish with `Nat.add_assoc`, `Nat.add_right_comm` and `Nat.sub_add_cancel hbal`.',
      cta: 'Try it in the editor',
      starter:
        'import Std.Data.HashMap\n\nopen Std\n\nabbrev Ledger := HashMap Nat Nat\n\ndef balance (m : Ledger) (k : Nat) : Nat := m.getD k 0\n\ndef transfer (m : Ledger) (src dst amt : Nat) : Ledger :=\n  (m.insert src (balance m src - amt)).insert dst (balance m dst + amt)\n\ntheorem total_conserved (m : Ledger) (src dst amt : Nat) (h : src ≠ dst)\n    (hbal : amt ≤ balance m src) :\n    balance (transfer m src dst amt) src + balance (transfer m src dst amt) dst\n      = balance m src + balance m dst := by\n  sorry\n',
    },
  },
];
