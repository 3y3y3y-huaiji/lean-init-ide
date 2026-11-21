# src/i18n/AGENTS.md · 课程、挑战与双语规范

仅在修改 `src/i18n/` 或 `src/challenges.ts` 时阅读本指南。全仓约束见根目录 [AGENTS.md](../../AGENTS.md)。

## 1. 运行时与策略边界

- **入门篇与数学篇（01–22 课、趣味挑战）仅允许依赖 `Init`**：内置 Lean 4.35.0 默认不加载 Mathlib，**严禁**在正文、Goal 面板或练习提示里出现 `ring`、`linarith`、`nlinarith`、`norm_num`、`omega`（除非已验证在当前版本 Init 可用，当前算术收尾统一教 `grind` / `decide` / `simp` / `rw`）。
- **工程实战篇（23–27 课）按需挂载扩展包**：依赖 `Std.HashMap` / `Std.TreeMap` 的课程必须在元数据声明 `requires: ['std']`（必要时可含 `'batteries'`），禁止把未声明依赖的模块写进基础课程。
- **正文零未完成代码**：除讲解 `sorryAx` 检测的 `math-axioms`（第 21 课）外，课程正文 `{ kind: 'code' }` **禁止留 `sorry`**；且每道练习不能直接复制正文里已证明过的同名同题定理。

## 2. 教学梯度与 Goal 面板联动格式

- **步骤平滑**：每节引入最多 1–2 个新策略并配可运行的中间台阶，避免跨两跳以上（例如先教 `rfl` + `exact`，再教 `intro` + `apply`，最后串联复合蕴含）。
- **结构化 Goal 块**：`{ kind: 'goal' }` 里的解释性文字统一用 `说明：...` / `Note: ...` 单独成行（由 `src/views/lesson-goal-steps.ts` 收入右侧注释区，不再拆分出伪步骤），步骤动作行尽量与左侧代码块中的对应战术行一致，保证双向点击跳转和高亮精准命中。

## 3. 双语对称、SEO 与同步清单

- **1:1 结构同构**：`src/i18n/lessons-zh.ts` 与 `src/i18n/lessons-en.ts`、`src/i18n/zh.ts` 与 `src/i18n/en.ts` 的块数量、类型与字典结构必须完全一致（`locale-parity.test.ts` 强断言）。
- **SEO 长度合同**：每节课 `title` 与 `lead` 直接决定 SSG 页面的 `<title>` 与 `<meta name="description">`，改完必须跑 `pnpm run build:web && pnpm run verify:build`。
- **目录与 E2E 清单联动**：增删课程或挑战必须同步 `src/i18n/lesson-catalog.ts`、`scripts/e2e-lessons.mjs` 的 `SLUGS` / `CHALLENGE_SLUGS`，以及 `README.md` / `README.en.md` 中的总数声明。

## 4. 改完必跑

```bash
pnpm exec vitest run src/i18n/ src/curriculum-invariants.test.ts src/views/lesson-goal-steps.test.ts
pnpm run verify:docs && pnpm run build:web && pnpm run verify:build
```
