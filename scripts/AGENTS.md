# scripts/AGENTS.md · 应用脚本与 E2E 规范

仅在修改 `scripts/` 下构建、校验或 E2E 编排脚本时阅读本指南。工作流全貌见 [CI.md](../docs/CI.md)。

> Lean WASM 编译器构建、堆栈补丁与 R2 / 魔搭上传工具链已独立迁移至 [lean4-wasm-runtime](https://github.com/3y3y3y-huaiji/lean4-wasm-runtime)。

## 1. 脚本职责与运行环境

- `scripts/*.mjs`（`fetch-assets`、`patch-lsp`、`generate-seo`、`prerender`、`verify-*`、`e2e-*`、`detect-changes`、`smoke`、`local-gateway`、`probe-sources`）均使用 **Node 24+ 原生 ESM**，无编译步骤，受根目录 ESLint 与 `vitest.config.ts` 管理。

## 2. 路径与安全红线

- **禁止硬编码域名**：资产探测、本地网关、线上冒烟统一读 `LEAN_ASSET_ORIGIN` / `LEAN_ASSET_BASE_URL`。
- **魔搭镜像扁平约束**：前端与构建脚本共用 `src/asset-sources.mjs` 的扁平路径 `<prefix>/<asset.name>`，严禁引入嵌套子目录差异（见 [ADR-02](../docs/DECISIONS.md#adr-02)）。
- **禁止静默吞错与假通过**：任何资产校验、清单校验或构建门禁失败必须显式非零退出，禁止用 `continue-on-error: true` 掩盖失败。

## 3. 强联动

- **CI 变更分档与工作流清单**：`scripts/detect-changes.mjs` ↔ `.github/workflows/ci.yml`；`scripts/verify-docs.mjs` ↔ `docs/CI.md` 与 `package.json`。

## 4. 验收标准

```bash
pnpm run format:check && pnpm run lint && pnpm run verify:manifest && pnpm run verify:docs
pnpm exec vitest run scripts/
```
