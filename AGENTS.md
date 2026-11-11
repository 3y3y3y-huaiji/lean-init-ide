# AGENTS.md

面向在本仓库工作的 AI Agent 与协作者。README 讲「这是什么、怎么跑」，这份文件讲「什么不能碰、改完怎么证明没改坏」。

## 项目是什么

浏览器里的 Lean 4 学习环境：Monaco 编辑器 + 真正运行在 Web Worker 里的 Lean 4.34.1 Init 语言服务器。
没有后端服务，没有构建期编译，全部逻辑在浏览器内完成。

- 线上：<https://criticalthinking.de5.net>（单域名，`lean-init-ide.pages.dev` 仅作回退）
- 托管：Cloudflare Pages（Git 集成，push `main` 即部署）
- 运行时资产：约 143 MB，11 个对象，存放在 R2 桶，经站点同源 `/cdn/` 网关读取

## 开始之前

按顺序读：`README.md`（分发与部署全貌）→ 本文件（硬约束）→ 你要改的那个模块的源码。

不要凭猜测修改以下文件。它们的每一个字节都有外部依赖：

| 文件 | 为什么危险 |
| --- | --- |
| `config/lean4-runtime.json` | 字节数与 SHA-256 被构建脚本、Service Worker、上传脚本三方共用，改错即全链路校验失败 |
| `public/_routes.json` | 决定哪些请求走 Pages Functions，写宽了会让全站请求多一层开销 |
| `public/_headers` | COOP/COEP 是 wasm 线程模型的前提，缺失会让 SharedArrayBuffer 不可用 |
| `wrangler.toml` | R2 binding 名必须是 `LEAN_ASSETS`，且 production / preview 必须各写一份 |
| `scripts/assets/**` | 按字节校验的资产文件，任何格式化都会改变哈希 |

## 硬约束

违反任意一条都会造成线上故障，且本地 `npm run dev` 看不出来。

1. **资产字节不可漂移。** `scripts/assets/**` 在 `.gitattributes` 里标记为 `-text`，禁止文本转换。改动这些文件必须同步更新清单里的 `bytes` 与 `sha256`、**更换 `cacheKey`**，并重新上传到 R2。边缘缓存按 URL 缓存一年（`immutable`），不换版本键会让用户继续拿到旧对象。
2. **`_routes.json` 的 include 只能是 `["/cdn/*"]`。** 扩大范围会让静态资源请求也进 Functions，首屏变慢。
3. **跨源隔离不能破坏。** 页面响应必须带 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`。
4. **只用一个域名。** 不要引入第二个可访问的 origin。Service Worker 缓存与 localStorage 按 origin 隔离，双域名会让用户换域名就从零开始下载 143 MB。
5. **R2 binding 名固定为 `LEAN_ASSETS`。** `ASSETS` 是 Pages 内部静态资源服务的保留名，用了会报 `does not implement the method "get"`。
6. **换行符统一 LF。** 仓库根 `.gitattributes` 已强制，不要用会写入 CRLF 的工具改文件。
7. **课程内容只能落在 Init 范围内。** 运行时不含 Std / Lean / Lake / Mathlib，引用它们会编译失败。

## 架构边界

| 路径 | 职责 | 不该做的事 |
| --- | --- | --- |
| `src/main.ts` | 应用外壳：路由、语言、主题装配 | 不要塞业务逻辑，逻辑放 `views/` 或独立模块 |
| `src/views/` | 纯字符串渲染 + 事件绑定 | 不要在渲染函数里发请求或读全局状态 |
| `src/components/lean-panel.ts` | Monaco 与 LSP 的装配层 | 不要把可测的纯逻辑写进来，它被排除在覆盖率之外 |
| `src/sw.ts` | 资产分片下载与缓存 | 不要在这里写业务逻辑，它只服务资产分发 |
| `src/asset-sources.mjs` | 资产源解析（Node / SW / Functions 共用） | 不要在任何一侧复制这套逻辑 |
| `functions/cdn/` | 同源 R2 网关 | 不要放宽白名单，不要移除 Range 处理 |
| `scripts/` | 资产运维与门禁脚本 | 不要在脚本里硬编码域名，用 `LEAN_ASSET_ORIGIN` |

**单一事实来源**：资产清单只有 `config/lean4-runtime.json`；资产源解析只有 `src/asset-sources.mjs`；Range 语义只有 `src/cdn-range.ts`。改动时先改这三处，其余模块被动跟随。

## 改动流程

1. **改前**：确认要动的是哪一层；如果涉及清单、路由、响应头，先读一遍上表的「为什么危险」。
2. **改后**：跑完整门禁，不能只跑 `npm test`。
3. **提交**：一个提交只做一件事；提交信息写清楚「为什么」，不是「改了什么」。
4. **推送**：`main` 受分支保护，四个 check 全绿才允许 PR 合并；直接 push 可行。上线由 CI 的 `deploy` job 负责（`CD_ENABLED=true` 时生效），不要绕过它去手动传文件。

## 质量门禁

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm run typecheck      # 三份 tsconfig：应用 / SW / Functions
npm test               # Vitest + 覆盖率阈值
npm run verify:manifest # 资产清单结构 + local 资产字节与哈希
npm run build:web      # 生产构建（跳过 143MB 资产）
npm run verify:build   # 产物契约
npm run smoke          # 线上冒烟（发版后跑）
```

