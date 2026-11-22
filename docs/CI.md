**何时读我**：修改 `.github/workflows/`、变更分类规则、PR 检查档位、分支保护 required checks 或手动发版运行时包时阅读。
**单一事实来源**：变更分档逻辑见 [detect-changes.mjs](../scripts/detect-changes.mjs)，各工作流实现见 `.github/workflows/*.yml`。
**维护边界**：本文件只管 GitHub Actions 工作流、触发矩阵与 Secrets；文档清单与工作流文件名必须保持 1:1 严格一致（`verify:docs` 强制校验）。

# CI / CD 工作流地图

Actions 里按职责划分工作流：应用 CI / PR 刷新、安全扫描、生产部署、运行时构建、线上巡检。
名称统一用 `CI ·` / `Security ·` / `Deploy ·` / `Runtime ·` / `Smoke ·` / `Cleanup ·` 前缀，运行记录用 `run-name` 标出分支或动作，避免同类运行混在一起。

| 工作流 | 触发 | 用途 | 产物 / 影响 |
| --- | --- | --- | --- |
| [ci.yml](../.github/workflows/ci.yml) `CI · 应用` | PR、手动、`Deploy` 复用 | 先做 3 秒门禁新鲜度硬校验，再由 `changes` 分类：纯文档跑 5 秒 `docs-check`、工作流跑 `actionlint`、课程/视图走增量/金丝雀 `e2e`、UI 改动走 `e2e-ui`、运行时走全量；另有 `static`（含 `verify:docs`） / `test` / `build` / `audit` | PR 检查结果，不部署 |
| [ci-refresh-open-prs.yml](../.github/workflows/ci-refresh-open-prs.yml) `CI · 门禁升级自动刷新在途 PR` | push `main`（CI/门禁路径）、手动 | 当 `main` 升级了 CI/门禁配置或脚本时，自动将最新 `main` 合入尚未同步的同仓在途 PR 并触发新版 `CI · 应用`（冲突则评论提醒） | 在途 PR 分支与最新 CI 状态 |
| [deploy.yml](../.github/workflows/deploy.yml) `Deploy · 应用` | push `main`、手动 | 先判定来源与 `deployable`：非可部署改动直接跳过；PR 合并直接构建部署并 smoke；direct push 先复用 `CI · 应用`，通过后再部署 | 生产站点 |
| [pr-cleanup.yml](../.github/workflows/pr-cleanup.yml) `Cleanup · 自动删除已合并 PR 分支` | `pull_request` (`closed`) | 同仓 PR 合并后自动兜底清理临时源分支（跳过 `main`、`release/*`、`spike/*`），与仓库 `delete_branch_on_merge` 双保险 | 仓库分支整洁 |
| [runtime-wasm32-435.yml](../.github/workflows/runtime-wasm32-435.yml) `Runtime · Lean 4.35 wasm32` | `runtime-v*` tag、手动 | 构建 4.35 wasm32 Init 与可选 Std / Batteries 扩展包；发布时打 `--latest=false` 并同步扩展资产到 Release | artifact；发布时写 R2、魔搭、Release |
| [spike-wasm64.yml](../.github/workflows/spike-wasm64.yml) `Runtime · Lean wasm64 gate` | PR / push `main`（构建链路径）、nightly、手动 | 构建 wasm64（4.36.0-rc2 + 三份栈补丁），`smoke` 跑 Init 编译、LSP 与 `wasm64-patch-equivalence`；`deep` 编扩展；支持 `--prerelease --latest=false` 发布 | 不自动部署；可手动发布 |
| [cpp-gate.yml](../.github/workflows/cpp-gate.yml) `CPP Gate` | PR / push `main`（`scripts/**/*.c*`） | 手写 C/C++ 的 clang-format / clang-tidy / `-Werror` | 只读检查 |
| [depth-probe.yml](../.github/workflows/depth-probe.yml) `Depth probe` | push `main`（探针路径）、手动 | 浏览器 Worker 递归上界、JSPI/ASYNCIFY/tail-call 对照、WHNF 尾调用审计 | artifact，只读 |
| [modelscope.yml](../.github/workflows/modelscope.yml) `Runtime · 魔搭镜像` | 手动 | 单独重传或校验魔搭镜像 | ModelScope |
| [smoke.yml](../.github/workflows/smoke.yml) `Smoke · 线上巡检` | 每天 01:00 UTC、手动 | 首页、COOP/COEP、`sw.js`、`/cdn/` Range、白名单 404 巡检 | 只读 |
| [codeql.yml](../.github/workflows/codeql.yml) `Security · CodeQL` | PR / push `main`、每周一 03:17 UTC、手动 | `javascript-typescript` SAST 静态安全分析并上传 SARIF | GitHub Security 告警 |
| [scorecard.yml](../.github/workflows/scorecard.yml) `Security · OpenSSF Scorecard` | 分支保护变更、push `main`、每周一 04:23 UTC、手动 | OpenSSF 供应链安全评分、发布结果并上传 SARIF | OpenSSF Scorecard / SARIF |

