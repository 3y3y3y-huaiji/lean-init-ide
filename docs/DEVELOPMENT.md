# 本地开发

项目定位见 [README](../README.md)；分发链路见 [ARCHITECTURE](ARCHITECTURE.md)；
部署与运维见 [OPERATIONS](OPERATIONS.md)。

## 常用命令

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

改动后必须跑完整门禁，不要只跑 `pnpm test`。

本地环境的坑：`pnpm audit` 要加 `--registry=https://registry.npmjs.org`（镜像站不支持 audit 的 POST）；
pnpm 首次安装需要下载原生二进制，Windows 杀软可能误报，必要时把 pnpm 安装目录和项目 `node_modules` 加进排除项。

## 升级 @wasm-idle/lsp

运行时补丁在 `patches/`，安装时由 `patchedDependencies` 自动应用。升级后重新生成：

```bash
pnpm run patch:lsp          # 读取 package.json 里的版本
pnpm install --no-frozen-lockfile
pnpm exec vitest run src/lsp-patches.test.ts
```

`patch:lsp` 会从 npm registry 下载对应版本、校验 tarball 完整性、应用补丁并更新
`pnpm-workspace.yaml`，不依赖 `pnpm patch-commit`，避开它在 Windows 上的临时目录清理问题。

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
| `pnpm run e2e:lessons` | 逐课运行全部代码块，出现 error 级诊断即失败（CI 的 e2e job 内执行） |

覆盖率阈值写在 `vitest.config.ts`：全局 78% 语句 / 80% 行，`functions/**` 单独要求 95%。
后者是资产分发网关，任何降级都会让 wasm 加载链路断掉，所以按关键路径对待。

`.github/workflows/ci.yml` 拆成四个并行 job：静态检查、单元测试、构建产物、依赖审计（只审生产依赖）。
建议在 GitHub 分支保护里要求这四个 check 全绿才允许合入 `main`。

## 贡献约定

- 改代码前先读 [AGENTS.md](../AGENTS.md) 的硬约束与模块边界；资产清单、源解析、Range 语义各有唯一入口。
- 提交前跑完整门禁，一个提交只做一件事，提交信息写清楚「为什么」。
- 课程内容只能落在 Init 范围内；用户可见文案必须中英文同时补齐。

## 版本与发布

仓库没有 `package.json` 版本字段，**git tag 是唯一的版本来源**。版本号只对外表示「用户可见的变化」，
不跟着每次提交走，避免为了改一句文案就升版本。

### 版本号规则

- `0.x.y` 阶段：`x`（MINOR）加一 = 新增功能、课程、端点，或用户可感知的行为变化。
- `y`（PATCH）加一 = 修复 bug、修正课程代码或文案、依赖安全更新，不改变对外契约。
- `1.0.0` 之后，只有不兼容变更（路由结构、资产清单格式、缓存命名空间、隐私采集范围）才升 MAJOR。
- **不单独发版本**：纯文档（README / docs）、测试、内部重构、CI 配置、格式化。它们随下一次 MINOR 或 PATCH 一起走。
- 连续的小修复合并进同一个 PATCH，不要每个提交都打 tag。
- 打 tag 前 CI 必须全绿（含部署与线上冒烟）；用 annotated tag，并在发布记录里写清包含内容。

### 发布记录

- `v0.2.0`：新增「认识 Lean」导论课（共 9 节）、课程进度记忆与首页继续学习入口、LSP 语义补全与 Lean Unicode 缩写（`\to`、`\forall`）；补齐 CSP / Referrer-Policy / Permissions-Policy、favicon、robots/sitemap 等合规与门面。
- `v0.1.1`：第一课的 `rfl` 代码块改为可见输出；README 回归项目介绍，技术文档移入 `docs/`。
- `v0.1.0`：首个公开版本（8 节入门课、启动链路指标、低内存策略、隐私说明、国内源诊断）。
- 英文 README 属于纯文档，不单独发版，随下一个版本发布。

`main` 上每次推送都会由 CI 部署；正式版本额外打 tag，便于回滚与对外引用。
回滚方式见 [OPERATIONS](OPERATIONS.md#部署与冒烟)；运行时资产由清单里的 `cacheKey` 决定，回滚页面不会改动 R2 对象。

```bash
git tag -a v0.1.1 -m "v0.1.1: 一句话说明本次对外变化"
git push origin v0.1.1
```
