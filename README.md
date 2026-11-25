<h3>简体中文 | <a href="README.en.md">English</a></h3>

# Lean Init IDE

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/lean-online/lean-init-ide/badge)](https://scorecard.dev/viewer/?uri=github.com/lean-online/lean-init-ide)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/17023/badge)](https://www.bestpractices.dev/projects/17023)
[![阮一峰周刊 #420](https://img.shields.io/badge/%E9%98%AE%E4%B8%80%E5%B3%B0%E5%91%A8%E5%88%8A-%E7%AC%AC420%E6%9C%9F%E6%94%B6%E5%BD%95-orange)](https://github.com/ruanyf/weekly/blob/master/docs/issue-420.md)

**在浏览器里，跑一个真的定理证明器。**

不是演示，不是正则模拟，也不是把你的代码悄悄发到云端。Lean 4.35.0 被编译成 WebAssembly，
连同完整的语言服务器一起塞进一个 Web Worker。你写下证明，编译器当场判对错；而你的代码，
从来没有离开过这台电脑。

写错一步，它会立刻用红线拦住你；写对了，它只会冷冷地回一句 `no goals`。
现在不仅内置 `Init`，还能按需挂载与释放 `Std` 与 `Batteries`，覆盖 **27 节双语课程**、**趣味数学挑战**与**全屏编辑器**。

在线使用：<https://criticalthinking.de5.net>（备用：<https://lean-init-ide.pages.dev>）

## 30 秒上手

打开 <https://criticalthinking.de5.net>，先看再写，按需加载：

- **不用下载也能先体验**：首页「先看 5 秒」零下载演示直接展示 `⊢` 目标一步步消失的过程；每节课程正文与右侧 **Goal 演练面板**也可免下载阅读与逐步推演。
- **点「运行」拉起真编译器**：首次启动会下载约 102MB 运行时（Init，zstd 压缩后分片校验），之后走浏览器持久缓存，二次进入通常 4–7 秒可用。
- **设备与流量友好**：低内存设备（`navigator.deviceMemory ≤ 4`）与开启省流模式时不会自动下载，需手动点「启动 Lean」；需要 cross-origin isolation（COOP/COEP）与 `SharedArrayBuffer`，Chromium 系浏览器体验最佳，桌面端与手机端均已适配。

## 它和别的在线沙盒差在哪

代几个数试一试，只能证明那几个样例没错；Lean 用数学逻辑，把所有可能的输入一次性证死。

- **真编译器，不是模拟。** Lean 4.35.0 编译成 WebAssembly，解析、精化与诊断全在浏览器本地 Web Worker 里完成，没有任何「用正则猜证明对不对」的捷径。
- **全流程 Goal 与实时诊断。** 全部 27 节课程均配有右侧 **Goal 步骤演练面板**，运行页面代码块时还会将真实诊断与实时 `⊢` 状态同步回面板；从课后作业或趣味挑战进入编辑器时，顶部自动保留当前题干与折叠提示，不再切过去就忘题。
- **Init + Std + Batteries 按需分包。** 默认只下载 `Init`；工程实战课与编辑器按需挂载 `Std`（约 75MB）与 `Batteries`（约 5.7MB），用完即可手动释放内存。
- **27 节课 + 趣味数学挑战。** 三条渐进路径从零基础一直讲到真实数据结构与状态机，外加开箱即用的经典数学挑战题。

## 三条学习路径

| 路径 | 适合谁 | 节数 |
| --- | --- | --- |
| 入门路径 | 零基础，用生活直觉先摸清交互式证明与 `⊢` 手感 | 9 |
| 数学与验证 | 有数学直觉，想把它翻译成严格的形式化证明 | 13 |
| 工程实战 | 后端、系统与安全工程师，验证数据结构与状态不变量 | 5 |

<details>
<summary>展开查看全部 27 节课程目录</summary>

### 入门路径（9 节）

| 课时 | 主题 | 关键动作 |
| --- | --- | --- |
| `what-is-lean` | 会做数学题的编译器 | `#eval`、`#check`、`rfl` |
| `first-proof` | 你的第一个零漏洞证明 | 读 `⊢` 上下文与目标、`rfl`、`exact` |
| `implication` | 写一个 if…then… 风格的证明函数 | `intro`、`apply`、`exact` |
| `connectives` | 打包与拆包：∧ 与 ∨ | `⟨hp, hq⟩`、`h.1` / `h.2`、`cases` |
| `induction` | 多米诺骨牌：归纳就是递归 | `induction ... with`、`simp only` |
| `rewrite` | Ctrl+H 精准替换 | `rw [Nat.add_comm]`、`rw [h]` |
| `simp` | 一键扫尾 | `simp`、`simp only [Nat.succ_add]` |
| `quantifiers` | 全称 ∀ 与存在 ∃ | 把 `∀` 当函数、`⟨n, 证明⟩`、拆存在量词 |
| `list-structure` | 自己造数据结构 | List 的 `nil` / `cons`、`structure`、`#eval` |

### 数学与验证（13 节）

| 课时 | 主题 | 关键动作 |
| --- | --- | --- |
| `math-proof-style` | 中文草稿纸翻译成 Lean | `rcases`、`refine`、`by_cases`、`induction` |
| `math-divisibility` | 整除是「能写成乘法」 | `∣` 的存在性定义、传递性、`dvd_add` |
| `math-parity` | 奇偶的第一道完整证明 | `Even` / `Odd`、拆存在量词、`grind` |
| `math-gcd` | 描述最大公约数，而不只是算出来 | `IsGcd`、`Nat.gcd` 的规格证明、唯一性 |
| `math-primes` | 反证法怎么写 | `Prime` 定义、反证、任意因子 |
| `math-sets` | 集合是返回 Prop 的判断函数 | 谓词式集合、`Subset`、并集 |
| `math-functions` | 单射、满射、双射 | 函数性质、复合保持单射 / 满射 |
| `math-relations` | 等价关系：分类的三大铁律 | `IsEquivalence`、长度相同的等价关系 |
| `math-strong-induction` | 强归纳与斐波那契 | `Nat.strongRecOn`、指数上界 |
| `code-sorting` | 证明插入排序永远不会排错 | `Sorted`、`sorted_insert`、`mem_sort` |
| `code-sum` | 两段数组拼起来求和为什么相等 | `sum`、`sum_append`、结构归纳 |
| `math-axioms` | 作弊检测器：`sorry` 与 `#print axioms` | `#print axioms`、`sorryAx` |
| `math-mathlib` | 从浏览器沙盒走进 Mathlib | 内置库边界、本地完整工具链 |

### 工程实战（5 节，基于 Std + Batteries）

| 课时 | 主题 | 关键动作 |
| --- | --- | --- |
| `eng-hashmap` | 告别 KeyNotFound 与运行期 Panic | `Std.HashMap`、`k ∈ m`、`m[k]'h` |
| `eng-bitvec` | 位运算与整数溢出防线 | `BitVec`、`UInt32` / `UInt64`、`decide`、`Nat.mod_eq_of_lt` |
| `eng-rbmap` | 不只是玩具链表：有序树 | `Std.TreeMap`、`insert` / `get?`、插入后查找性质 |
| `eng-array-bounds` | 消除数组越界 | `Array.getElem?_eq_getElem`、把 `i < arr.size` 写进签名 |
| `eng-state-machine` | 状态机与账本守恒 | `structure` + `HashMap`、`transfer`、总余额守恒、余额非负 |

</details>

## 趣味数学挑战

不想按顺序从第 01 课学起，也可以直接挑一道经典数学题动手：

- `/zh/challenges`、`/en/challenges` 按「⚡ 自由竞技场 / ⚖️ 真假审判庭 / 🔧 契约漏洞猎人 / 👑 人类未解猜想厅」四大主题分区，每道题提供独立可分享链接 `/<lang>/challenges/<slug>`，共用同一套运行时与 Service Worker 缓存。
- 点击「出招卡」会把编辑器里的 `sorry` 智能替换成完整可编译的证明；真假审判庭先选「判真 / 判假」的独立立场模板，零语法门槛也能纯点鼠标通关。骨架只依赖 `Init`。
- 点击跳转 `/<lang>/playground?challenge=<slug>` 会在顶部固定保留题面，本机已有个人草稿时不会静默覆盖。

## 限制

- 默认（wasm32）只带 **Init**；Std 与 Batteries 是可选扩展包。
- 实验性 wasm64 运行时可按需加载 **Std / Lean 核心** 与 **Mathlib 教学子集**（183 个模块，含 `Mathlib.Order.Basic`、`Mathlib.Tactic.Spread`），不是完整 Mathlib；默认仍走 wasm32。
- 需要 cross-origin isolation（COOP/COEP）与 SharedArrayBuffer，Chromium 系浏览器体验最佳。

## 隐私

站内提供[隐私说明](https://criticalthinking.de5.net/zh/privacy)：运行指标不含 cookie、用户代码或设备指纹，
可在浏览器开启 Do Not Track 退出；页面浏览与 Core Web Vitals 由 Cloudflare Web Analytics 统计。

## 底层架构拆解

- **语言层**：Monaco + `@wasm-idle/lsp`，Lean 4.35.0 跑在 Web Worker 里，LSP 走 postMessage。
- **跨源隔离**：COOP/COEP 与 SharedArrayBuffer 让 wasm 线程模型原样运行，这是「真编译器」的前提。
- **资产层**：Service Worker 经站点同源 `/cdn/` 网关从 R2 按 4MB 分片下载，逐块 SHA-256 校验，
  失败回退魔搭镜像与同源静态副本；`Init` 约 102MB，`Std` 约 75MB，`Batteries` 约 5.7MB，按需加载。
- **应用层**：静态站点，路由 / i18n / 主题都在前端；Pages Functions 只提供资产网关与指标接收端。

实现细节见 [架构与运行时分发](docs/ARCHITECTURE.md)；wasm32 / wasm64 编译器构建与资产发布工具链已拆分为独立仓库 [lean-online/lean4-wasm](https://github.com/lean-online/lean4-wasm)。

## 本地开发

```bash
pnpm install         # 安装依赖并应用 patches/ 里的 @wasm-idle/lsp 补丁
pnpm run dev         # 开发服务器（首次会下载并校验运行时资产）
pnpm run build:web   # 只构建前端，跳过运行时资产下载
pnpm test            # Vitest + 覆盖率阈值
pnpm run smoke       # 线上冒烟，发版后跑
```

提交前要跑完整门禁，命令与覆盖率阈值见 [本地开发](docs/DEVELOPMENT.md#质量门禁)。

## 贡献

帮它变得更好，从这几处入手：

- 改代码前先读 [AGENTS.md](AGENTS.md)：硬约束、模块边界与已知陷阱都在那里
- 一个提交只做一件事；课程代码只能在运行时可加载的范围内（Init，工程课可用 Std / Batteries）
- 用户可见文案必须中英文同时补齐，`locale-parity` 测试会校验键集合

## 联系、讨论与反馈

反馈与协作请优先走公开渠道，这样别人也能搜到答案，维护者也不用重复回答：

- **公开讨论与社区共创（[Discussions](https://github.com/lean-online/lean-init-ide/discussions)）**：查看/参与[项目路线图与公开 TODO（#74）](https://github.com/lean-online/lean-init-ide/discussions/74)、[Proof Arcade 题库共创征集（#75）](https://github.com/lean-online/lean-init-ide/discussions/75)，或在 [Ideas](https://github.com/lean-online/lean-init-ide/discussions/categories/ideas) 提出想法。
- **发现 Bug、课程内容有误、追踪已知待办** → 去 [Issues](https://github.com/lean-online/lean-init-ide/issues) 提交或认领（如 `wasm32 v4.36.0` 升级 [#76](https://github.com/lean-online/lean-init-ide/issues/76)、`wasm64` Mathlib 扩展依赖 [#77](https://github.com/lean-online/lean-init-ide/issues/77)），附上复现步骤或页面链接。
- **已经想好怎么改** → 直接开 [Pull Request](https://github.com/lean-online/lean-init-ide/pulls)，先读 [AGENTS.md](AGENTS.md) 再动手。
- **别的正经事情**（合作、授权、安全问题等不方便公开的内容）→ 发邮件到 <sumingkai1@outlook.com>。

简单说：能用 Discussion / Issue / PR 解决的，就别发邮件；邮箱留给真的不适合公开讨论的事。

## 文档

- [文档索引](docs/README.md)
- [架构决策记录（ADR）](docs/DECISIONS.md)
- [CI / CD 工作流地图](docs/CI.md)
- [架构与运行时分发](docs/ARCHITECTURE.md)
- [本地开发与质量门禁](docs/DEVELOPMENT.md)
- [部署、指标与排查](docs/OPERATIONS.md)

## 许可证

本项目采用 **双协议**，你可以任选其一：

- [Apache License 2.0](LICENSE)
- [木兰宽松许可证，第 2 版](LICENSE-MULAN)（Mulan Permissive Software License v2）

SPDX 标识：`(Apache-2.0 OR MulanPSL-2.0)`。
