# CI / CD 工作流地图

Actions 里分四类工作流：应用 CI、运行时构建、行为 / 静态门禁、线上巡检。
名称统一用 `CI ·` / `Deploy ·` / `Runtime ·` / `Smoke ·` 前缀，运行记录用 `run-name` 标出分支或动作，避免同类运行混在一起。

| 工作流 | 触发 | 用途 | 产物 / 影响 |
| --- | --- | --- | --- |
| [ci.yml](../.github/workflows/ci.yml) `CI · 应用` | PR、手动、被 Deploy 复用 | 先由 `changes` 分类：文档/工作流直接过、课程内容增量 e2e、运行时改动全量 e2e；另有 static / test / build / audit / actionlint | PR 检查结果，不部署 |
| [deploy.yml](../.github/workflows/deploy.yml) `Deploy · 应用` | push `main`、手动 | PR 合并：直接构建、部署、smoke；direct push：先复用 `CI · 应用`，通过后再部署 | 生产站点 |
| [runtime-wasm32-435.yml](../.github/workflows/runtime-wasm32-435.yml) `Runtime · Lean 4.35 wasm32` | `runtime-v*` tag、手动 | 构建 4.35 wasm32 运行时、Init oleans 与 zstd 资产；手动可选发布 R2 / 魔搭 / GitHub Release | artifact；发布时写 R2、魔搭、Release |
| [spike-wasm64.yml](../.github/workflows/spike-wasm64.yml) `Runtime · Lean wasm64 gate` | PR / push `main`（仅构建链路径）、nightly、手动 | 用 `scripts/pin-lean.ts` 的 Lean 版本（默认 4.36.0-rc2）构建 wasm64（GMP + 三处栈补丁），smoke 跑 Init 编译、LSP 与 `wasm64-patch-equivalence` 差分门禁；`deep` 追加 Mathlib 裁切与 release/npm | 不自动部署；`deep` 产物可手动发布 R2 / 魔搭 / Release |
| [cpp-gate.yml](../.github/workflows/cpp-gate.yml) `CI · C/C++ 静态门禁` | PR / push `main`（`scripts/**/*.c*`） | 手写 C/C++ 的 clang-format / clang-tidy / `-Werror` | 只读检查 |
| [depth-probe.yml](../.github/workflows/depth-probe.yml) `Runtime · 递归深度探针` | push `main`（探针路径）、手动 | 浏览器 Worker 递归上界、JSPI/ASYNCIFY/tail-call 对照、WHNF 尾调用审计 | artifact，只读 |
| [modelscope.yml](../.github/workflows/modelscope.yml) `Runtime · 魔搭镜像` | 手动 | 单独重传或校验魔搭镜像 | ModelScope |
| [smoke.yml](../.github/workflows/smoke.yml) `Smoke · 线上巡检` | 每天 01:00 UTC、手动 | 首页、COOP/COEP、`sw.js`、`/cdn/` Range、白名单 404 巡检 | 只读 |

> `CI · 应用` 对外的 required check 固定为：`changes` / `static` / `test` / `build` / `浏览器端到端` / `audit` / `actionlint`。其中 `浏览器端到端` 是聚合门禁（`e2e-gate`），内部再拆成 `e2e-smoke` / `e2e-lessons-full` / `e2e-lessons-changed`；内部 job 改名不影响分支保护。变更分类跳过的 job 在 PR 上显示为 Skipped，GitHub 按通过处理。

## 命名与触发约定

- 应用 CI 只叫 `CI · 应用`，在 PR / 手动触发，并被 `Deploy · 应用` 在 direct push 时复用；运行时构建不要混进来。
- 应用部署只叫 `Deploy · 应用`，只在 push `main` / 手动触发。PR 合并直接部署；direct push 先跑 CI，CI 不过不部署，不重复跑两份 PR 检查。
- 运行时工作流统一 `Runtime · Lean <version> wasm32|wasm64`。wasm64 门禁只在构建链路径变更时触发，避免文档改动占用 6 小时 runner。
- 日常主分支不自动发布运行时；只有手动 dispatch 或 `runtime-v*` tag 才发布资产。wasm64 的 `deep` 同样不会被普通 push `main` 触发。
- `run-name` 写动作（build / deploy / publish / verify），不要依赖 commit message。
- Std / Batteries 扩展包的 `build_extensions` 开关在 `spike/std-batteries` 分支验证，尚未合并到主工作流；生产默认只加载 Init。

> 合并前必须让 PR 的 `CI · 应用` 全绿。**日常改动无需在本地硬跑全套测试、构建或 E2E**——直接推送分支并提 PR，充分利用 PR 自动触发的 `CI · 应用` Actions 算力完成全套门禁。直接 push 到 `main` 时，`Deploy · 应用` 会先在 `ci` job 里复用 `CI · 应用`，CI 不过不会部署。要连 push 本身都拒绝，需要额外开分支保护/规则集（Require a pull request before merging）。

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
- 扩展包构建（Std / Batteries）目前只在分支上验证，接入生产前先补 `docs/` 里的按需加载设计。
