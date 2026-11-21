<h3><a href="README.md">简体中文</a> | English</h3>

# Lean Init IDE

**A real theorem prover, running in your browser.**

Not a demo, not a regex mock, and your code is never quietly shipped to a server. Lean 4.35.0 is
compiled to WebAssembly and packed into a Web Worker together with the full language server. You write
a proof, the compiler judges it on the spot — and your code never leaves your machine.

One wrong step and it stops you with a red underline; get it right and it just replies `no goals`.
Beyond `Init`, it mounts `Std` and `Batteries` on demand across **27 bilingual interactive lessons**,
**math challenges**, and a full **playground**.

Live: <https://criticalthinking.de5.net> (fallback: <https://lean-init-ide.pages.dev>)

## Start in 30 seconds

Open <https://criticalthinking.de5.net>, explore first, and download only when needed:

- **Try in 5 seconds with zero download**: the home page includes an interactive zero-download demo showing
  how `⊢` shrinks step by step, and every lesson's prose and right-hand **Goal walkthrough panel** work
  without starting the compiler.
- **Press Run for the real prover**: the first start downloads about 102 MB (Init, zstd-compressed and
  verified by SHA-256), then stays cached in the browser so return visits take roughly 4–7 seconds.
- **Friendly to lower-spec devices**: low-memory devices (`navigator.deviceMemory ≤ 4`) and Save-Data
  browsers wait for an explicit **Start Lean** click; requires cross-origin isolation (COOP/COEP) and
  `SharedArrayBuffer` (Chromium desktop and mobile layouts are both supported).

## How it differs from yet another sandbox

Spot-checking a few test values only verifies those examples. Lean checks mathematical logic across every
possible input at once.

- **A real compiler, not a mock.** Lean 4.35.0 is compiled to WebAssembly, so parsing, elaboration and
  diagnostics all happen in a local Web Worker. No regex ever guesses whether a proof is valid.
- **Step-by-step Goal panel & live diagnostics.** All 27 lessons include a sticky **Goal panel** that
  steps through the target state and updates live when you run snippets; opening an exercise or challenge
  in the playground keeps its prompt and collapsible hint pinned above the editor.
- **Init + Std + Batteries on demand.** Only `Init` downloads by default; engineering lessons and the
  playground mount `Std` (~75 MB) and `Batteries` (~5.7 MB) on demand and release them to free memory.
- **27 lessons + math challenges.** Three structured paths take learners from everyday intuition to real
  data structures and state machines, alongside standalone proof puzzles.

## Three learning paths

| Path | Who it is for | Lessons |
| --- | --- | --- |
| Getting started | Complete beginners building intuition for interactive proving and `⊢` | 9 |
| Math & verification | Readers with mathematical intuition translating paper proofs into Lean | 13 |
| Engineering | Backend, systems and security engineers verifying real data structures and invariants | 5 |

<details>
<summary>Expand all 27 lessons</summary>

### Getting started (9)

| Lesson | Topic | Key moves |
| --- | --- | --- |
| `what-is-lean` | A compiler that does math homework | `#eval`, `#check`, `rfl` |
| `first-proof` | Your first leak-proof proof | Reading context above `⊢`, `rfl`, `exact` |
| `implication` | Write an if…then… proof function | `intro`, `apply`, `exact` |
| `connectives` | Pack and unpack: ∧ and ∨ | `⟨hp, hq⟩`, `h.1` / `h.2`, `cases` |
| `induction` | Dominoes: induction is recursion | `induction ... with`, `simp only` |
| `rewrite` | Ctrl+H, but for proofs | `rw [Nat.add_comm]`, `rw [h]` |
| `simp` | Let `simp` clean up | `simp`, `simp only [Nat.succ_add]` |
| `quantifiers` | ∀ passes an argument, ∃ hands in a sample | `∀` as a function, `⟨n, proof⟩`, unpacking ∃ |
| `list-structure` | Build your own data structure | List `nil` / `cons`, `structure`, `#eval` |

### Math & verification (13)

| Lesson | Topic | Key moves |
| --- | --- | --- |
| `math-proof-style` | Translating a paper draft into Lean | `rcases`, `refine`, `by_cases`, `induction` |
| `math-divisibility` | Divisibility is multiplication in disguise | Existential `∣`, transitivity, `dvd_add` |
| `math-parity` | Your first complete parity proof | `Even` / `Odd`, unpacking ∃, `grind` |
| `math-gcd` | Specifying the greatest common divisor | `IsGcd`, proving `Nat.gcd` meets it, uniqueness |
| `math-primes` | Proof by contradiction, with primes | `Prime`, refutation, arbitrary divisors |
| `math-sets` | A set is just a function returning Prop | Predicate sets, `Subset`, union |
| `math-functions` | Injective, surjective, bijective | Function properties, composition |
| `math-relations` | Equivalence relations: three rules for sorting data | `IsEquivalence`, same-length relation |
| `math-strong-induction` | Strong induction: borrow every earlier step | `Nat.strongRecOn`, exponential bound |
| `code-sorting` | Prove insertion sort never sorts wrong | `Sorted`, `sorted_insert`, `mem_sort` |
| `code-sum` | Why concatenating two lists preserves sums | `sum`, `sum_append`, structural induction |
| `math-axioms` | The cheat detector: `sorry` and `#print axioms` | `#print axioms`, `sorryAx` |
| `math-mathlib` | From the browser sandbox to Mathlib | Built-in library boundary, local full toolchain |

