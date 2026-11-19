# 文档索引

Lean Init IDE 的文档按「先读什么」组织，避免在 README、运维笔记和实验记录之间来回找。

| 文档 | 读它来解决什么 |
| --- | --- |
| [ARCHITECTURE](ARCHITECTURE.md) | 三层边界、运行时资产如何到达浏览器、LSP/Worker 数据流 |
| [DEVELOPMENT](DEVELOPMENT.md) | 本地开发、命令、测试与构建门禁 |
| [OPERATIONS](OPERATIONS.md) | 部署、资产上传、R2 / 魔搭、限流、故障排查 |
| [CI](CI.md) | GitHub Actions 工作流地图、触发条件、secrets、发布步骤 |
| [WASM32-STACK-SPIKE](WASM32-STACK-SPIKE.md) | 历史实验：wasm32 递归栈上界与 O3/栈参数结论 |
| [WASM64-SPIKE](WASM64-SPIKE.md) | wasm64 运行时：版本 pin（默认 4.36.0-rc2）与升级、三处栈补丁、差分行为门禁、按需 Mathlib 裁切 |

其他入口：

- 项目介绍与课程：[README](../README.md) / [English](../README.en.md)
- 协作约定与技术约束：[AGENTS](../AGENTS.md)

## 当前运行时

- 生产：Lean **4.35.0** Init，`-O3`，栈参数与 `maxRecDepth` 保持默认
- 实验：Lean **4.36.0-rc2** wasm64（Memory64 + GMP），版本 pin 在 `scripts/pin-lean.ts`，
  可用 `LEAN_PIN_*` 覆盖；三处热点栈补丁 + 差分行为门禁见 [WASM64-SPIKE](WASM64-SPIKE.md)
- 资产清单：[config/lean4-runtime.json](../config/lean4-runtime.json)，约 102 MB（zstd 压缩后）
- Std / Batteries 的按需扩展在 `spike/std-batteries` 分支验证中，默认仍只加载 Init
