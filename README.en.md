<h3><a href="README.md">简体中文</a> | English</h3>

# Lean Init IDE

Run a real Lean 4.35.0 theorem prover in your browser. A Monaco editor plus the full language server,
all inside a Web Worker — not a regex mock, and not code shipped to a server. Open the page, write
proofs, read diagnostics and inspect goals; your code never leaves the browser.

Live: <https://criticalthinking.de5.net> (fallback: <https://lean-init-ide.pages.dev>)

## Start in 30 seconds

Open <https://criticalthinking.de5.net>, pick a lesson, press **Run**.

- The first run downloads about 102 MB (zstd-compressed), then caches it in the browser; later visits
  are usually ready in 4–7 seconds.
- It requires cross-origin isolation (COOP/COEP) and SharedArrayBuffer; Chromium-based browsers work best.
- Low-memory devices (`navigator.deviceMemory ≤ 4`) do not auto-download; press **Start Lean** yourself.
- Reading lessons does not require starting the engine; the runtime only loads when you press **Run**.

## Why this is not just another sandbox

Unit tests only cover the cases you remembered to write. Lean uses mathematical logic to rule out
every possible input at once, and the compiler stops you with a red line the moment a step breaks.

- **A real compiler, not a mock.** Lean 4.35.0 is compiled to WebAssembly, so parsing, elaboration and
  diagnostics all happen in the page. No regex ever decides whether a proof is valid.
- **Live diagnostics and goals.** The LSP publishes diagnostics once typing settles, and the goal panel
  follows your cursor inside a proof.
- **Init + Std + Batteries, split into packs.** Only Init downloads by default; engineering lessons
  mount Std and Batteries on demand and release them when they are no longer needed.
- **27 lessons, three paths.** From absolute basics to real data structures and state machines, every
  lesson runs in the page.

## Three learning paths

| Path | Who it is for | Lessons |
| --- | --- | --- |
| Getting started | Complete beginners who want to feel interactive proving first | 9 |
| Math & verification | Readers with mathematical intuition who want to translate it into Lean | 13 |
| Engineering | Backend, systems and security engineers verifying real data structures and invariants | 5 |

## Math challenges

If you would rather start from a classic puzzle than lesson one:

- `/zh/challenges` and `/en/challenges` sit beside the courses. Every challenge has its own shareable
  URL at `/<lang>/challenges/<slug>` and uses the same runtime and Service Worker cache.
- Each page keeps a live Goal panel plus one-click `rfl` / `intro` / `rw` / `simp` / `omega` tactic
  buttons. The starter code only depends on Init.
- Prefer your own editor? Open `/<lang>/playground?challenge=<slug>`; an existing local draft is never
  overwritten silently.

## Lessons

### Getting started (9)

| Lesson | Topic | Key moves |
| --- | --- | --- |
| `what-is-lean` | A compiler that does math homework | `#eval`, `#check`, `rfl` |
| `first-proof` | Your first leak-proof proof | `rfl`, equality as a type |
| `implication` | Write an if…then… proof function | `intro`, `exact` |
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
| `code-sorting` | Prove insertion sort never sorts wrong | `Sorted`, membership preservation, sortedness exercise |
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

## Limitations

- **Init by default**; Std and Batteries are optional extension packs. No Lean / Lake / Mathlib.
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
  4 MB ranges, verifies each range with SHA-256, and falls back to GitHub raw and a static copy.
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

- Read [AGENTS.md](AGENTS.md) first: hard constraints, module boundaries and known traps (in Chinese).
- One concern per commit; lesson code must stay within what the runtime can load (Init, plus Std /
  Batteries for engineering lessons).
- User-visible copy must be added in both languages; a parity test enforces the key set.

## Docs

- [Docs index](docs/README.md)
- [CI / CD workflow map](docs/CI.md)
- [Architecture and runtime distribution](docs/ARCHITECTURE.md)
- [Local development and quality gates](docs/DEVELOPMENT.md)
- [Deployment, telemetry and troubleshooting](docs/OPERATIONS.md)

## License

Dual-licensed; pick either:

- [Apache License 2.0](LICENSE-APACHE)
- [Mulan Permissive Software License v2](LICENSE-MULAN)

SPDX identifier: `(Apache-2.0 OR MulanPSL-2.0)`.
