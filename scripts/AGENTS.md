# scripts/AGENTS.md · 构建脚本与 wasm64 工具链规范

仅在修改 `scripts/` 下脚本、补丁或 E2E 编排时阅读本指南。工作流全貌见 [CI.md](../docs/CI.md)，wasm64 规范见 [WASM64-SPIKE.md](../docs/WASM64-SPIKE.md)。

## 1. 两套完全独立的脚本世界

| 类别 | 文件范围 | 运行时与工具链 | 触发的 CI 档位 |
| --- | --- | --- | --- |
| **应用运维脚本** | `scripts/*.mjs`（`fetch-assets`、`upload-*`、`verify-*`、`e2e-*`、`detect-changes`、`prerender`） | Node 24+ 原生 ESM；零外部构建步骤，受根目录 `lint` 与 `vitest.config.ts` 管理 | 按改动影响走 `static` / `test` / `build` / `ui` / `full_lessons` |
| **wasm64 构建链** | `scripts/*.ts`、`scripts/ci/*.ts`、`scripts/lib/*.ts`、`scripts/patches/*.patch` | Node 24+ **原生类型擦除**直接运行 `.ts`，使用 `tsconfig.spike.json`、`eslint.spike.config.mjs`、`vitest.spike.config.ts` | 纯 `scripts/*.ts` 改动只走 `static` + `test:spike`（不触发前端部署）；工作流 `spike-wasm64.yml` 单独守护 |

- **Node 24 原生 TS 约束**：`scripts/**/*.ts` 开启 `erasableSyntaxOnly`（禁止需要编译期转换的 `enum` / `namespace` / 参数属性）。

## 2. CLI、路径与安全红线

- **统一 CLI 解析**：`scripts/**/*.ts` 命令行参数必须走 `scripts/lib/cli.ts`（未知开关、缺值、空字符串直接以退出码 2 失败）；文件系统前置校验走 `scripts/lib/fs-guards.ts`。
- **禁止硬编码域名**：资产探测、本地网关、线上冒烟统一读 `LEAN_ASSET_ORIGIN` / `LEAN_ASSET_BASE_URL`。
- **魔搭镜像扁平约束**：`upload-modelscope.mjs` 与 `src/asset-sources.mjs` 共用扁平目录 `<prefix>/<asset.name>`，严禁引入嵌套子目录差异（见 [ADR-02](../docs/DECISIONS.md#adr-02)）。
- **禁止静默吞错与假通过**：任何资产校验、GitHub Release 上传、`.patch` 锚点 `grep` 断言失败必须显式非零退出，禁止用 `continue-on-error: true` 掩盖构建或缓存失效。

## 3. wasm64 Pin 与补丁联动

- Lean 版本唯一定点在 `scripts/pin-lean.ts`（`LEAN_PIN`）；改 pin 时必须同步验证三份补丁与 `scripts/wasm64-patch-equivalence.ts` 差分语料（[ADR-03](../docs/DECISIONS.md#adr-03)）。

## 4. 改完必跑

```bash
pnpm run format:check && pnpm run lint && pnpm run verify:manifest && pnpm run verify:docs
pnpm run format:check:spike && pnpm run lint:spike && pnpm run typecheck:spike && pnpm run test:spike
```
