# Lean Init IDE

浏览器里的 Lean 4 学习环境：Monaco 编辑器 + 真正运行在 Web Worker 中的 Lean 语言服务器。打开网页即可写证明、看诊断、看 Goal，不需要安装 Lean 工具链，也没有后端。

在线使用：<https://criticalthinking.de5.net>（备用：<https://lean-init-ide.pages.dev>）

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

- 首次会下载约 143MB 运行时，之后走浏览器持久缓存（二次进入通常 4–7 秒可用）。
- 需要 cross-origin isolation 与 SharedArrayBuffer，Chromium 系浏览器体验最佳。
- 低内存设备（`navigator.deviceMemory ≤ 4`）不会自动下载，需要手动点「启动 Lean」。
- 只想读课程时不必启动引擎：课程正文直接可看，编辑器页默认也不自动下载。

## 功能

- 真实 Lean 4.34.1 Init 运行时，在浏览器内完成解析、精化与诊断
- 诊断、Goal（`$/lean/plainGoal`）、悬停、补全、跳转定义
- 中英文界面，`/zh/`、`/en/` 双前缀，可切换并记住偏好
- 亮色 / 暗色 / 跟随系统三种主题，Monaco 主题同步
- 8 节入门课程，代码块可一键运行，练习可带着 starter 跳到编辑器
- 运行时按 4MB 分片并行下载、逐块校验，失败自动回退到其它源
- 低内存设备自动关闭自动下载，并把持久缓存上限从 512MB 降到 128MB

## 课程

每节 3 个可运行代码块加一个练习，全部落在 Init 范围内。

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

## 限制

- 只带 **Init**，没有 Std / Lean / Lake / Mathlib，课程内容限定在基础类型、List 与命题逻辑
- 需要 cross-origin isolation（COOP/COEP）与 SharedArrayBuffer，Chromium 系浏览器体验最佳
- 已知问题：connectives 课程的第 2、3 个代码块连续运行时可能报 `already declared`（语言服务器复用了同一文档 URI），内容与结论不受影响，修复排在补丁版本

## 隐私

站内提供[隐私说明](https://criticalthinking.de5.net/zh/privacy)：运行指标不含 cookie、用户代码或设备指纹，
可在浏览器开启 Do Not Track 退出；页面浏览与 Core Web Vitals 由 Cloudflare Web Analytics 统计。

## 技术一览

- **语言层**：Monaco + `@wasm-idle/lsp`，Lean 4.34.1 跑在 Web Worker 里，LSP 走 postMessage
- **资产层**：Service Worker 经站点同源 `/cdn/` 网关从 R2 按 4MB 分片下载，失败回退 GitHub raw 与静态副本
- **应用层**：静态站点，路由 / i18n / 主题都在前端；Pages Functions 只提供资产网关与指标接收端

实现细节见 [架构与运行时分发](docs/ARCHITECTURE.md)。

## 本地开发

```bash
pnpm install         # 安装依赖并应用 patches/ 里的 @wasm-idle/lsp 补丁
pnpm run dev         # 开发服务器（首次会下载并校验运行时资产）
pnpm run build:web   # 只构建前端，跳过 143MB 资产
pnpm test            # Vitest + 覆盖率阈值
pnpm run smoke       # 线上冒烟，发版后跑
```

提交前要跑完整门禁，命令与覆盖率阈值见 [本地开发](docs/DEVELOPMENT.md#质量门禁)。

## 贡献

- 改代码前先读 [AGENTS.md](AGENTS.md)：硬约束、模块边界与已知陷阱都在那里
- 一个提交只做一件事；课程内容只能落在 Init 范围内
- 用户可见文案必须中英文同时补齐，`locale-parity` 测试会校验键集合

## 文档

- [架构与运行时分发](docs/ARCHITECTURE.md)
- [本地开发与质量门禁](docs/DEVELOPMENT.md)
- [部署、指标与排查](docs/OPERATIONS.md)

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
