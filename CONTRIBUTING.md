# 贡献指南

> 本页管「怎么参与」。硬约束、模块边界与已知陷阱见 [AGENTS.md](AGENTS.md)；命令、覆盖率阈值与本地坑见
> [本地开发](docs/DEVELOPMENT.md)；工作流与分支保护见 [CI / CD 工作流地图](docs/CI.md)。
> 排期与优先级统一登记在[路线图与公开待办 #74](https://github.com/lean-online/lean-init-ide/discussions/74)。

## 先选一条路

| 想做的事 | 去哪 |
| --- | --- |
| 反馈 Bug、课程内容有误、运行时异常 | [Issues](https://github.com/lean-online/lean-init-ide/issues) 选对应模板（「引擎 / 运行时问题」含 wasm32 / wasm64、镜像源、`#codez=` 复现链接字段） |
| 提想法、问用法、改课程表述 | [Discussions](https://github.com/lean-online/lean-init-ide/discussions) 的 Ideas 分类；路线图见 #74，题库征集见 #75 |
| 改代码、补课程、修文档 | 直接从最新 `origin/main` 开分支提 PR，流程见下 |
| 认领任务 | [#74](https://github.com/lean-online/lean-init-ide/discussions/74) 里标了「可认领」的条目，评论一句说明打算怎么做即可 |

运行时与编译器工具链（wasm32 / wasm64 构建、显式栈改造、5 层一致性门禁、R2 / 魔搭发布脚本）在
[lean-online/lean4-wasm](https://github.com/lean-online/lean4-wasm)。**那个仓库关闭了 Issues**，
所以即使改动落在 `lean4-wasm`，议题也统一在本仓追踪。

## 本地开发

需要 **Node 24+**，包管理只允许 `pnpm`（`pnpm-lock.yaml` 是唯一锁文件，npm / yarn 会污染它）。

```bash
pnpm install         # 安装依赖并应用 patches/ 里的 @wasm-idle/lsp 补丁
pnpm run dev         # 开发服务器，首次会下载并校验运行时资产
pnpm run build:web   # 只构建前端，跳过资产下载（CI 使用的就是这条）
pnpm run preview     # 预览构建产物
```

Windows 上注意两点：`pnpm audit` 需要显式 `--registry=https://registry.npmjs.org`（镜像站不支持 audit 的 POST）；
首次安装会拉原生二进制，杀软误报时把 pnpm 安装目录和 `node_modules` 加入排除项。

## 测试与回归

本地**不要硬跑全套**：推送分支提 PR 后由 `CI · 应用` 按改动范围自动裁剪并跑完整门禁。需要快速确认时按需跑：

| 命令 | 用来确认什么 |
| --- | --- |
| `pnpm run format:check` | Prettier 格式（Markdown 被 `.prettierignore` 排除） |
| `pnpm run lint` | ESLint：应用、脚本、配置 |
| `pnpm run typecheck` | 应用 / Service Worker / Pages Functions 三份 tsconfig |
| `pnpm test` | Vitest + 覆盖率阈值 |
| `pnpm run verify:docs` | 文档不变量：断链、幽灵命令、版本与课时数同步 |
| `pnpm run verify:manifest` | 资产清单结构（key 唯一、sha256 格式、同源 baseUrl） |
| `pnpm run verify:build` | 产物契约：`#app` 挂载点、`sw.js`、`_routes.json`、COOP/COEP、体积预算 |

改了编辑器或运行时消费链路时，本地跑 E2E 需要先起同源网关（对应线上 `/cdn` 语义）：

```bash
pnpm run gateway     # 另开一个终端
pnpm run e2e         # 真实浏览器跑通 initialize / 诊断 / Nat.add
pnpm run e2e:lessons # 逐课运行全部代码块，出现 error 级诊断即失败
pnpm run e2e:ui      # 多视口无 WASM UI 契约
```

`pnpm run preview` 无法替代线上判断：它没有 Pages Functions，`/cdn` 会走分片回退。

## 提 PR

1. **从最新 `origin/main` 拉干净分支**，一件改动一个 PR。分支名建议 `fix/…`、`feat/…`、`docs/…`。
2. **提交信息**：`<type>(<scope>): 一句话结论`，例如 `fix(panel): 诊断面板不再被日志挤成一条`。
3. **不要直接 push `main`**，也不要在没被授权时代为合并 PR。
4. **填完 PR 模板**：变更摘要、关联的 Issue / Discussion、验证方式、红线自查。
5. **等 `CI · 应用` 全绿**再请人 review；纯文档改动会走 5 秒的 `docs-check` 档。

## 内容与文案

- **用户可见文案必须中英同时补齐**：`src/i18n/` 的键集合由 `locale-parity` 测试强校验，只加中文会让 CI 变红。
- **课程代码只能在运行时可加载的范围内**：默认只有 `Init`，工程实战课可用 `Std` / `Batteries`；Mathlib 只在实验性
  wasm64 下按需挂载教学子集。
- **别写会炸栈的 `simp`**：`simp [Nat.succ_add, Nat.add_succ]` 这类叠加会形成循环重写并撑爆工作栈，
  默认示例统一用 `simp only [...]` / `rw [...]`。细节见 [AGENTS.md](AGENTS.md) 与 [架构决策记录](docs/DECISIONS.md)。
- **改课程先读** [课程与 i18n 指南](src/i18n/AGENTS.md)。

## 平台红线速查

改到下面任何一项，请在 PR 描述里说明影响与回退方式（完整清单见 [AGENTS.md](AGENTS.md) 第 3 节）：

- 跨源隔离 COOP / COEP 与 `SharedArrayBuffer` 不能去掉；不要新增第二个用户可访问 origin（会破坏按 origin 隔离的持久缓存）。
- CSP 核心放行（`'wasm-unsafe-eval'`、`blob:`、`https://*.modelscope.cn`、`data:`）不可删。
- R2 binding 名固定 `LEAN_ASSETS`（`ASSETS` 是 Pages 保留名）。
- 改资产内容必须同步清单字节数 / SHA-256 与 `cacheKey`；扩展包用独立 `h=<sha256>`，不要为此改基础 `cacheKey`，
  否则全量用户要重下 100MB 级别的 `Init`。
- 遥测不得采集用户 Lean 代码、cookie 或设备指纹。

## 安全与隐私

发现安全问题不要开公开 Issue，按 [SECURITY.md](SECURITY.md) 的渠道私下报告。

## 行为准则

讨论对事不对人：可以尖锐地批评方案，不要攻击提交者。反复灌水、贴广告或刻意消耗维护者时间的账号会被静音。
