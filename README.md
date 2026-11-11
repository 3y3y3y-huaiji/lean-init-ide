# Lean Init IDE

浏览器里的 Lean 4 学习环境：Monaco 编辑器 + 真正运行在 Web Worker 中的 Lean 语言服务器。打开网页即可写代码、看诊断、看 Goal，不需要安装 Lean 工具链，也没有后端。

在线使用：<https://criticalthinking.de5.net>（备用：<https://lean-init-ide.pages.dev>）

参与开发前先读 [AGENTS.md](AGENTS.md)：那里列了不可违反的硬约束、模块边界和已知陷阱。

## 功能

- 真实 Lean 4.34.1 Init 运行时，在浏览器内完成解析、精化与诊断
- 诊断、Goal（`$/lean/plainGoal`）、悬停、补全、跳转定义
- 中英文界面，`/zh/`、`/en/` 双前缀，可切换并记住偏好
- 亮色 / 暗色 / 跟随系统三种主题，Monaco 主题同步
- 入门课程：从 `#check` 到第一个归纳证明，代码可一键载入编辑器
- 首次加载约 143MB 运行时，之后持久缓存；Service Worker 经站点同源 `/cdn/` 网关（Pages Functions → R2）按 4MB 分片并行下载，失败回退 GitHub raw，最后回退同源静态副本

## 限制

- 只带 **Init**，不含 Std / Lean / Lake / Mathlib，课程内容需限定在 Init 的范围内
- 需要 cross-origin isolation（COOP/COEP）与 SharedArrayBuffer，Chromium 系浏览器体验最佳

## 本地开发

```bash
npm install          # 安装依赖并给 @wasm-idle/lsp 打补丁
npm run dev          # 开发服务器（首次会下载并校验运行时资产）
npm run build        # 生产构建（含资产下载）
npm run build:web    # 只构建前端，跳过 143MB 资产（CI 使用）
npm run preview      # 预览构建产物
npm run smoke        # 线上冒烟，发版后跑
```

改动后必须跑完整门禁，命令见「质量门禁」一节，不要只跑 `npm test`。

顺带两个本地环境的坑：`npm audit` 要加 `--registry=https://registry.npmjs.org`（镜像站不支持 audit 的 POST）；
`npm ci` 若被系统的批量删除保护拦下，改用 `npm install` 补齐缺失项。

## 架构

三层，各自只通过明确的接口通信：

```
应用层   src/main.ts → views/ → components/lean-panel.ts
         路由、i18n、主题；渲染函数只产出字符串，事件在 bind* 里绑定
          ↓
语言层   Monaco 编辑器 + @wasm-idle/lsp（Web Worker 内的 Lean 4.34.1）
         LSP over postMessage：诊断、悬停、补全、跳转定义、$/lean/plainGoal
          ↓
资产层   Service Worker → /cdn/<key> → Pages Functions → R2
         4MB 分片并行下载 → SHA-256 校验 → 回退 GitHub raw → 回退同源静态副本
```

三条主要数据流：

1. **编辑**：用户输入 → Monaco model → `didChange`（350ms 防抖）→ LSP → `publishDiagnostics` → 编辑器标记与面板
2. **光标**：`onDidChangeCursorPosition` → `$/lean/plainGoal`（250ms 防抖）→ 目标面板
3. **启动**：注册 Service Worker → 分片下载 11 个资产 → 逐个校验 → 初始化 LSP → `didOpen`

## 运行时分发（同源 R2 网关）

约 143MB 的 Lean 4.34.1 Init 资产放在 R2 桶 `lean4-ide-releases`。
浏览器**只请求站点自己的域名**：Pages Functions 的 `/cdn/<key>` 通过 R2 binding
在 Cloudflare 内网读取对象，不需要公网 R2 自定义域、不需要证书/DNS、不需要跨源 CORS。

- **主源**：同源 `/cdn/` 网关，支持 Range；Service Worker 按 4MB 分片并行下载后组装成同源响应。
- **回退**：网关不可用 → 固定 revision 的 GitHub raw → 同源 `dist/wasm-lean4/` 全量请求。
- **版本键**：每个 URL 带 `?r=<cacheKey>`（`config/lean4-runtime.json`）。
- **完整性**：清单固定每个资产的字节数与 SHA-256；构建期下载、SW 组装、上传前后分别校验。
- **单一入口**：`criticalthinking.de5.net` 是 Pages 自定义域，页面与 `/cdn/` 资产共用同一条连接；`*.pages.dev` 仅作回退。

### 访问控制与成本保护

