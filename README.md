# Lean Init IDE

浏览器里的 Lean 4 学习环境：Monaco 编辑器 + 真正运行在 Web Worker 中的 Lean 语言服务器。打开网页即可写代码、看诊断、看 Goal，不需要安装 Lean 工具链，也没有后端。

在线使用：<https://criticalthinking.de5.net>（备用：<https://lean-init-ide.pages.dev>）

参与开发前先读 [AGENTS.md](AGENTS.md)：那里列了不可违反的硬约束、模块边界和已知陷阱。

## 这是什么

一个**不用安装任何工具链**的 Lean 4 学习环境。Lean 4.34.1 的 Init 运行时被编译成 WebAssembly，
语言服务器跑在浏览器的 Web Worker 里：打开网页就能写证明、看诊断、看 Goal，代码不会上传，也没有后端。

适合三类使用场景：

- 想试试 Lean、但不想装 elan / Lake / Mathlib 的人
- 课堂上给学生演示「命题即类型」的环境
- 想研究「语言服务器能不能跑在浏览器里」的开发者

项目只内置 Init，不含 Std / Lean / Lake / Mathlib，所以课程限定在基础类型、List 与命题逻辑。

## 快速开始

直接打开 <https://criticalthinking.de5.net>，选一门课点「运行」即可，无需注册或安装。

- 首次会下载约 143MB 运行时：按 4MB 分片并行下载、逐块 SHA-256 校验，之后走浏览器持久缓存（二次进入通常 4–7 秒可用）。
- 需要 cross-origin isolation 与 SharedArrayBuffer，Chromium 系浏览器体验最佳。
- 低内存设备（`navigator.deviceMemory ≤ 4`）不会自动下载，需要手动点「启动 Lean」。
- 只想读课程时不必启动引擎：课程正文直接可看，编辑器页默认也不自动下载。

## 功能

- 真实 Lean 4.34.1 Init 运行时，在浏览器内完成解析、精化与诊断
- 诊断、Goal（`$/lean/plainGoal`）、悬停、补全、跳转定义
- 中英文界面，`/zh/`、`/en/` 双前缀，可切换并记住偏好
- 亮色 / 暗色 / 跟随系统三种主题，Monaco 主题同步
- 入门课程 8 节：从 `#check`、`rfl` 到 `rw` / `simp`、∀/∃、List 归纳与 structure，代码可一键载入编辑器
- 首次加载约 143MB 运行时，之后持久缓存；Service Worker 经站点同源 `/cdn/` 网关（Pages Functions → R2）按 4MB 分片并行下载，失败回退 GitHub raw，最后回退同源静态副本
- 低内存设备（`navigator.deviceMemory ≤ 4`）不自动下载，持久缓存上限从 512MB 降到 128MB，启动前由用户确认
- 隐私说明页：`/zh/privacy`、`/en/privacy`，页脚有入口；写明指标字段、采样、本地存储与退出方式

## 限制

- 只带 **Init**，不含 Std / Lean / Lake / Mathlib，课程内容需限定在 Init 的范围内
- 需要 cross-origin isolation（COOP/COEP）与 SharedArrayBuffer，Chromium 系浏览器体验最佳
- 已知问题：connectives 课程的第 2、3 个代码块连续运行时可能报 `already declared`（语言服务器复用了同一文档 URI），内容与结论不受影响，修复排在首个补丁版本

## 课程

8 节课都只用 Init，每节 3 个可运行代码块加一个练习；练习会带着 starter 跳到编辑器页。

| 课时 | 主题 | 关键动作 |
| --- | --- | --- |
| `first-proof` | 先让 Lean 说句话 | `#check`、`#eval`、`rfl` |
| `implication` | 命题即类型 | `intro`、`exact`、函数组合 |
| `connectives` | 与、或怎么拆 | `⟨hp, hq⟩`、`h.1` / `h.2`、`cases` |
| `induction` | 用 induction 证明交换律 | `induction ... with`、`simp only` |
| `rewrite` | 用 rw 改写目标 | `rw [Nat.add_comm]`、`rw [h]` |
| `simp` | 让 simp 收尾 | `simp`、`simp only [Nat.succ_add]` |
| `quantifiers` | ∀ 与 ∃ 怎么用 | 把 `∀` 当函数用、`⟨n, 证明⟩`、拆存在量词 |
| `list-structure` | 归纳类型与结构 | List 的 `nil` / `cons`、`structure`、`#eval` |