### Engineering (5, based on Std + Batteries)

| Lesson | Topic | Key moves |
| --- | --- | --- |
| `eng-hashmap` | No more KeyNotFound or runtime panics | `Std.HashMap`, `k ∈ m`, `m[k]'h` |
| `eng-bitvec` | Bit operations and overflow guards | `BitVec`, `UInt32` / `UInt64`, `decide`, `Nat.mod_eq_of_lt` |
| `eng-rbmap` | Not a toy list: ordered TreeMap | `Std.TreeMap`, `insert` / `get?`, lookup-after-insert |
| `eng-array-bounds` | Eliminate out-of-bounds access | `Array.getElem?_eq_getElem`, `i < arr.size` in the signature |
| `eng-state-machine` | State machines and ledger conservation | `structure` + `HashMap`, `transfer`, conservation, non-negative balances |

</details>

## Math challenges

If you would rather start from a classic puzzle than lesson one:

- `/zh/challenges` and `/en/challenges` group puzzles into four themed zones: ⚡ Free Arena, ⚖️ Truth
  Court, 🔧 Contract Hunt, and 👑 Open Conjecture Hall. Every challenge has its own shareable URL at
  `/<lang>/challenges/<slug>` and uses the same runtime and Service Worker cache.
- “Play cards” replace the editor’s `sorry` with a complete, compilable proof. Truth Court asks you to
  choose a true/false stance first, then loads an independent template—so mouse-only play works with
  zero syntax knowledge. Starter code only depends on `Init`.
- Prefer the full editor? Open `/<lang>/playground?challenge=<slug>`; the prompt stays pinned above the
  editor and an existing local draft is never overwritten silently.

## Limitations

- **Init by default** (wasm32); Std and Batteries are optional extension packs.
- The experimental wasm64 runtime can load **Std / Lean core** and a curated **Mathlib subset** on demand (183 modules including `Mathlib.Order.Basic` and `Mathlib.Tactic.Spread`), not full Mathlib; wasm32 stays the default.
- Requires cross-origin isolation (COOP/COEP) and SharedArrayBuffer; Chromium-based browsers work best.

## Privacy

The site has a [privacy notice](https://criticalthinking.de5.net/en/privacy): runtime telemetry
contains no cookies, user code or device fingerprints, and can be disabled with Do Not Track.
Page views and Core Web Vitals are collected by Cloudflare Web Analytics.

## Under the hood

- **Language layer**: Monaco + `@wasm-idle/lsp`; Lean 4.35.0 runs in a Web Worker and speaks LSP over postMessage.
- **Cross-origin isolation**: COOP/COEP and SharedArrayBuffer let the wasm threading model run unchanged,
  which is what makes a real compiler possible in the page.
- **Asset layer**: a Service Worker fetches assets from R2 through the same-origin `/cdn/` gateway in
  4 MB ranges, verifies each range with SHA-256, and falls back to the ModelScope mirror and a
  same-origin static copy.
  `Init` is about 102 MB, `Std` about 75 MB and `Batteries` about 5.7 MB, loaded on demand.
- **App layer**: a static site; routing, i18n and theming are all client-side, and Pages Functions
  only provide the asset gateway and the telemetry receiver.

Technical docs are currently in Chinese: [architecture](docs/ARCHITECTURE.md),
[development](docs/DEVELOPMENT.md), [operations](docs/OPERATIONS.md).

## Local development

```bash
pnpm install         # install dependencies and apply the @wasm-idle/lsp patches
pnpm run dev         # dev server (downloads and verifies the runtime on first run)
pnpm run build:web   # front-end build only, skipping the runtime assets
pnpm test            # Vitest + coverage thresholds
pnpm run smoke       # production smoke test, after a release
```

Run the full gate before committing; commands and coverage thresholds are in
[development](docs/DEVELOPMENT.md).

## Contributing

Here is how to make it better:

- Read [AGENTS.md](AGENTS.md) first: hard constraints, module boundaries and known traps (in Chinese).
- One concern per commit; lesson code must stay within what the runtime can load (Init, plus Std /
  Batteries for engineering lessons).
- User-visible copy must be added in both languages; a parity test enforces the key set.

## Contact

Please use the public channels first, so others can find the answer and maintainers do not repeat
themselves:

- **Found a bug, a wrong lesson, or want a feature** → open an [Issue](https://github.com/3y3y3y-huaiji/lean-init-ide/issues)
  with reproduction steps or a page link.
- **Already know how to fix it** → send a [Pull Request](https://github.com/3y3y3y-huaiji/lean-init-ide/pulls);
  read [AGENTS.md](AGENTS.md) before you start.
- **Anything else** (partnerships, licensing, security reports and other things that should not be
  public) → email <sumingkai1@outlook.com>.

In short: if an Issue or PR can handle it, skip the email; keep the inbox for what genuinely should
not be discussed in public.

## Docs

- [Docs index](docs/README.md)
- [Architecture decisions (ADR)](docs/DECISIONS.md)
- [CI / CD workflow map](docs/CI.md)
- [Architecture and runtime distribution](docs/ARCHITECTURE.md)
- [Local development and quality gates](docs/DEVELOPMENT.md)
- [Deployment, telemetry and troubleshooting](docs/OPERATIONS.md)

## License

Dual-licensed; pick either:

- [Apache License 2.0](LICENSE-APACHE)
- [Mulan Permissive Software License v2](LICENSE-MULAN)

SPDX identifier: `(Apache-2.0 OR MulanPSL-2.0)`.
