**何时读我**：修改 `.github/workflows/`、变更分类规则、PR 检查档位、分支保护 required checks 或触发线上部署/巡检时阅读。
**单一事实来源**：变更分档逻辑见 [detect-changes.mjs](../scripts/detect-changes.mjs)，各工作流实现见 `.github/workflows/*.yml`。
**维护边界**：本文件只管本仓 GitHub Actions 工作流、触发矩阵与 Secrets；文档清单与工作流文件名必须保持 1:1 严格一致（`verify:docs` 强制校验）。运行时构建工作流见 [lean4-wasm-runtime](https://github.com/3y3y3y-huaiji/lean4-wasm-runtime)。

# CI / CD 工作流地图

Actions 里按职责划分工作流：应用 CI / PR 刷新、安全扫描、生产部署、线上巡检、PR 分支清理。
名称统一用 `CI ·` / `Security ·` / `Deploy ·` / `Smoke ·` / `Cleanup ·` 前缀，运行记录用 `run-name` 标出分支或动作，避免同类运行混在一起。

| 工作流 | 触发 | 用途 | 产物 / 影响 |
| --- | --- | --- | --- |
| [ci.yml](../.github/workflows/ci.yml) `CI · 应用` | PR、手动、`Deploy` 复用 | 先做 3 秒门禁新鲜度硬校验，再由 `changes` 分类：纯文档跑 5 秒 `docs-check`、工作流跑 `actionlint`、课程/视图走增量/金丝雀 `e2e`、UI 改动走 `e2e-ui`、运行时消费/网关改动走全量；另有 `static`（含 `verify:docs`） / `test` / `build` / `audit` | PR 检查结果，不部署 |
| [ci-refresh-open-prs.yml](../.github/workflows/ci-refresh-open-prs.yml) `CI · 门禁升级自动刷新在途 PR` | push `main`（CI/门禁路径）、手动 | 当 `main` 升级了 CI/门禁配置或脚本时，自动将最新 `main` 合入尚未同步的同仓在途 PR 并触发新版 `CI · 应用`（冲突则评论提醒） | 在途 PR 分支与最新 CI 状态 |
| [deploy.yml](../.github/workflows/deploy.yml) `Deploy · 应用` | push `main`、手动 | 先判定来源与 `deployable`：非可部署改动直接跳过；PR 合并直接构建部署并 smoke；direct push 先复用 `CI · 应用`，通过后再部署 | 生产站点 |
| [pr-cleanup.yml](../.github/workflows/pr-cleanup.yml) `Cleanup · 自动删除已合并 PR 分支` | `pull_request` (`closed`) | 同仓 PR 合并后自动兜底清理临时源分支（跳过 `main`、`release/*`、`spike/*`），与仓库 `delete_branch_on_merge` 双保险 | 仓库分支整洁 |
| [smoke.yml](../.github/workflows/smoke.yml) `Smoke · 线上巡检` | 每天 01:00 UTC、手动 | 首页、COOP/COEP、`sw.js`、`/cdn/` Range、白名单 404 巡检 | 只读 |
| [codeql.yml](../.github/workflows/codeql.yml) `Security · CodeQL` | PR / push `main`、每周一 03:17 UTC、手动 | `javascript-typescript` SAST 静态安全分析并上传 SARIF | GitHub Security 告警 |
| [scorecard.yml](../.github/workflows/scorecard.yml) `Security · OpenSSF Scorecard` | 分支保护变更、push `main`、每周一 04:23 UTC、手动 | OpenSSF 供应链安全评分、发布结果并上传 SARIF | OpenSSF Scorecard / SARIF |

> `CI · 应用` 对外的 required check 固定为：`static` / `test` / `build` / `浏览器端到端` / `audit`（另有 `changes` / `docs-check` / `actionlint`）。纯文档改动走 `changes` + 5 秒 `docs-check`（无 `pnpm install`）；`浏览器端到端` 聚合 `e2e-ui`、`e2e-smoke`、`e2e-lessons-full`、`e2e-lessons-changed`。内部 job 调整不影响分支保护。

## 命名与触发约定

- 应用 CI 只叫 `CI · 应用`。Lean wasm32 4.35 与实验性 wasm64 的编译器构建、堆栈补丁、差分等价门禁及 R2 / 魔搭上传工作流已拆入 [lean4-wasm-runtime](https://github.com/3y3y3y-huaiji/lean4-wasm-runtime)。
- `delete_branch_on_merge` 与 `pr-cleanup.yml` 保障 PR 合并后自动清理临时分支；`main` 保护采用 `strict: false` + `ci-refresh-open-prs.yml` + `changes` 门禁新鲜度硬校验组合（见 [DECISIONS](DECISIONS.md#adr-04)），日常并行 PR 无需为了无关提交重跑，但一旦门禁升级全体在途 PR 必须重过新版 CI。

> 合并前必须让 PR 的 `CI · 应用` 全绿。**日常改动无需在本地硬跑重型 E2E**——推送分支提 PR 即由 GitHub Actions 自动验证。direct push `main` 会先复用 `CI · 应用` 再部署。

## Secrets / Variables

| 名称 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Pages 部署（`deploy.yml`） |
| `CD_ENABLED` | 为 `true` 时 push `main` 的 `Deploy · 应用` 才执行 |

## 常见操作

```bash
# 手动部署当前 main（通常由 push main 自动触发）
gh workflow run deploy.yml

# 线上巡检（默认打 pages.dev，机房 IP 不会被自定义域的机器人规则拦）
gh workflow run smoke.yml
```

- 旧的运行记录可以在 Actions 页面按工作流过滤；不建议删除历史 release，保留外链可追溯性。
- 运行时发版与扩展包更新完成后，同步更新本仓 `config/` 清单并在本地重跑 `pnpm run patch:lsp && pnpm install --no-frozen-lockfile`。
