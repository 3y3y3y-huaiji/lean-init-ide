# src/i18n/AGENTS.md · 课程、挑战与双语规范

仅在修改 `src/i18n/` 或 `src/challenges.ts` 时阅读本指南。全仓约束见根目录 [AGENTS.md](../../AGENTS.md)。

## 1. 目标与运行时边界

- **入门/数学篇（01–22 课）与趣味挑战仅允许依赖 `Init`**：Lean 4.35.0 `Init` 已内置 `omega` / `grind` / `decide` / `simp` / `rw`；**严禁**引入 Mathlib 幽灵战术（`ring`、`linarith`、`nlinarith`、`norm_num`）。
- **工程实战篇（23–27 课）按需挂载扩展包**：依赖 `Std.*` 或 `Batteries.*` 的课程必须在元数据声明对应 `requires`（如 `['std']`）。
- **正文零未完成代码**：除第 21 课 `math-axioms` 外，课程正文 `{ kind: 'code' }` **禁止留 `sorry`**，且练习不得直接复用正文已证明的同名定理。
- **Goal 面板隐性约定**：`{ kind: 'goal' }` 中的解释文字以 `说明：...` / `Note: ...` 单独成行（由 `src/views/lesson-goal-steps.ts` 解析，勿拆出伪步骤），步骤代码尽量对齐左侧代码块以便高亮定位。

## 2. 强联动文件（修改时须同读）

- **课程元数据与双语内容**：`src/i18n/lesson-catalog.ts`、`src/i18n/lessons-zh.ts`、`src/i18n/lessons-en.ts`（块数/结构 1:1 对称）；增删课时数须同步 `README.md` 与 `README.en.md`。
- **界面文案与隐私声明**：`src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`（键集合完全对齐）。
- **趣味挑战与 SSG 页面元信息**：`src/challenges.ts`、`src/views/lesson.ts`、`src/views/challenge.ts`、`scripts/e2e-lessons.mjs`（自动从 `LESSON_CATALOG` 与 `CHALLENGES` 读取 `SLUGS`/`CHALLENGE_SLUGS`，无需手工另写清单）。

## 3. 验收标准

```bash
pnpm exec vitest run src/i18n/ src/curriculum-invariants.test.ts src/views/lesson-goal-steps.test.ts src/challenges.test.ts
pnpm run verify:docs && pnpm run build:web && pnpm run verify:build
```