覆盖率阈值：全局 78% 语句 / 80% 行；`functions/**` 要求 95%。**降低阈值需要单独说明理由**，不能顺手改。

新增代码时按这个标准补测试：

- 纯函数、解析器、状态机 → 必须有单测
- 视图渲染 → 断言结构（选择器、关键文本），不要断言整段 HTML
- 触及 `/cdn` 网关或 Range 语义 → 必须有单测，这是线上关键路径
- 只有 Monaco 装配、纯副作用 import、纯类型声明可以不加，并且要在 `vitest.config.ts` 的 exclude 里写明原因

## 代码约定

- TypeScript `strict` + `noUncheckedIndexedAccess`，不要用 `any`，不要用 `@ts-ignore`
- 注释写「为什么」，不写「做了什么」；中文注释，与现有代码一致
- 用户可见文案一律走 `src/i18n/`，中英文同时补齐，`locale-parity` 测试会检查键集合一致
- 样式用 Tailwind 原子类，共享片段放 `src/components/ui.ts`，不要复制同一套按钮类名
- 新依赖要克制：这个项目的价值之一是不引入后端与重型框架

## 提交信息

`type(scope): 一句话结论`，正文写动机与取舍。

```
feat(goal): 区分声明目标与光标处状态
fix(cdn): Range 越界返回 416 而不是 200
chore(ci): 依赖审计只审生产依赖
```

允许的 type：`feat` `fix` `refactor` `test` `docs` `chore` `ci` `perf`。

## 已知陷阱

这些坑都实际踩过，别重复排查：

- **`npm audit` 在本机跑不了**：华为云镜像不支持 audit 的 POST，返回 405。要加 `--registry=https://registry.npmjs.org`。
- **`npm ci` 可能被环境的批量删除保护拦下**：改用 `npm install` 补齐缺失项（曾删掉 `@esbuild/win32-x64` 导致 vitest 启动失败）。
- **Pages 覆盖静态资源的 `Cache-Control`**：`_headers` 里给 `/sw.js` 写的 `no-cache` 不生效（实测 `max-age=14400`）。
- **走代理时 curl 会先写 `200 Connection Established`**：解析状态码必须取最后一个真实 HTTP 行，否则一切都被读成 200。
- **`wrangler.toml` 顶层 binding 不落到 production/preview**：Git 集成部署读的是 `[[env.*.r2_buckets]]`，两处都要写。
- **rollup 解析不了 `lean-panel.ts` 的类型语法**：v8 覆盖率在补算未覆盖文件时会报 `PARSE_ERROR`，故显式排除。

## 文档维护

改了以下任一项，必须同步更新文档，否则下一个 Agent 会按旧信息行动：

- 资产分发链路或清单字段 → `README.md` 的「运行时分发」
- 门禁命令或阈值 → `README.md` 的「质量门禁」与本文件的命令表
- 部署方式或域名 → `README.md` 顶部与「部署与冒烟」
- 新增硬约束 → 本文件的「硬约束」
