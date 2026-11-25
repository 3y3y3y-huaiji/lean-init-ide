**何时读我**：首次了解项目技术文档地图、查找主题对应文档或核对当前运行时版本基线时阅读。
**单一事实来源**：运行时消费清单见 [lean4-runtime.json](../config/lean4-runtime.json)，课程总数见 [lesson-catalog.ts](../src/i18n/lesson-catalog.ts)。
**维护边界**：只做总索引与版本概览，不复制细节章节；编译器构建与堆栈改造 SOP 见独立仓库 [lean-online/lean4-wasm](https://github.com/lean-online/lean4-wasm)。

# 文档索引

Lean Init IDE 的文档按「先读什么」组织，避免在 README、运维笔记和架构记录之间来回找。

| 文档 | 读它来解决什么 |
| --- | --- |
| [ARCHITECTURE](ARCHITECTURE.md) | 三层边界、运行时资产如何到达浏览器、LSP/Worker 数据流 |
| [DEVELOPMENT](DEVELOPMENT.md) | 本地开发、命令、测试与构建门禁 |
| [OPERATIONS](OPERATIONS.md) | 部署、R2 消费网关、魔搭回退、限流、故障排查 |
| [CI](CI.md) | GitHub Actions 工作流地图、触发条件、secrets |
| [DECISIONS](DECISIONS.md) | 架构决策记录（ADR-01~05：为什么这样设计、禁止回退哪些方案） |

其他入口：

- 项目介绍与 **27** 节双语课程：[README](../README.md) / [English](../README.en.md)
- 参与流程（本地开发、门禁档位、分支与提交规范）：[CONTRIBUTING](../CONTRIBUTING.md)
- AI 协作总地图与技术约束：[AGENTS](../AGENTS.md)
- 运行时工具链仓库（wasm32 / wasm64 编译与资产发布）：[lean-online/lean4-wasm](https://github.com/lean-online/lean4-wasm)

## 当前运行时

- 生产默认：Lean **4.36.0** Init（`-O3`，wasm32），**Std / Batteries 已在生产按需加载**（工程课通过 `requires` 自动挂载，编辑器支持按需加载与手动释放）
- 实验性分支运行时：wasm64（Memory64 + GMP，消费端配置在 `config/lean4-wasm64-runtime.json`），编译器构建与升级流程维护在 [lean-online/lean4-wasm](https://github.com/lean-online/lean4-wasm)
- 资产清单：[config/lean4-runtime.json](../config/lean4-runtime.json)（约 102 MB zstd 分片，含 `extensions` 扩展分包）与 [config/lean4-wasm64-runtime.json](../config/lean4-wasm64-runtime.json)
