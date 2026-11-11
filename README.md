# Lean Init IDE

浏览器里的 Lean 4 学习环境：Monaco 编辑器 + 真正运行在 Web Worker 中的 Lean 语言服务器。打开网页即可写代码、看诊断、看 Goal，不需要安装 Lean 工具链，也没有后端。

在线使用：<https://lean-init-ide.pages.dev>

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
npm run preview
npm run typecheck
npm run lint
```

## 运行时分发（同源 R2 网关）

约 143MB 的 Lean 4.34.1 Init 资产放在 R2 桶 `lean4-ide-releases`。
浏览器**只请求站点自己的域名**：Pages Functions 的 `/cdn/<key>` 通过 R2 binding
在 Cloudflare 内网读取对象，不需要公网 R2 自定义域、不需要证书/DNS、不需要跨源 CORS。

- **主源**：同源 `/cdn/` 网关，支持 Range；Service Worker 按 4MB 分片并行下载后组装成同源响应。
- **回退**：网关不可用 → 固定 revision 的 GitHub raw → 同源 `dist/wasm-lean4/` 全量请求。
- **版本键**：每个 URL 带 `?r=<cacheKey>`（`config/lean4-runtime.json`）。
- **完整性**：清单固定每个资产的字节数与 SHA-256；构建期下载、SW 组装、上传前后分别校验。
- **优选 IP**：配在站点自定义域（如 `operator.ccwu.cc`）上，页面与资产共用同一条连接；`*.pages.dev` 默认域不能改 DNS。

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

- `LEAN_ASSET_ORIGIN`（默认 `https://lean-init-ide.pages.dev`）给构建/上传脚本提供探测用的站点域名；`LEAN_ASSET_BASE_URL` 可完全覆盖主源。
- `--local` 写入本地 miniflare 桶用于离线调试，`--bucket` 指定其它桶。
- `npm run r2:cors` 与 `config/r2-cors.json` **仅在仍使用公网 R2 自定义域时才需要**；同源方案下 R2 binding 不走 HTTP，可忽略或删除。

资产清单与分发源由 `config/lean4-runtime.json` + `src/asset-sources.mjs` 统一定义，
`functions/`、`scripts/fetch-assets.mjs`、`src/sw.ts` 和 `scripts/upload-assets.mjs` 共用，避免字节数或键名漂移。

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
  r2-cors.json       仅公网自定义域方案需要的 CORS 规则
scripts/             资产下载/上传、LSP 补丁
wrangler.toml        Pages 项目配置与 R2 binding
```

仓库里只有 TypeScript 源码：`src/sw.ts` 由 `npm run build:sw` 编译成 `public/sw.js`，不手写 JS。

## 许可证

本项目采用 **双协议**，你可以任选其一：

- [Apache License 2.0](LICENSE-APACHE)
- [木兰宽松许可证，第 2 版](LICENSE-MULAN)（Mulan Permissive Software License v2）

SPDX 标识：`(Apache-2.0 OR MulanPSL-2.0)`。