课程内容在 `src/i18n/zh.ts` 与 `src/i18n/en.ts`，中英文键集合由 `locale-parity` 测试强制一致。

## 本地开发

```bash
pnpm install         # 安装依赖并应用 patches/ 里的 @wasm-idle/lsp 补丁
pnpm run dev         # 开发服务器（首次会下载并校验运行时资产）
pnpm run build       # 生产构建（含资产下载）
pnpm run build:web   # 只构建前端，跳过 143MB 资产（CI 使用）
pnpm run preview     # 预览构建产物
pnpm run smoke       # 线上冒烟，发版后跑
```

依赖由 pnpm 12 管理：`pnpm-lock.yaml` 固定版本，`pnpm-workspace.yaml` 里放 overrides、
`allowBuilds` 和 `patchedDependencies`。不要再用 npm 生成 `package-lock.json`。

改动后必须跑完整门禁，命令见「质量门禁」一节，不要只跑 `pnpm test`。

本地环境的坑：`pnpm audit` 要加 `--registry=https://registry.npmjs.org`（镜像站不支持 audit 的 POST）；
pnpm 首次安装需要下载原生二进制，Windows 杀软可能误报，必要时把 pnpm 安装目录和项目 `node_modules` 加进排除项。

### 升级 @wasm-idle/lsp

运行时补丁在 `patches/`，安装时由 `patchedDependencies` 自动应用。升级后重新生成：

```bash
pnpm run patch:lsp          # 读取 package.json 里的版本
pnpm install --no-frozen-lockfile
pnpm exec vitest run src/lsp-patches.test.ts
```

`patch:lsp` 会从 npm registry 下载对应版本、校验 tarball 完整性、应用补丁并更新
`pnpm-workspace.yaml`，不依赖 `pnpm patch-commit`，避开它在 Windows 上的临时目录清理问题。

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

**Cloudflare 侧限流**（API token 只有 `zone:read`，脚本改不了；免费计划的规则额度有限，
优先扩展现有规则而不是新增）把一条率的匹配表达式写成两个路径的并集：

| 项 | 值 |
| --- | --- |
| 匹配表达式 | `starts_with(http.request.uri.path, "/cdn/") or eq(http.request.uri.path, "/api/telemetry")` |
| 速率 | 每 IP 每分钟 300 次 |
| 动作 | 限流，返回 429 |

单次加载 36 个分片，300 次/分钟留了约 8 倍余量，正常用户不会触发，但能挡住脚本刷取。
`/api/telemetry` 另外在 Function 内有单 IP 30 次/分钟的兜底，所以即使没有可用的 WAF 规则也不会被单个来源打满。

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
pnpm dlx wrangler login
pnpm run fetch:assets                # 下载并校验到 public/wasm-lean4/
pnpm run upload:assets -- --dry-run  # 预览将上传的对象
pnpm run upload:assets               # 上传缺失/变更的对象，经同源网关复核 ETag 与长度
pnpm run upload:assets -- --verify-only
```

- `LEAN_ASSET_ORIGIN`（默认 `https://criticalthinking.de5.net`）给构建/上传脚本提供探测用的站点域名；`LEAN_ASSET_BASE_URL` 可完全覆盖主源。
- `--local` 写入本地 miniflare 桶用于离线调试，`--bucket` 指定其它桶。

资产清单与分发源由 `config/lean4-runtime.json` + `src/asset-sources.mjs` 统一定义，
`functions/`、`scripts/fetch-assets.mjs`、`src/sw.ts` 和 `scripts/upload-assets.mjs` 共用，避免字节数或键名漂移。

## 运行指标与错误上报

前端只记录启动链路的阶段耗时与未捕获错误，不含 cookie、用户代码或设备指纹；
`navigator.doNotTrack === '1'` 时整页关闭，普通指标按 50% 采样，错误事件必发且每页最多 3 条。

