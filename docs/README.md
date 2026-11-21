**何时读我**：首次了解项目技术文档地图、查找主题对应文档或核对当前运行时版本基线时阅读。
**单一事实来源**：运行时版本见 [lean4-runtime.json](../config/lean4-runtime.json) 与 [pin-lean.ts](../scripts/pin-lean.ts)，课程总数见 [lesson-catalog.ts](../src/i18n/lesson-catalog.ts)。
**维护边界**：只做总索引与版本概览，不复制细节章节；历史实验过程文档统一存放在 [archive/](archive/)。

# 文档索引

Lean Init IDE 的文档按「先读什么」组织，避免在 README、运维笔记和实验记录之间来回找。

| 文档 | 读它来解决什么 |
| --- | --- |
| [ARCHITECTURE](ARCHITECTURE.md) | 三层边界、运行时资产如何到达浏览器、LSP/Worker 数据流 |
| [DEVELOPMENT](DEVELOPMENT.md) | 本地开发、命令、测试与构建门禁 |
| [OPERATIONS](OPERATIONS.md) | 部署、资产上传、R2 / 魔搭、限流、故障排查 |
| [CI](CI.md) | GitHub Actions 工作流地图、触发条件、secrets、发布步骤 |
| [DECISIONS](DECISIONS.md) | 架构决策记录（ADR-01~05：为什么这样设计、禁止回退哪些方案） |
| [WASM64-SPIKE](WASM64-SPIKE.md) | 实验性 wasm64：版本 pin（默认 4.36.0-rc2）与升级 SOP、三份栈补丁、差分门禁 |
| [archive/WASM32-STACK-SPIKE](archive/WASM32-STACK-SPIKE.md) | 历史归档（4.34.1 wasm32 栈深与 O3 基准实验） |
| [archive/WASM64-SPIKE-EXPERIMENTS](archive/WASM64-SPIKE-EXPERIMENTS.md) | 历史归档（wasm64 早期踩坑日志、tail-call 审计与探针数据） |

其他入口：

- 项目介绍与 **27** 节双语课程：[README](../README.md) / [English](../README.en.md)
- AI 协作总地图与技术约束：[AGENTS](../AGENTS.md)

## 当前运行时

- 生产默认：Lean **4.35.0** Init（`-O3`，wasm32），**Std / Batteries 已在生产按需加载**（工程课通过 `requires` 自动挂载，编辑器支持按需加载与手动释放）
- 实验性分支运行时：Lean **4.36.0-rc2** wasm64（Memory64 + GMP），版本 pin 在 `scripts/pin-lean.ts`，可用 `LEAN_PIN_*` 覆盖；现行规范见 [WASM64-SPIKE](WASM64-SPIKE.md) 与 [ADR-03](DECISIONS.md#adr-03)
- 资产清单：[config/lean4-runtime.json](../config/lean4-runtime.json)（约 102 MB zstd 分片，含 `extensions` 扩展分包）与 [config/lean4-wasm64-runtime.json](../config/lean4-wasm64-runtime.json)
