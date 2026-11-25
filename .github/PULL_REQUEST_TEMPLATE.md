<!-- 标题请用 <type>(<scope>): 一句话结论，例如 fix(panel): 诊断面板不再被日志挤成一条 -->

## 变更摘要

<!-- 一段话说清楚：改了什么、为什么改、用户能感知到什么变化 -->

## 关联

<!-- Closes #123 / 关联 Discussion #74 / 依赖 lean4-wasm PR -->
<!-- 注意：运行时与编译器议题即使改动在 lean4-wasm，也在本仓追踪 -->

## 变更类型

- [ ] 修复（行为不符合预期）
- [ ] 新功能或交互改进
- [ ] 课程 / 挑战内容
- [ ] 文档与协作规范
- [ ] CI / 工程化 / 依赖
- [ ] 运行时消费链路或资产清单（请额外说明 `cacheKey` 与回退）

## 验证方式

<!-- 本地跑过的勾上，其余交给 CI · 应用 自动跑；纯文档改动走 docs-check 档 -->

- [ ] `pnpm run verify:docs`
- [ ] `pnpm run format:check`
- [ ] `pnpm run lint`
- [ ] `pnpm run typecheck`
- [ ] `pnpm test`
- [ ] `pnpm run e2e`（编辑器 / 运行时链路）
- [ ] `pnpm run e2e:lessons`（课程代码块）
- [ ] 只跑了 / 只改了文档，交给 CI 验证

## 红线自查（详见 AGENTS.md 第 3 节）

- [ ] 未破坏 COOP / COEP 与 `SharedArrayBuffer`，未新增用户可访问的第二 origin
- [ ] 未改动 CSP 核心放行项（`'wasm-unsafe-eval'`、`blob:`、`https://*.modelscope.cn`、`data:`）
- [ ] 若动了 `config/` 清单：字节数、SHA-256、`cacheKey` 与 `public/wasm-lean4/` 副本、R2 上传均已同步
- [ ] 若动了运行时 worker：`scripts/patch-lsp.mjs` 的 `workerReceipt` 已重算，未误改基础 `cacheKey`
- [ ] 遥测未新增用户代码、cookie 或设备指纹字段
- [ ] 用户可见文案中英同步（`locale-parity` 会校验）

## 截图 / 录屏（可选）

<!-- 交互或视觉改动请附上，移动端与桌面端差异也一并说明 -->