- 事件名：`boot` / `sw` / `assets` / `lsp_ready` / `first_diagnostics` / `runtime_error`
- 字段：单事件最多 12 个，key 限 `[a-z][a-z0-9_]{0,23}`，字符串截断 120 字符
- 上报：`navigator.sendBeacon('/api/telemetry')`，不可用时回退 `fetch(..., { keepalive: true })`
- 接收端：`functions/api/telemetry.ts`，校验后返回 204；`public/_routes.json` 只放行 `/api/telemetry` 与 `/cdn/*` 两个精确路径
- 限流：接收端自带固定窗口兜底（单 IP 每分钟 30 次、单 isolate 每分钟 600 次，超限返回 429），
  不依赖 Cloudflare 的 WAF 规则额度；状态只在 isolate 内存里，跨节点不共享，属于尽力而为

字段清单、采样比例、本地存储与退出方式（Do Not Track / 拦截 `/api/telemetry`）同时写在站内
`/zh/privacy`、`/en/privacy`，改动采集范围时必须同步那一页。

没有声明 Analytics Engine binding，指标以一行 JSON 落 Workers Logs，用
`pnpm dlx wrangler pages deployment tail --project-name=lean-init-ide` 查看。
以后要接 Analytics Engine，在 `wrangler.toml` 的 production / preview 同时加
`[[env.*.analytics_engine_datasets]] binding = "TELEMETRY"`，接收端会自动改写成数据点，无需改代码。

站点同时启用了 Cloudflare Web Analytics（代理自动注入 `static.cloudflareinsights.com` 的 beacon），
提供页面浏览与 Core Web Vitals，和自建指标分工不同、不能互相替代。实测页面里出现了两个不同 token 的
beacon（Pages 项目注入 + zone 注入），建议在面板只保留一个，避免同一批访问被重复统计。
该脚本响应带 `Cross-Origin-Resource-Policy: cross-origin`，在 COEP 下可正常加载；
以后上 CSP 时需要放行 `script-src https://static.cloudflareinsights.com` 与
`connect-src https://cloudflareinsights.com`。

## 国内访问与源诊断

已知现象：AliDNS / DNSPod 的 DoH 解析一致，但分到的部分 Anycast IPv4（如 `104.21.91.203`、
`172.67.179.86`）在 TLS 握手阶段被 reset；其余 Cloudflare IP 与 `pages.dev` 正常。
这不是 DNS 解析错误，改解析服务商无效。

**方案 A（推荐，需域名管理员操作）**：把自定义域改成 DNS-only CNAME 到优选 IP 面板，关闭代理（灰云），
用第三方优选 IP 工具定期更新 A 记录。代价是失去 Cloudflare 的 WAF / 缓存，需要自己补限流与证书。

**方案 B**：国内反代或对象存储镜像。必须保持与主站同源，否则 Service Worker 缓存与 localStorage
按 origin 隔离，换域名等于让用户重下 143MB。

代码侧提供两个诊断工具，不改 DNS 也能判断问题在哪一段：

```bash
pnpm run probe:sources        # 对魔搭 / 同源网关 / GitHub raw 各取 64KiB，输出 TTFB 与速率
LEAN_ASSET_ORIGIN=https://lean-init-ide.pages.dev pnpm run probe:sources
```

浏览器里可用 `?source=mirror|cdn|github` 强制首选源（写在 CacheStorage 里，Service Worker 读取后生效），
面板日志会显示实际命中的源标签：

- `?source=mirror`：魔搭优先，适合验证国内镜像
- `?source=cdn`：同源 `/cdn/` 网关优先
- `?source=github`：GitHub raw 优先

参数非法或没有参数时恢复默认策略（按 `Accept-Language` 在魔搭与同源网关之间选首选源）。
选择会写进 CacheStorage 并在后续访问继续生效；用另一个值覆盖，或访问 `?source=reset` 之类的非法值即可清除。

## 质量门禁

本地和 CI 跑同一套命令，任一失败即阻断合并：

