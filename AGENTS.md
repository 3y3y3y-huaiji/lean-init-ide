# AGENTS.md · 仓库总导航地图

面向在本仓库工作的 AI Agent 与协作者。**按任务懒加载子目录指南与 `docs/` 专题文档，不在无关改动时通读历史日志。**

## 1. 四大子系统地形图

| 子系统 | 职责与核心路径 | 进一步阅读 | 默认快速验证 |
| --- | --- | --- | --- |
| **前端 SPA + SSG** | `src/`（路由 `src/main.ts`、视图 `src/views/`、编辑器 `src/components/`、双语课程 `src/i18n/`、`src/challenges.ts`） | [DEVELOPMENT](docs/DEVELOPMENT.md)；改课程先读 [i18n 指南](src/i18n/AGENTS.md) | `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm test` |
| **边缘网关与 SW** | `functions/cdn/[[path]].ts`（R2 网关）、`functions/api/`（遥测/限流）、`src/sw.ts` + `src/sw-*.ts`、`src/cdn-range.ts` | [ARCHITECTURE](docs/ARCHITECTURE.md)、[OPERATIONS](docs/OPERATIONS.md) | `pnpm exec vitest run functions/ src/sw-*.test.ts src/cdn-range.test.ts` |
| **生产 wasm32 资产与 E2E** | `scripts/*.mjs`（资产下载压缩 `scripts/fetch-assets.mjs`、上传、清单/产物/文档校验、Playwright `scripts/e2e-*.mjs`） | 脚手架细节见 [scripts 指南](scripts/AGENTS.md)；工作流见 [CI](docs/CI.md) | `pnpm run verify:manifest && pnpm run verify:docs && pnpm run build:web && pnpm run verify:build` |
| **实验 wasm64 工具链** | `scripts/*.ts` + `scripts/lib/` + `scripts/ci/` + `scripts/patches/`（pin **4.36.0-rc2**、三份堆栈补丁、差分等价门禁） | 规范与升级流程见 [WASM64-SPIKE](docs/WASM64-SPIKE.md) 与 [scripts 指南](scripts/AGENTS.md) | `pnpm run format:check:spike && pnpm run lint:spike && pnpm run typecheck:spike && pnpm run test:spike` |

> **历史归档红线**：[docs/archive/](docs/archive/) 仅保留早期实验与自我推翻的探针过程日志，**严禁将归档内容当作当前架构设计或开发规范**。关键不可回退决定见 [DECISIONS](docs/DECISIONS.md)。

## 2. 单一事实来源（SSOT）与强联动表

先改左侧唯一来源，再检查右侧消费者（已由脚本与单测强校验的项目不在此展开）：

| 单一事实来源 | 必须同步的消费者与注意点 |
| --- | --- |
| `config/lean4-runtime.json` | `src/sw.ts`、`functions/cdn/`、`scripts/fetch-assets.mjs`、上传脚本、`verify-manifest`、`pnpm run patch:lsp`、CI 缓存键 |
| `config/lean4-wasm64-runtime.json` | `src/lean-wasm64-*.ts`、`src/runtime-extensions.ts`、`functions/cdn/`（需同步注册扩展键）、上传/校验脚本 |
| `src/asset-sources.mjs` | `src/sw*.ts`、`src/asset-source.ts`、`src/runtime-extensions.ts`、`scripts/`（TypeScript 声明同步 `src/asset-sources.d.mts`） |
| `src/cdn-range.ts` | `functions/cdn/[[path]].ts`、`src/cdn-range.test.ts` |
| `public/_headers` / `public/_routes.json` | `scripts/verify-build.mjs`、`scripts/local-gateway.mjs`、`scripts/smoke.mjs`（仅限 `/cdn/*` 与 `/api/telemetry`） |
| `wrangler.toml` | `LEAN_ASSETS` binding 必须同时出现在顶层、`env.preview`、`env.production` |
| `patches/` 或清单 SHA-256 | 重跑 `pnpm run patch:lsp && pnpm install --no-frozen-lockfile`，确认 `src/lsp-patches.test.ts` |
| `scripts/pin-lean.ts` (`LEAN_PIN`) | `scripts/patches/lean-*.patch`、`.github/workflows/spike-wasm64.yml` 缓存键、`scripts/wasm64-patch-equivalence.ts`、`docs/` |

## 3. 机器难拦的物理与平台红线

1. **包管理唯一用 `pnpm`**（Node >= 24）；禁止 `npm` / `npx` / `yarn` 污染锁文件；`scripts/assets/**` 禁止文本换行符转换（`.gitattributes` `-text`）。
2. **严格跨源隔离与单域名**：始终保留 COOP (`same-origin`) + COEP (`require-corp`) 与 `SharedArrayBuffer`；绝不新增第二个用户可访问 origin（会破坏按 origin 隔离的 102MB 持久缓存）。
3. **CSP 核心放行不可删**：`'wasm-unsafe-eval'`（编译）、`blob:`（Worker 动态导入）、`https://*.modelscope.cn`（镜像回退）、`data:`（zstddec 内嵌 wasm）、`static.cloudflareinsights.com`（分析）；浏览器端禁止直连 GitHub（见 [ADR-01](docs/DECISIONS.md#adr-01)）。
4. **R2 binding 名固定为 `LEAN_ASSETS`**（`ASSETS` 为 Pages 保留名）；`connect-src` 与 CORS 对齐后方可改源。
5. **扩展包与基础 `cacheKey` 解耦**：扩展资产使用独立 `h=<sha256>`，升级 Std / Batteries / Mathlib **不要**改基础 `cacheKey`（避免迫使全量用户重下 100MB Init）；`wasm32` 与 `wasm64` 扩展 `.olean` 不可混挂（见 [ADR-03](docs/DECISIONS.md#adr-03)）。
6. **核心纯逻辑与装配分离**：`vitest.config.ts` 中 `coverage.exclude` 只放纯装配/入口；新增纯函数、解析器、网关或状态机必须配单测，视图测结构、测交互而非整段 HTML 快照。
7. **遥测与隐私底线**：严禁采集用户 Lean 代码、cookie 或设备指纹；任何上报失败静默降级，改动采集字段需同步站内隐私页（`src/views/privacy.ts` 与 `src/i18n/`）。
8. **模块边界**：`src/views/` 只做纯字符串渲染与事件绑定，`src/sw.ts` 分片请求固定 `cache: 'no-store'`（持久缓存归 `wasm-idle-assets-v1:*`），`scripts/*.mjs` 不硬编码生产域名（走 `LEAN_ASSET_ORIGIN`）。

## 4. PR 协作与 CI/CD 铁律

- **永远从最新 `origin/main` 拉 clean 分支开 PR**：一件事一个 PR，提交规范 `<type>(<scope>): 一句话结论`，不直接 push 到 `main`（也不擅自代用户 merge PR）。
- **重型门禁交给 `CI · 应用`**：本地只跑轻量检查（`verify:docs` / `format:check` / `lint` / `typecheck` / 目标单测）；`CI · 应用` 会通过 `scripts/detect-changes.mjs` 自动按档裁剪，纯文档改动 5 秒完结，门禁升级时 [ci-refresh-open-prs.yml](.github/workflows/ci-refresh-open-prs.yml) 会自动刷新在途 PR。
- **用户可见文本双语同步**：任何前端文案、课程或挑战必须同步更新 `src/i18n/`（通过 `locale-parity.test.ts` 与 `curriculum-invariants.test.ts`）。
- **文档改动同步触发 `verify:docs`**：修改架构、工作流、脚本、版本、课时数或 ADR 时，同步对应唯一的权威文档。
