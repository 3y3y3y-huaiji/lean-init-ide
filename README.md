# Lean Init IDE

浏览器里的 Lean 4 学习环境：Monaco 编辑器 + 真正运行在 Web Worker 中的 Lean 语言服务器。打开网页即可写代码、看诊断、看 Goal，不需要安装 Lean 工具链，也没有后端。

在线使用：<https://lean-init-ide.pages.dev>

## 功能

- 真实 Lean 4.34.1 Init 运行时，在浏览器内完成解析、精化与诊断
- 诊断、Goal（`$/lean/plainGoal`）、悬停、补全、跳转定义
- 中英文界面，`/zh/`、`/en/` 双前缀，可切换并记住偏好
- 亮色 / 暗色 / 跟随系统三种主题，Monaco 主题同步
- 入门课程：从 `#check` 到第一个归纳证明，代码可一键载入编辑器
- 首次加载约 143MB 运行时，之后持久缓存；Service Worker 从 GitHub raw 分片并行下载，失败自动回退同源

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

运行时资产由 `scripts/fetch-assets.mjs` 从固定 revision 拉取，并逐个校验字节数与 SHA-256。

## 目录结构

```
src/
  main.ts            应用外壳：路由、语言与主题切换
  sw.ts              Range 分片下载 Service Worker（编译为 public/sw.js）
  i18n/              中英文字典与文案读取
  theme.ts           亮/暗/跟随系统
  views/             落地页、课程页、编辑器页
  components/        可复用的 Lean 编辑器面板
  lean-language.ts   Lean 语法高亮与语言配置
public/
  wasm-lean4/        Lean 运行时资产（构建时下载，不入库）
scripts/             资产下载、LSP 补丁
```

仓库里只有 TypeScript 源码：`src/sw.ts` 由 `npm run build:sw` 编译成 `public/sw.js`，不手写 JS。

## 许可证

本项目采用 **双协议**，你可以任选其一：

- [Apache License 2.0](LICENSE-APACHE)
- [木兰宽松许可证，第 2 版](LICENSE-MULAN)（Mulan Permissive Software License v2）

SPDX 标识：`(Apache-2.0 OR MulanPSL-2.0)`。
