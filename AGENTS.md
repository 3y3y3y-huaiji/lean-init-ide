# AGENTS.md

面向在本仓库工作的 AI Agent 与协作者。README 讲「是什么、怎么跑」；本文件只讲「什么不能碰、改一处要同步哪里、怎么验证」。

## 项目是什么

浏览器里的 Lean 4 学习环境：Monaco 编辑器 + 真正运行在 Web Worker 里的 Lean 4.35.0 Init 语言服务器。没有后端服务，没有构建期编译。

- 线上：<https://criticalthinking.de5.net>（单域名，`lean-init-ide.pages.dev` 仅作回退）
- 托管：Cloudflare Pages，push `main` 即部署
- 运行时资产：约 102 MB，11 个对象，存放在 R2 桶，经站点同源 `/cdn/` 网关读取

## 按任务定位

| 你要改什么 | 先读 |
| --- | --- |
| 运行时资产、清单 | `config/lean4-runtime.json`；`docs/ARCHITECTURE.md`「运行时分发」；`docs/OPERATIONS.md`「资产维护」 |
| `/cdn` 网关、缓存、Range | `functions/cdn/`；`src/cdn-range.ts`；`docs/OPERATIONS.md`「访问控制与成本保护」 |
| 前端、课程、i18n | `src/views/`；`src/i18n/`；`docs/DEVELOPMENT.md` |
| CI、部署、冒烟 | `docs/CI.md`；`docs/OPERATIONS.md`「部署与冒烟」 |
| wasm64 构建、栈补丁、差分门禁 | `docs/WASM64-SPIKE.md`；`scripts/pin-lean.ts`；`scripts/wasm64-patch-equivalence.ts` |

## 强联动文件（R）

改左侧任一文件时，必须检查右侧消费者；只改一处通常会在运行时才暴露。

| 单一事实来源 | 必须同步 |
| --- | --- |
| `config/lean4-runtime.json` | `src/sw.ts`、`functions/cdn/`、`scripts/fetch-assets.mjs`、`upload-assets.mjs`、`upload-modelscope.mjs`、`verify-manifest.mjs`、`verify-build.mjs`、`probe-sources.mjs`、`smoke.mjs`、`local-gateway.mjs`、`patch-lsp.mjs`、`src/runtime-extensions.ts`、`src/components/lean-markup.ts`、CI 缓存键 `hashFiles(...)` |
| `config/lean4-wasm64-runtime.json` | `src/sw.ts`、`src/lean-wasm64-*.ts`、`functions/cdn/`、`scripts/verify-*.mjs`、`public/_headers`、`.github/workflows/runtime-wasm32-435.yml` |
| `src/asset-sources.mjs` | `src/sw.ts`、`src/asset-source.ts`、`src/runtime-extensions.ts`、`src/sw-assemble.ts`、`scripts/fetch-assets.mjs`、`upload-assets.mjs`、`probe-sources.mjs`、`asset-sources.d.mts` 与测试 |
| `src/cdn-range.ts` | `functions/cdn/[[path]].ts`、`src/cdn-range.test.ts` |
| `public/_headers` | `scripts/verify-build.mjs`、`scripts/smoke.mjs`、`scripts/local-gateway.mjs`、`index.html` 的内联脚本哈希 |
| `wrangler.toml` | `functions/cdn/` 的 `LEAN_ASSETS` binding；production / preview 两份 `[[env.*.r2_buckets]]` |
| `patches/` 或清单哈希 | `pnpm-workspace.yaml` 的 `patchedDependencies`；`pnpm run patch:lsp`；`src/lsp-patches.test.ts` |
| `scripts/pin-lean.ts` 的 `LEAN_PIN` | `scripts/patches/lean-*.patch`（三份补丁必须匹配该源码）、`.github/workflows/spike-wasm64.yml` 的缓存键与 `deep` 分支、`docs/WASM64-SPIKE.md` |
| `scripts/patches/lean-*.patch` | 对应的 `grep` 断言、`.github/workflows/spike-wasm64.yml` 的 runtime / cgen / objects 缓存键、`scripts/wasm64-patch-equivalence.ts` 的差分语料 |
| `scripts/wasm64-patch-equivalence.ts` | `.github/workflows/spike-wasm64.yml` 的 smoke job；新增栈补丁时先补差分用例 |

原则：先改单一事实来源，再沿右列同步。资产清单只有 `config/lean4-runtime.json`；资产源解析只有 `src/asset-sources.mjs`；Range 语义只有 `src/cdn-range.ts`；wasm64 的 Lean 版本只有 `scripts/pin-lean.ts`。

## 硬红线（物理/平台）

