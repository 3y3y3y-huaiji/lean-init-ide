# 部署与运维

分发链路的设计见 [ARCHITECTURE](ARCHITECTURE.md)；本地命令与门禁见 [DEVELOPMENT](DEVELOPMENT.md)。

## 部署与冒烟

部署由 GitHub Actions 负责，**CI 全绿才会上线**：

```
static / test / build / audit  →  deploy  →  smoke
```

`deploy` job 只在 `main` 分支、且仓库变量 `CD_ENABLED=true` 时执行，其余情况自动跳过。
它跑完整 `pnpm run build`（含 102 MB 同源兜底副本，`build:web` 会省掉这一层），
用 `wrangler pages deploy` 推送，成功后立刻对新版本跑冒烟；失败重试 5 次（间隔 10 秒），
仍失败则整条流水线标红。运行时资产由维护者用 `pnpm run upload:assets` 手动上传，
CI 不负责 R2 写入；换 `cacheKey` 后先传资产、再部署页面。

### 首次启用

1. Cloudflare → My Profile → API Tokens → Create Token，权限选
   `Account → Cloudflare Pages → Edit` 与 `Account → Account Settings → Read`。
   如果希望 CI 也负责上传运行时资产，再加 `Account → Workers R2 Storage → Edit`。
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

检查首页 `#app` 与标题、COOP/COEP、`sw.js` 可访问、`/cdn/<key>` 的 Range 206 与
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

## 访问控制与成本保护

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

## 安全响应头

`public/_headers` 在 `/*` 上统一设置：

- `Content-Security-Policy`：默认只允许同源；脚本额外放行 Cloudflare Web Analytics 的
  `static.cloudflareinsights.com`，并保留 `'wasm-unsafe-eval'`（WebAssembly 编译需要）。
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`：关闭摄像头、麦克风、定位、支付与 USB。

改 CSP 时注意四点：去掉 `'wasm-unsafe-eval'` 会让 Lean 直接起不来；去掉 `blob:` 会让 Worker
里的动态模块导入失败；去掉 `static.cloudflareinsights.com` 会让 Web Analytics 静默失效；
`connect-src` 的 `data:` 是 `public/vendor/zstddec.mjs` 加载内嵌 wasm 所需，去掉后 zstd 资产会在启动时失败。
本地 e2e 由 `scripts/local-gateway.mjs` 读取同一份 `_headers`，所以 CSP 写错会在 CI 的浏览器测试里暴露，
不需要等到部署后才发现。

`public/robots.txt` 与 `public/sitemap.xml` 是静态文件；新增课程或路由时要同步 sitemap。

## 部署前一次性配置

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
`functions/cdn/[[path]].ts` 是网关实现，`public/_routes.json` 把 Functions 限制在 `/cdn/*` 与 `/api/telemetry`。
若改用 Dashboard 配置绑定，名称必须同样是 `LEAN_ASSETS`。

## 资产维护

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

清单里 `encoding: "zstd"` 的资产保留上游 `.gz.bin` 键名，但交付字节是 zstd；`fetch:assets` 会从
GitHub raw 下载上游 gzip、校验 `upstreamBytes`/`upstreamSha256`、解压后用 level 19 重新压缩，
再按 `bytes`/`sha256` 校验交付字节。构建机需要 **Node 24+**（内置 `zlib.zstdCompressSync`）。
R2 与魔搭镜像上传的是 zstd 字节；GitHub raw 仍是 gzip，因此这类资产不参与 GitHub 回退，
最后一级回退是同源静态副本。

修改清单里的资产字节数/SHA-256 或 `cacheKey` 后，必须重新生成 LSP 补丁，把交付哈希同步进包内 profile：

```bash
pnpm run patch:lsp
pnpm install --no-frozen-lockfile
```

否则浏览器拿到的 profile 与 `/cdn/` 上的对象会不一致，启动阶段会报 receipt mismatch。

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
提供页面浏览与 Core Web Vitals，和自建指标分工不同、不能互相替代。实测页面里出现过两个不同 token 的
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
按 origin 隔离，换域名等于让用户重下 102MB。

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