> `CI · 应用` 对外的 required check 固定为：`static` / `test` / `build` / `浏览器端到端` / `audit`（另有 `changes` / `docs-check` / `actionlint`）。纯文档改动走 `changes` + 5 秒 `docs-check`（无 `pnpm install`）；`浏览器端到端` 聚合 `e2e-ui`、`e2e-smoke`、`e2e-lessons-full`、`e2e-lessons-changed`。内部 job 调整不影响分支保护。

## 命名与触发约定

- 应用 CI 只叫 `CI · 应用`，运行时工作流统一 `Runtime · Lean <version> wasm32|wasm64`。Std / Batteries 扩展包已正式支持在 `runtime-wasm32-435.yml` 与 `e2e-prepare` 中通过扩展开关按需构建与验证，生产由前端按 `requires` 或用户手动选择挂载。
- `delete_branch_on_merge` 与 `pr-cleanup.yml` 保障 PR 合并后自动清理临时分支；`main` 保护采用 `strict: false` + `ci-refresh-open-prs.yml` + `changes` 门禁新鲜度硬校验组合（见 [DECISIONS](DECISIONS.md#adr-04)），日常并行 PR 无需为了无关提交重跑，但一旦门禁升级全体在途 PR 必须重过新版 CI。
- `runtime-v*` 发布均标记 `--latest=false`（wasm64 额外加 `--prerelease`），保留正式应用发版作为仓库首页 `Latest`。

> 合并前必须让 PR 的 `CI · 应用` 全绿。**日常改动无需在本地硬跑重型 E2E**——推送分支提 PR 即由 GitHub Actions 自动验证。direct push `main` 会先复用 `CI · 应用` 再部署。

## Secrets / Variables

| 名称 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Pages 部署（`deploy.yml`） |
| `CD_ENABLED` | 为 `true` 时 push `main` 的 `Deploy · 应用` 才执行 |
| `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | 运行时资产上传（桶级 Object Read & Write） |
| `MODELSCOPE_TOKEN` | 魔搭镜像上传 |

R2 的 egress 免费；一次完整构建下载约 100 MB，按对象算是十几次 Class B 操作，不需要担心流量额度。

## 常见操作

```bash
# 手动部署当前 main（通常由 push main 自动触发）
gh workflow run deploy.yml

# 只构建、不发布 4.35
gh workflow run runtime-wasm32-435.yml -f publish=none

# 构建并发布到 R2 + 魔搭
gh workflow run runtime-wasm32-435.yml -f publish=both

# 只校验远端对象
gh workflow run runtime-wasm32-435.yml -f publish=both -f verify_only=true

# 线上巡检（默认打 pages.dev，机房 IP 不会被自定义域的机器人规则拦）
gh workflow run smoke.yml

# wasm64 快速门禁（构建 + Init 编译/LSP + 差分等价）
gh workflow run spike-wasm64.yml -f mode=smoke

# wasm64 深水区（Mathlib 裁切 + release/npm）
gh workflow run spike-wasm64.yml -f mode=deep
```

- 运行时 tag 必须是 `runtime-v<version>`；发布 job 用 `--target "$GITHUB_SHA"` 把 tag 建在实际构建提交上。
- wasm64 的 Lean 版本默认 pin 在 `scripts/pin-lean.ts`，可用 `LEAN_PIN_*` 环境变量临时覆盖。正式升级时必须同时更新三份栈补丁，并通过 `wasm64-patch-equivalence` 差分门禁，详见 [WASM64-SPIKE](WASM64-SPIKE.md)「版本 pin 与升级」。
- 旧的运行记录可以在 Actions 页面按工作流过滤；不建议删除 release 对应的运行记录，保留追溯。
- 新增 `Std` / `Batteries` 或 `Mathlib` 子集扩展模块后，同步更新 `config/` 清单与 [DECISIONS](DECISIONS.md#adr-03)。
