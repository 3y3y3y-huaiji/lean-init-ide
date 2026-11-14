# 架构与运行时分发

这份文档讲「它是怎么跑起来的」：三层边界、主要数据流，以及 102MB 运行时如何到达浏览器。

项目定位与使用方式见 [README](../README.md)；本地开发与门禁见 [DEVELOPMENT](DEVELOPMENT.md)；
部署、指标与排查见 [OPERATIONS](OPERATIONS.md)。

## 三层架构

三层各自只通过明确的接口通信：

```
应用层   src/main.ts → views/ → components/lean-panel.ts
         路由、i18n、主题；渲染函数只产出字符串，事件在 bind* 里绑定
          ↓
语言层   Monaco 编辑器 + @wasm-idle/lsp（Web Worker 内的 Lean 4.34.1）
         LSP over postMessage：诊断、悬停、补全、跳转定义、$/lean/plainGoal
          ↓
资产层   Service Worker → /cdn/<key> → Pages Functions → R2
         4MB 分片并行下载 → SHA-256 校验 → zstd 解码 → 回退镜像/同源静态副本
```

三条主要数据流：

1. **编辑**：用户输入 → Monaco model → `didChange`（350ms 防抖）→ LSP → `publishDiagnostics` → 编辑器标记与面板
2. **光标**：`onDidChangeCursorPosition` → `$/lean/plainGoal`（250ms 防抖）→ 目标面板
3. **启动**：注册 Service Worker → 分片下载 11 个资产 → 逐个校验 → zstd 解码 → 初始化 LSP → `didOpen`

## 运行时分发（同源 R2 网关）

约 102MB 的 Lean 4.34.1 Init 资产放在 R2 桶 `lean4-ide-releases`。
浏览器**只请求站点自己的域名**：Pages Functions 的 `/cdn/<key>` 通过 R2 binding
在 Cloudflare 内网读取对象，不需要公网 R2 自定义域、不需要证书/DNS、不需要跨源 CORS。

- **主源**：同源 `/cdn/` 网关，支持 Range；Service Worker 按 4MB 分片并行下载后组装成同源响应。
- **回退**：网关不可用 → 魔搭镜像（配置且可用时）→ 同源 `dist/wasm-lean4/` 全量请求；
  身份编码的小文件仍可回退到固定 revision 的 GitHub raw，zstd 资产不会（上游只有 gzip 字节）。
- **版本键**：每个 URL 带 `?r=<cacheKey>`（`config/lean4-runtime.json`）。
- **完整性**：清单固定每个资产的字节数与 SHA-256；构建期下载、SW 组装、上传前后分别校验。
- **单一入口**：`criticalthinking.de5.net` 是 Pages 自定义域，页面与 `/cdn/` 资产共用同一条连接；`*.pages.dev` 仅作回退。

Init 与 wasm 以 zstd（level 19）重新压缩，运行时从 136.45 MiB 降到约 102 MiB；
worker 启动时用 `public/vendor/zstddec.mjs` 的同源 wasm 解码，解压后的字节与上游 gzip 完全一致。
一次完整加载约产生 26 个分片请求（约 102 MiB ÷ 4 MiB）。没有缓存时全部回源，命中缓存后重复访问的成本接近零。

访问控制、限流与资产维护的操作方式见 [OPERATIONS](OPERATIONS.md)。

## 递归深度上限

Lean 默认 `maxRecDepth = 512`，对只有 Init 的运行时来说偏低：数列题里 `simp`
递归展开 `f n` 很容易触顶。`scripts/patch-lsp.mjs` 给文件进程显式传入
`-DmaxRecDepth=544`，比默认多约 6%。

这个值不是拍脑袋定的，也不能继续往上加。在 headless Chromium + 本地网关里用
`f 0 = 0 | f (n+1) = f n + 1` + `simp [f]` 逐档实测（每档重新加载页面隔离崩溃）：

| `maxRecDepth` | 结果 |
| --- | --- |
| 512 | `n = 165` 通过，`n = 170` 返回 `maximum recursion depth` 诊断 |
| 544 | `n = 175` 通过，`n = 178` 返回同样的诊断 |
| 558 | 仍返回诊断，不崩溃 |
| 560 | pthread 抛 `RangeError: Maximum call stack size exceeded`，进程崩溃 |

瓶颈是 V8 对 worker 线程的 wasm 栈保护，不是 Emscripten 声明的 8MiB 栈：
把 pthread 栈调到 16MiB、主线程 32MiB，或加 Chromium `--js-flags=--stack-size`
都无法把 560 这一档救回来。所以 544 是「留出约 3% 余量、又确实比默认多」的折中；
再高会把可恢复的诊断变成崩溃（栈溢出时 `decideCrashRecovery` 只允许手动重启）。

用户代码里的 `set_option maxRecDepth <num>` 仍可覆盖这个默认值；超过 558 会崩溃。
要突破这个上限只能改架构（例如换用栈更大的 JS 引擎/线程模型），改参数无效。

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
  wasm-lean4/        同源静态兜底副本（构建时下载/重压，不入库）
  vendor/zstddec.mjs 同源 zstd wasm 解码器（worker 动态加载）
  _routes.json       仅 /cdn/* 与 /api/telemetry 走 Functions
config/
  lean4-runtime.json 资产清单、字节数/SHA-256、主源与回退源、缓存键
scripts/             资产下载/上传、LSP 补丁、清单与产物校验、线上冒烟
wrangler.toml        Pages 项目配置与 R2 binding
```

仓库不保留生成的 JS 产物：`src/sw.ts` 由 `pnpm run build:sw` 编译成 `public/sw.js`（不入库）；
`config/lean4-runtime.json` 是唯一资产清单。
