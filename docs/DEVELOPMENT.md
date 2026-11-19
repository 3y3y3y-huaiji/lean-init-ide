# 本地开发

项目定位见 [README](../README.md)；分发链路见 [ARCHITECTURE](ARCHITECTURE.md)；
部署与运维见 [OPERATIONS](OPERATIONS.md)；CI 工作流地图见 [CI](CI.md)。

## 常用命令

```bash
pnpm install         # 安装依赖并应用 patches/ 里的 @wasm-idle/lsp 补丁
pnpm run dev         # 开发服务器（首次会下载并校验运行时资产）
pnpm run build       # 生产构建（含资产下载）
pnpm run build:web   # 只构建前端，跳过运行时资产下载（CI 使用）
pnpm run preview     # 预览构建产物
pnpm run smoke       # 线上冒烟，发版后跑
```

依赖由 pnpm 12 管理：`pnpm-lock.yaml` 固定版本，`pnpm-workspace.yaml` 里放 overrides、
`allowBuilds` 和 `patchedDependencies`。不要再用 npm 生成 `package-lock.json`。

构建机需要 **Node 24+**：`fetch:assets` 会把上游 gzip 重新压成 zstd，用的是 Node 内置的
`zlib.zstdCompressSync`。CI 的三个 workflow 都已固定 `node-version: 24`。

改动后**不要在本地硬跑完整门禁或 E2E**，优先推送分支并提 PR，利用 PR 的 GitHub Actions（`CI · 应用`）算力跑完完整检查；本地仅在需要快速确认时按需运行轻量单测或静态检查即可。

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

## wasm64 运行时与栈补丁

wasm64 构建链、Lean 版本冻结（4.36.0-rc2）与三处栈补丁只在
`.github/workflows/spike-wasm64.yml` 里跑，本地只做静态检查与门禁单测：

```bash
pnpm run typecheck:spike      # tsconfig.spike.json
pnpm run lint:spike           # 只扫 scripts/**/*.ts
pnpm run format:check:spike
pnpm run test:spike           # vitest.spike.config.ts
pnpm run test:spike:coverage  # CI 用，阈值 75% 行 / 60% 函数
pnpm run check:cpp            # 手写 C/C++ 的 clang-format + clang-tidy
```

真正的行为基准是 `scripts/wasm64-patch-equivalence.ts`：同一批 Lean 源文件分别用官方
未打补丁的原生 Lean 与打补丁的 wasm64 编译，比较退出码与 stdout。它需要完整构建产物，
所以只在 Actions 的 smoke job 里执行。设计细节与踩坑记录见 [WASM64-SPIKE](WASM64-SPIKE.md)。

## 质量门禁

> **PR 阶段无需本地跑全套检查**：提 PR 后会由 `.github/workflows/ci.yml`（`CI · 应用`）在 GitHub Actions 上自动执行下列完整门禁与 E2E，合并前等待 Actions 检查全绿即可。

CI 跑下列命令，任一失败即阻断合并（本地仅作按需参考）：

| 命令 | 检查内容 |
| --- | --- |
| `pnpm run format:check` | Prettier 格式一致性 |
| `pnpm run lint` | ESLint（应用、脚本、配置文件） |
| `pnpm run typecheck` | 三份 tsconfig：应用、Service Worker、Pages Functions |
| `pnpm test` | Vitest + 覆盖率阈值 |
| `pnpm run verify:manifest` | 资产清单结构：key 唯一、sha256 格式、同源 baseUrl、bytes 为正 |
| `pnpm run build:web` | 生产构建（跳过运行时资产下载） |
| `pnpm run verify:build` | 产物契约：`#app` 挂载点、`sw.js`、`_routes.json` 白名单（`/cdn/*` + `/api/telemetry`）、COOP/COEP、JS 体积预算 |
| `pnpm run e2e:lessons` | 逐课运行全部代码块，出现 error 级诊断即失败（CI 的分片 job 内执行） |

覆盖率阈值写在 `vitest.config.ts`：全局 78% 语句 / 80% 行，`functions/**` 单独要求 95%。
后者是资产分发网关，任何降级都会让 wasm 加载链路断掉，所以按关键路径对待。

`.github/workflows/ci.yml` 先用 `changes` job 调 `scripts/detect-changes.mjs` 给改动分档，再按档位启动门禁：

| 改动类型 | 实际执行 |
| --- | --- |
| 纯文档 | 只跑 `changes`，其余 job 跳过（跳过视为通过） |
| 纯工作流 / `.github/**` | `changes` + `actionlint` |
| 测试文件 | `static` + `test` |
| 课程 `lessons-zh.ts` / 挑战 `challenges.ts` | `static` + `test` + `build` + `e2e-lessons-changed`（只跑改到的 slug） |
| 其它应用代码 | `static` + `test` + `build` + `e2e-smoke` |
| 运行时 / 资产 / LSP / 网关 / `config/` / `functions/` / `public/` | 以上全部 + `e2e-smoke` + `e2e-lessons-full`（2 片并行） |

课程增量筛选由 `LEAN_E2E_LESSONS` / `LEAN_E2E_CHALLENGES` 控制；全量课程在单 runner 内仍保持 `LEAN_E2E_WORKERS=1`，避免三套 Init + Std + Batteries 同时驻留导致内存不足，并行度由独立 runner 分片提供。无法可靠缩小范围时（课程目录、加载器、新增/删除课程）会自动回退到全量。
对外始终由 `e2e-gate`（check 名 `浏览器端到端`）聚合内部 E2E 结果；调整内部分档时不要改这个对外名字。
新增或删除课程 / 挑战时必须同步 `scripts/e2e-lessons.mjs` 的 `SLUGS` / `CHALLENGE_SLUGS`：`changes` 会核对内容源与清单，不一致直接失败，避免全量跑也漏掉新条目。
建议在 GitHub 分支保护里要求上述 check 全绿才允许合入 `main`。

## 贡献约定

- 改代码前先读 [AGENTS.md](../AGENTS.md) 的硬约束与模块边界；资产清单、源解析、Range 语义各有唯一入口。
- 改完后直接推送分支并提 PR，交由 GitHub Actions（`CI · 应用`）算力跑完整门禁，不在本地重复跑重型测试或 E2E；一个提交只做一件事，提交信息写清楚「为什么」。
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

- `v0.5.0`：设置面板新增运行时下载源选择，下载失败可一键换源重试；Lean 崩溃后自动重启并保留代码与崩溃前诊断；修复未完成检查误亮通过、运行通过提示提前结算与爆栈循环；优化 SSG 首屏与 CLS、分片进度竞态，修复跨域镜像 CORS 预检与自动选源；扩充核心模块单测并新增课程与路由不变量守卫。
- `v0.4.0`：新增「把数学证明翻译成 Lean」桥接课与策略/符号/报错速查表；22 节课程统一 Goal 旁白、踩坑折叠与练习提示；练习通过写入完成进度，首页继续学习与目录 ✓ 跟随；编辑器支持分栏拖拽、隐藏日志、运行通过提示；算术收尾改用 `grind`。
- `v0.3.0`：新增「数学与验证」路径 12 节（整除、奇偶、gcd、素数、集合、函数、关系、强归纳、插入排序、列表求和、公理与 Mathlib 导读）；首页与目录按路径分组；重置改为按钮二次确认并收紧窄屏顶栏。
- `v0.2.1`：修复清空代码被误判「本关已通过」、语言切换丢失 `?lesson=`、重置题目缺少确认；补齐英文日志与面板文案；确认 390px 窄屏为单列堆叠。
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