| 命令 | 检查内容 |
| --- | --- |
| `pnpm run format:check` | Prettier 格式一致性 |
| `pnpm run lint` | ESLint（应用、脚本、配置文件） |
| `pnpm run typecheck` | 三份 tsconfig：应用、Service Worker、Pages Functions |
| `pnpm test` | Vitest + 覆盖率阈值 |
| `pnpm run verify:manifest` | 资产清单结构：key 唯一、sha256 格式、同源 baseUrl、bytes 为正 |
| `pnpm run build:web` | 生产构建（跳过 143 MB 资产下载） |
| `pnpm run verify:build` | 产物契约：`#app` 挂载点、`sw.js`、`_routes.json` 白名单（`/cdn/*` + `/api/telemetry`）、COOP/COEP、JS 体积预算 |

覆盖率阈值写在 `vitest.config.ts`：全局 78% 语句 / 80% 行，`functions/**` 单独要求 95%。
后者是资产分发网关，任何降级都会让 wasm 加载链路断掉，所以按关键路径对待。

`.github/workflows/ci.yml` 拆成四个并行 job：静态检查、单元测试、构建产物、依赖审计（只审生产依赖）。
建议在 GitHub 分支保护里要求这四个 check 全绿才允许合入 `main`。

## 部署与冒烟

部署由 GitHub Actions 负责，**CI 全绿才会上线**：

```
static / test / build / audit  →  deploy  →  smoke
```

`deploy` job 只在 `main` 分支、且仓库变量 `CD_ENABLED=true` 时执行，其余情况自动跳过。
它跑完整 `pnpm run build`（含 143 MB 同源兜底副本，`build:web` 会省掉这一层），
用 `wrangler pages deploy` 推送，成功后立刻对新版本跑冒烟；失败重试 5 次（间隔 10 秒），
仍失败则整条流水线标红。

### 首次启用

1. Cloudflare → My Profile → API Tokens → Create Token，权限选
   `Account → Cloudflare Pages → Edit` 与 `Account → Account Settings → Read`
2. GitHub 仓库 → Settings → Secrets and variables → Actions：
   - Secret `CLOUDFLARE_API_TOKEN`：上一步生成的 token
   - Secret `CLOUDFLARE_ACCOUNT_ID`：`6f20d0c99e90d1b8ccecc383ad3e27ad`
   - Variable `CD_ENABLED`：`true`
3. 确认一次 GitHub 部署成功之后，到 Pages → `lean-init-ide` → Settings → Build & deployments
   **断开 Git 集成**，否则 Cloudflare 与 GitHub 会各部署一次，互相覆盖。

### 回滚

```bash
pnpm dlx wrangler pages deployment list --project-name=lean-init-ide
```

在 Dashboard 的 Deployments 里选中上一个正常版本执行 Rollback。回滚只影响静态产物与 Functions，
R2 里的资产不受影响——运行时取哪一版由清单里的 `cacheKey` 决定。

### 冒烟

```bash
pnpm run smoke                                   # 默认打主域
pnpm run smoke -- --origin=https://lean-init-ide.pages.dev
```

检查五项：首页 `#app` 与标题、COOP/COEP、`sw.js` 可访问、`/cdn/<key>` 的 Range 206 与
`Content-Range`/`ETag`、白名单外路径 404。

`.github/workflows/smoke.yml` 另外提供手动触发与每日 01:00 UTC 巡检。它和部署流水线里的冒烟
分工不同：部署后的那次回答「这次发布对不对」，每日巡检回答「站还在不在」，负责捕捉证书、
路由、Functions 的静默回归。

两条 CI 里的冒烟都打 `https://lean-init-ide.pages.dev`，而不是自定义域。原因是 GitHub Actions
的机房 IP 会被 zone 的机器人防护拦成 403——那是安全策略生效，不是站点故障，拿它当失败条件
会导致每次发布都误报。自定义域的可用性由浏览器侧确认；本地跑 `pnpm run smoke` 默认打主域，
家宽 IP 一般不会被拦。

已知平台行为：Cloudflare Pages 会用自己的边缘 TTL 覆盖静态资源的 `Cache-Control`，
`public/_headers` 里给 `/sw.js` 写的 `no-cache` 未必生效（实测 `max-age=14400`）。
浏览器对 Service Worker 脚本有独立缓存策略，影响有限，但更新延迟属于可预期范围。

## 版本与发布

- 首个公开版本 `v0.1.0`：8 节入门课、启动链路指标、低内存策略、隐私说明、国内源诊断。
- `main` 上每次推送都会由 CI 部署；正式版本额外打 annotated tag，便于回滚与对外引用。
- 回滚方式见上一节；运行时资产由清单里的 `cacheKey` 决定，回滚页面不会改动 R2 对象。