桶本身不对外：`r2.dev` 公有访问已关闭，也没有绑定公网自定义域，对象只能通过 Pages Functions 的
`LEAN_ASSETS` binding 在 Cloudflare 内网读取。

网关这一层做了四件事：

- **白名单**：只有 `config/lean4-runtime.json` 里登记的 key 能被读取，未知路径直接 404，不触碰 R2。
- **边缘缓存**：用 Cache API 按「URL + Range」缓存响应。同一数据中心的后续请求命中后不再执行读桶逻辑，
  命中情况写在 `X-Cdn-Cache` 响应头里（`HIT` / `MISS`），排查时不用靠猜。
  实测 CF 自身也会缓存 `.gz` 这类扩展名的 Range 响应（`cf-cache-status: HIT`，且任意 Range 都能正确切片）；
  Cache API 补的是 CF 不缓存的类型——例如 `producer-receipt.json` 一直是 `DYNAMIC`。
- **只读**：网关只调用 `get`，没有任何写入或删除路径。
- **失败隔离**：写缓存失败不影响响应；R2 读取失败返回 404 而不是 500。

一次完整加载约产生 36 个分片请求（143 MiB ÷ 4 MiB）。没有缓存时全部回源，命中缓存后重复访问的成本接近零。

**建议在 Cloudflare 面板补一条限流规则**（API token 只有 `zone:read`，脚本改不了）：

| 项 | 值 |
| --- | --- |
| 匹配表达式 | `starts_with(http.request.uri.path, "/cdn/")` |
| 速率 | 每 IP 每分钟 300 次 |
| 动作 | 限流，返回 429 |

单次加载 36 个分片，300 次/分钟留了约 8 倍余量，正常用户不会触发，但能挡住脚本刷取。

**R2 凭据保持最小权限**：运行时只依赖 binding，不需要任何 S3 兼容密钥；上传脚本用的 token
只给这个桶的读写，不要使用账号级 Global API Key。

### 部署前一次性配置

`wrangler.toml` 已声明绑定。顶层用于本地开发，**production 与 preview 必须各自显式声明**，
否则 Git 集成部署不会把绑定写进项目配置：

```toml
[[r2_buckets]]
binding = "LEAN_ASSETS"
bucket_name = "lean4-ide-releases"

[[env.preview.r2_buckets]]
binding = "LEAN_ASSETS"
bucket_name = "lean4-ide-releases"

[[env.production.r2_buckets]]
binding = "LEAN_ASSETS"
bucket_name = "lean4-ide-releases"
```

注意 `ASSETS` 是 Pages 内部静态资源服务的保留绑定名，不能用。
`functions/cdn/[[path]].ts` 是网关实现，`public/_routes.json` 把 Functions 限制在 `/cdn/*`。
若改用 Dashboard 配置绑定，名称必须同样是 `LEAN_ASSETS`。

### 资产维护

```bash
npx wrangler login
npm run fetch:assets                # 下载并校验到 public/wasm-lean4/
npm run upload:assets -- --dry-run  # 预览将上传的对象
npm run upload:assets               # 上传缺失/变更的对象，经同源网关复核 ETag 与长度
npm run upload:assets -- --verify-only
```

- `LEAN_ASSET_ORIGIN`（默认 `https://criticalthinking.de5.net`）给构建/上传脚本提供探测用的站点域名；`LEAN_ASSET_BASE_URL` 可完全覆盖主源。
- `--local` 写入本地 miniflare 桶用于离线调试，`--bucket` 指定其它桶。

资产清单与分发源由 `config/lean4-runtime.json` + `src/asset-sources.mjs` 统一定义，
`functions/`、`scripts/fetch-assets.mjs`、`src/sw.ts` 和 `scripts/upload-assets.mjs` 共用，避免字节数或键名漂移。

## 质量门禁

本地和 CI 跑同一套命令，任一失败即阻断合并：

| 命令 | 检查内容 |
| --- | --- |
| `npm run format:check` | Prettier 格式一致性 |
| `npm run lint` | ESLint（应用、脚本、配置文件） |
| `npm run typecheck` | 三份 tsconfig：应用、Service Worker、Pages Functions |
| `npm test` | Vitest + 覆盖率阈值 |
| `npm run verify:manifest` | 资产清单结构：key 唯一、sha256 格式、同源 baseUrl、bytes 为正 |
| `npm run build:web` | 生产构建（跳过 143 MB 资产下载） |
| `npm run verify:build` | 产物契约：`#app` 挂载点、`sw.js`、`_routes.json` 白名单、COOP/COEP、JS 体积预算 |

