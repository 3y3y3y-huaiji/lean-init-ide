# CI / CD 工作流地图

Actions 里只保留三类工作流：应用 CI、运行时构建、线上巡检。
名称统一用 `CI ·` / `Runtime ·` / `Smoke ·` 前缀，运行记录用 `run-name` 标出分支或动作，避免同类运行混在一起。

| 工作流 | 触发 | 用途 | 产物 / 影响 |
| --- | --- | --- | --- |
| [ci.yml](../.github/workflows/ci.yml) `CI · 应用` | push `main`、PR、手动 | 静态检查、单测、构建、浏览器 e2e、依赖审计、actionlint；`main` 上全部通过后部署 Pages 并跑线上 smoke | 生产站点 |
| [runtime-wasm32-435.yml](../.github/workflows/runtime-wasm32-435.yml) `Runtime · Lean 4.35 wasm32` | `runtime-v*` tag、手动 | 构建 4.35 wasm32 运行时、Init oleans 与 zstd 资产；手动可选发布 R2 / 魔搭 / GitHub Release | artifact；发布时写 R2、魔搭、Release |
| [modelscope.yml](../.github/workflows/modelscope.yml) `Runtime · 魔搭镜像` | 手动 | 单独重传或校验魔搭镜像 | ModelScope |
| [smoke.yml](../.github/workflows/smoke.yml) `Smoke · 线上巡检` | 每天 01:00 UTC、手动 | 首页、COOP/COEP、`sw.js`、`/cdn/` Range、白名单 404 巡检 | 只读 |
| [runtime-wasm32.yml](../.github/workflows/runtime-wasm32.yml) `Runtime · Lean 4.34 wasm32 (legacy)` | 手动 | 4.34 历史构建，保留对照 | artifact |

## 命名与触发约定

- 应用 CI 只叫 `CI · 应用`，运行时构建不要混进来。
- 运行时工作流统一 `Runtime · Lean <version> wasm32`；旧版本加 `(legacy)`。
- 日常主分支不自动发布运行时；只有手动 dispatch 或 `runtime-v*` tag 才发布资产。
- 4.34 的 `runtime-wasm32.yml` 已改为手动，不再接 `spike/*` 分支 push。
- `run-name` 写动作（build / publish / verify），不要依赖 commit message。
- Std / Batteries 扩展包的 `build_extensions` 开关在 `spike/std-batteries` 分支验证，尚未合并到主工作流；生产默认只加载 Init。

## Secrets / Variables

| 名称 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Pages 部署（`ci.yml` deploy job） |
| `CD_ENABLED` | 为 `true` 时 `main` 的 deploy job 才执行 |
| `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | 运行时资产上传（桶级 Object Read & Write） |
| `MODELSCOPE_TOKEN` | 魔搭镜像上传 |

R2 的 egress 免费；一次完整构建下载约 100 MB，按对象算是十几次 Class B 操作，不需要担心流量额度。

## 常见操作

```bash
# 只构建、不发布 4.35
gh workflow run runtime-wasm32-435.yml -f publish=none

# 构建并发布到 R2 + 魔搭
gh workflow run runtime-wasm32-435.yml -f publish=both

# 只校验远端对象
gh workflow run runtime-wasm32-435.yml -f publish=both -f verify_only=true

# 线上巡检（默认打 pages.dev，机房 IP 不会被自定义域的机器人规则拦）
gh workflow run smoke.yml
```

- 运行时 tag 必须是 `runtime-v<version>`；发布 job 用 `--target "$GITHUB_SHA"` 把 tag 建在实际构建提交上。
- 旧的运行记录可以在 Actions 页面按工作流过滤；不建议删除 release 对应的运行记录，保留追溯。
- 扩展包构建（Std / Batteries）目前只在分支上验证，接入生产前先补 `docs/` 里的按需加载设计。