1. **资产字节不可漂移。** `scripts/assets/**` 在 `.gitattributes` 里标记为 `-text`，禁止文本转换。改这些文件必须同步 `bytes` 与 `sha256`、更换 `cacheKey`、重新上传 R2；边缘缓存按 URL 缓存一年（`immutable`），不换版本键用户会继续拿到旧对象。
2. **跨源隔离不能破坏。** 页面响应必须带 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`，否则 `SharedArrayBuffer` 与 wasm 线程模型不可用。
3. **只用一个域名。** 不要引入第二个可访问 origin。Service Worker 缓存与 localStorage 按 origin 隔离，双域名等于让用户重下 102 MB。
4. **R2 binding 名固定为 `LEAN_ASSETS`。** `ASSETS` 是 Pages 内部静态资源服务的保留名，用了会报 `does not implement the method "get"`。
5. **CSP 不能删这几项。** `'wasm-unsafe-eval'`（WebAssembly 编译）、`blob:`（Worker 动态导入）、`static.cloudflareinsights.com`（Web Analytics）、`connect-src` 里的 `https://*.modelscope.cn`（镜像回退）与 `data:`（zstddec 内嵌 wasm）。
6. **课程内容只能落在运行时可加载的范围内。** 默认只有 Init；工程实战课依赖按需挂载的 Std / Batteries（`requiredExtensions`）。运行时不含 Lean / Lake / Mathlib，引用会编译失败。
7. **遥测不记录用户代码、cookie、设备指纹；任何上报失败必须静默。**
8. **wasm64 的 Lean 版本只有 `scripts/pin-lean.ts` 一个事实来源。** 默认值在 `LEAN_PIN`，`LEAN_PIN_*` 环境变量只用于本地/临时覆盖；正式升级必须改 `LEAN_PIN` 以让 `hashFiles(...)` 缓存键失效。升级时必须同时重做三份栈补丁，并让 `scripts/wasm64-patch-equivalence.ts` 的差分门禁（官方原生 Lean vs 打补丁 wasm64）在 CI 通过；不能只改 pin 就发布。补丁必须与当前 pin 的源码逐行匹配，`grep` 断言缺失应直接失败，禁止静默跳过。

## 非显式约束（S）

- `public/_routes.json` 的 `include` 只允许显式 Functions 路由，当前是 `["/cdn/*", "/api/telemetry"]`。不要改成通配符或目录；新增 Functions 路由时要同步 `scripts/verify-build.mjs`。漏掉 `/api/telemetry` 会让请求落到 SPA fallback 并返回 HTML。
- `wrangler.toml` 顶层 binding 不落到 production / preview；Git 集成部署读的是 `[[env.*.r2_buckets]]`，两处都要写。
- Pages 会覆盖静态资源的 `Cache-Control`：`_headers` 里给 `/sw.js` 写的 `no-cache` 实测不生效（`max-age=14400`）。
- `connect-src` 漏掉魔搭域名会让镜像回退静默失败；Cloudflare Web Analytics 会注入第三方 beacon，并可能同时出现 Pages 与 zone 两个 token。
- 走代理时 curl 会先写 `200 Connection Established`；解析状态码必须取最后一个真实 HTTP 行。
- `pnpm audit` 走默认镜像会 405，需要 `--registry=https://registry.npmjs.org`。
- 课程页的 `dropSpuriousRedeclarations` 只过滤代码里出现一次的名字；不要删，也不要搬到 playground（那里需要看到真实重复声明）。
- `src/components/lean-panel.ts` 因 rollup 无法解析其类型语法，被排除出 v8 覆盖率；不要把可测纯逻辑塞进装配层。
- Analytics Engine binding 尚未声明，指标目前只写 Workers Logs；要启用需在 production / preview 同时加 `[[env.*.analytics_engine_datasets]]`。

## 模块边界

- `src/main.ts` 只做路由、语言、主题装配；业务逻辑放 `views/` 或独立模块。
- `src/views/` 只产出字符串并绑定事件；不要在渲染函数里发请求或读全局状态。
- `src/sw.ts` 只做资产分片下载与缓存，不写业务逻辑。
- `src/asset-source.ts` 只做页面侧 `?source=` 强制源开关，不要做成持久化的用户设置。
- `src/device.ts` 不改 wasm 内存上限，1 GiB 是导入峰值所需。
- `functions/cdn/` 不放宽白名单，不移除 Range 处理；`functions/api/` 不放宽字段校验，不回显原始请求体。
- `scripts/` 不硬编码域名，用 `LEAN_ASSET_ORIGIN`。

## 改动与验证

- 本地可跑快速检查：`pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、目标单测。E2E、全量构建等重型门禁交给 PR 的 GitHub Actions。
- PR 的 `CI · 应用` 必须全绿：`changes` / `static` / `test` / `build` / `浏览器端到端`（聚合 `e2e-smoke` / `e2e-lessons-full` / `e2e-lessons-changed`）/ `audit` / `actionlint`。`scripts/detect-changes.mjs` 会按改动类型自动跳过无关门禁：纯文档 / 纯工作流改动直接过，课程内容改动只跑改到的 slug，只有运行时 / 资产 / LSP / 网关改动才跑全量课程。合并 `main` 后由 `Deploy · 应用` 构建、部署和冒烟，不要绕过它手动传文件。详见 `docs/CI.md`。
- 覆盖率阈值在 `vitest.config.ts`；降低阈值需要单独说明理由。新增纯函数、解析器、状态机必须有单测；触及 `/cdn` 网关或 Range 语义必须有单测；视图断言结构而不是整段 HTML。
- 一个提交只做一件事；提交信息用 `type(scope): 一句话结论`，正文写「为什么」。类型与 lint 以 `tsconfig` + ESLint 为准；用户可见文案走 `src/i18n/`，中英文同时补齐。

## 文档联动

- 资产分发链路或清单字段 → `docs/ARCHITECTURE.md`「运行时分发」与 `docs/OPERATIONS.md`「资产维护」
- 指标事件、字段或路由 → `docs/OPERATIONS.md`「运行指标与错误上报」
- 门禁命令或阈值 → `docs/DEVELOPMENT.md`「质量门禁」
- 部署方式或域名 → `README.md` 顶部与 `docs/OPERATIONS.md`「部署与冒烟」
- README 用户可见内容 → 同步 `README.en.md`，两份保持同一结构
- 新增硬约束 → 本文件「硬红线」