覆盖率阈值写在 `vitest.config.ts`：全局 78% 语句 / 80% 行，`functions/**` 单独要求 95%。
后者是资产分发网关，任何降级都会让 wasm 加载链路断掉，所以按关键路径对待。

`.github/workflows/ci.yml` 拆成四个并行 job：静态检查、单元测试、构建产物、依赖审计（只审生产依赖）。
建议在 GitHub 分支保护里要求这四个 check 全绿才允许合入 `main`。

## 部署与冒烟

Pages 走 Git 集成，push 到 `main` 即部署，没有独立的 CD 流水线。发布后的验证靠冒烟脚本：

```bash
npm run smoke                                   # 默认打 https://criticalthinking.de5.net
npm run smoke -- --origin=https://lean-init-ide.pages.dev
```

冒烟检查五项：首页 `#app` 与标题、COOP/COEP、`sw.js` 可访问、`/cdn/<key>` 的 Range 206 与
`Content-Range`/`ETag`、白名单外路径 404。脚本只用 Node 内置模块和系统 `curl`，不需要
`node_modules`，所以能直接在任意环境（含需要代理的网络）跑。

`.github/workflows/smoke.yml` 支持手动触发和每日 01:00 UTC 巡检，用于捕捉证书、路由、
Functions 的静默回归。它**不挂在 push 之后**——Pages 构建完成时间不确定，过早探测会打到旧版本。

已知平台行为：Cloudflare Pages 会用自己的边缘 TTL 覆盖静态资源的 `Cache-Control`，
`public/_headers` 里给 `/sw.js` 写的 `no-cache` 未必生效（实测 `max-age=14400`）。
浏览器对 Service Worker 脚本有独立缓存策略，影响有限，但更新延迟属于可预期范围。

## 目录结构

```
src/
  main.ts            应用外壳：路由、语言与主题切换
  sw.ts              Range 分片下载 Service Worker（编译为 public/sw.js）
  cdn-range.ts       Range 头解析（与 Pages Functions 共用）
  asset-sources.mjs  资产源解析（Node / SW / Functions 共用）
  i18n/              中英文字典与文案读取
  theme.ts           亮/暗/跟随系统
  views/             落地页、课程页、编辑器页
  components/        可复用的 Lean 编辑器面板
  lean-language.ts   Lean 语法高亮与语言配置
functions/
  cdn/[[path]].ts    同源 R2 网关（Range / 206 / 白名单）
public/
  wasm-lean4/        同源静态兜底副本（构建时下载，不入库）
  _routes.json       仅 /cdn/* 走 Functions
config/
  lean4-runtime.json 资产清单、字节数/SHA-256、主源与回退源、缓存键
scripts/             资产下载/上传、LSP 补丁、清单与产物校验、线上冒烟
wrangler.toml        Pages 项目配置与 R2 binding
```

仓库不保留生成的 JS 产物：`src/sw.ts` 由 `npm run build:sw` 编译成 `public/sw.js`（不入库）；`config/lean4-runtime.json` 是唯一资产清单。

## 排查

| 现象 | 先查什么 |
| --- | --- |
| 页面白屏、没有 `#app` 内容 | `npm run verify:build`；确认 `dist/index.html` 引用了入口脚本 |
| 进度条卡在 0% | 控制台看 `sw.js` 是否注册成功；`/cdn/<key>` 是否返回 206 |
| 日志里一直回退到 GitHub raw | `/cdn/` 网关异常：binding 是否叫 `LEAN_ASSETS`，production / preview 是否都声明了 |
| 诊断一直不出现 | `crossOriginIsolated` 是否为 true；COOP/COEP 是否被中间层剥掉 |
| 补全、悬停没反应 | 面板日志里 LSP 是否 ready，`initialize` 是否成功 |
| 本地资产校验失败 | 是否用会转换换行符的工具改过 `scripts/assets/**` |
| 线上 `/cdn/xxx` 返回 200 的 HTML | `_routes.json` 丢了，Functions 没触发，请求落到了 SPA fallback |

开发模式下 `window.__monaco` 与 `window.__editor` 可用；URL 加 `?fresh` 会清空资产缓存重新下载。

## 许可证

本项目采用 **双协议**，你可以任选其一：

- [Apache License 2.0](LICENSE-APACHE)
- [木兰宽松许可证，第 2 版](LICENSE-MULAN)（Mulan Permissive Software License v2）

SPDX 标识：`(Apache-2.0 OR MulanPSL-2.0)`。
