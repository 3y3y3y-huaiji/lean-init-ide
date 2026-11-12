[简体中文](README.md) | English

# Lean Init IDE

A Lean 4 learning environment in the browser: a Monaco editor plus a real Lean language server
running in a Web Worker. Write proofs, read diagnostics and inspect goals without installing a
toolchain — and without a backend.

Live: <https://criticalthinking.de5.net> (fallback: <https://lean-init-ide.pages.dev>)

## What it is

A Lean 4 learning environment that needs no installation. The Lean 4.34.1 Init runtime is compiled
to WebAssembly and the real language server runs in a Web Worker: open the page, write proofs,
read diagnostics and goals, and your code never leaves the browser.

Who it is for:

- people who want to try Lean without installing elan / Lake / Mathlib
- classrooms demonstrating “propositions as types”
- developers curious whether a language server can run in the browser

It ships Init only: no Std / Lean / Lake / Mathlib, so the lessons stay within basic types, List
and propositional logic.

## Quick start

Open <https://criticalthinking.de5.net>, pick a lesson and press **Run**. No sign-up, no install.

- The first run downloads about 143 MB and then caches it in the browser (later visits are usually
  ready in 4–7 seconds).
- It requires cross-origin isolation and SharedArrayBuffer; Chromium-based browsers work best.
- Low-memory devices (`navigator.deviceMemory ≤ 4`) do not auto-download; press **Start Lean**
  yourself.
- Reading lessons does not require starting the engine.

## Features

- A real Lean 4.34.1 Init runtime: parsing, elaboration and diagnostics in the page
- Diagnostics, goal state (`$/lean/plainGoal`), hover, completion and go-to-definition
- Bilingual UI (`/zh/` and `/en/`), remembers your choice
- Light / dark / system themes, with Monaco following along
- 8 intro lessons; code blocks run in place, exercises open the playground with a starter
- The runtime streams in 4 MB ranges with per-chunk verification and automatic source fallback
- Low-memory devices skip auto-download and cap the persistent cache at 128 MB

## Lessons

Each lesson has three runnable code blocks and one exercise, all within Init.

| Lesson | Topic | Key moves |
| --- | --- | --- |
| `first-proof` | Ask Lean a question | `#check`, `#eval`, `rfl` |
| `implication` | Propositions are types | `intro`, `exact`, function composition |
| `connectives` | Building and using ∧ / ∨ | `⟨hp, hq⟩`, `h.1` / `h.2`, `cases` |
| `induction` | Prove commutativity by induction | `induction ... with`, `simp only` |
| `rewrite` | Rewrite the goal with rw | `rw [Nat.add_comm]`, `rw [h]` |
| `simp` | Let simp finish the goal | `simp`, `simp only [Nat.succ_add]` |
| `quantifiers` | Using ∀ and ∃ | `∀` as a function, `⟨n, proof⟩`, unpacking ∃ |
| `list-structure` | Inductive types and structures | List `nil` / `cons`, `structure`, `#eval` |

## Limitations

- **Init only** — no Std / Lean / Lake / Mathlib, so lessons stay within basic types, List and
  propositional logic.
- Requires cross-origin isolation (COOP/COEP) and SharedArrayBuffer; Chromium-based browsers work
  best.

## Privacy

The site has a [privacy notice](https://criticalthinking.de5.net/en/privacy): runtime telemetry
contains no cookies, user code or device fingerprints, and can be disabled with Do Not Track.
Page views and Core Web Vitals are collected by Cloudflare Web Analytics.

## Under the hood

- **Language layer**: Monaco + `@wasm-idle/lsp`; Lean 4.34.1 runs in a Web Worker and speaks LSP
  over postMessage.
- **Asset layer**: a Service Worker fetches the ~143 MB runtime from a same-origin `/cdn/` gateway
  backed by R2 in 4 MB ranges, falling back to GitHub raw and a static copy.
- **App layer**: a static site; routing, i18n and theming are all client-side, and Pages Functions
  only provide the asset gateway and the telemetry receiver.

Technical docs are currently in Chinese: [architecture](docs/ARCHITECTURE.md),
[development](docs/DEVELOPMENT.md), [operations](docs/OPERATIONS.md).

## Local development

```bash
pnpm install         # install dependencies and apply the @wasm-idle/lsp patches
pnpm run dev         # dev server (downloads and verifies the runtime on first run)
pnpm run build:web   # front-end build only, skipping the 143 MB assets
pnpm test            # Vitest + coverage thresholds
pnpm run smoke       # production smoke test, after a release
```

Run the full gate before committing; commands and coverage thresholds are in
[development](docs/DEVELOPMENT.md).

## Contributing

- Read [AGENTS.md](AGENTS.md) first: hard constraints, module boundaries and known traps (in Chinese).
- One concern per commit; lesson content must stay within Init.
- User-visible copy must be added in both languages; a parity test enforces the key set.

## Docs

- [Architecture and runtime distribution](docs/ARCHITECTURE.md)
- [Local development and quality gates](docs/DEVELOPMENT.md)
- [Deployment, telemetry and troubleshooting](docs/OPERATIONS.md)

## License

Dual-licensed; pick either:

- [Apache License 2.0](LICENSE-APACHE)
- [Mulan Permissive Software License v2](LICENSE-MULAN)

SPDX identifier: `(Apache-2.0 OR MulanPSL-2.0)`.