## 目录结构

```
src/
  main.ts            应用外壳：路由、语言与主题切换
  sw.ts              Range 分片下载 Service Worker（编译为 public/sw.js）
  cdn-range.ts       Range 头解析（与 Pages Functions 共用）
  asset-sources.mjs  资产源解析（Node / SW / Functions 共用）
  asset-source.ts    页面侧 ?source= 强制源开关
  telemetry.ts       启动链路指标与错误上报（sendBeacon）
  device.ts          设备分档：缓存预算与自动启动策略
  i18n/              中英文字典与文案读取
  theme.ts           亮/暗/跟随系统
  views/             落地页、课程页、编辑器页
  components/        可复用的 Lean 编辑器面板
  lean-language.ts   Lean 语法高亮与语言配置
functions/
  cdn/[[path]].ts    同源 R2 网关（Range / 206 / 白名单）
  api/telemetry.ts   运行指标接收端（校验后写日志 / Analytics Engine）
public/
  wasm-lean4/        同源静态兜底副本（构建时下载，不入库）
  _routes.json       仅 /cdn/* 与 /api/telemetry 走 Functions
config/
  lean4-runtime.json 资产清单、字节数/SHA-256、主源与回退源、缓存键
scripts/             资产下载/上传、LSP 补丁、清单与产物校验、线上冒烟
wrangler.toml        Pages 项目配置与 R2 binding
```

仓库不保留生成的 JS 产物：`src/sw.ts` 由 `pnpm run build:sw` 编译成 `public/sw.js`（不入库）；`config/lean4-runtime.json` 是唯一资产清单。

## 排查

| 现象 | 先查什么 |
| --- | --- |
| 页面白屏、没有 `#app` 内容 | `pnpm run verify:build`；确认 `dist/index.html` 引用了入口脚本 |
| 进度条卡在 0% | 控制台看 `sw.js` 是否注册成功；`/cdn/<key>` 是否返回 206 |
| 日志里一直回退到 GitHub raw | `/cdn/` 网关异常：binding 是否叫 `LEAN_ASSETS`，production / preview 是否都声明了 |
| 诊断一直不出现 | `crossOriginIsolated` 是否为 true；COOP/COEP 是否被中间层剥掉 |
| 补全、悬停没反应 | 面板日志里 LSP 是否 ready，`initialize` 是否成功 |
| 本地资产校验失败 | 是否用会转换换行符的工具改过 `scripts/assets/**` |
| 线上 `/cdn/xxx` 返回 200 的 HTML | `_routes.json` 丢了，Functions 没触发，请求落到了 SPA fallback |
| 国内部分网络打不开、换 IP 就好 | 跑 `pnpm run probe:sources`，再用 `?source=` 逐源验证；确认是 Anycast IP 被 reset 后按「国内访问与源诊断」处理 |

开发模式下 `window.__monaco` 与 `window.__editor` 可用；URL 加 `?fresh` 会清空资产缓存重新下载。

## 贡献

- 改代码前先读 [AGENTS.md](AGENTS.md) 的硬约束与模块边界；资产清单、源解析、Range 语义各有唯一入口。
- 提交前跑完整门禁（见「质量门禁」），一个提交只做一件事，提交信息写清楚「为什么」。
- 课程内容只能落在 Init 范围内；用户可见文案必须中英文同时补齐。

## English overview

Lean Init IDE is a browser-native Lean 4 learning environment. The Lean 4.34.1 Init runtime and
the real language server run in Web Workers, so you can write proofs and read diagnostics and
goals without installing a toolchain. It is a static site on Cloudflare Pages; the 143 MB runtime
streams from R2 through a same-origin gateway in 4 MB ranges with SHA-256 checks. Eight intro-level
lessons, no backend, and no code upload.

## 许可证

本项目采用 **双协议**，你可以任选其一：

- [Apache License 2.0](LICENSE-APACHE)
- [木兰宽松许可证，第 2 版](LICENSE-MULAN)（Mulan Permissive Software License v2）

SPDX 标识：`(Apache-2.0 OR MulanPSL-2.0)`。
