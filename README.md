<h3>简体中文 | <a href="README.en.md">English</a></h3>

# Lean Init IDE

在浏览器里跑真正的 Lean 4.35.0 定理证明器。Monaco 编辑器加上完整语言服务器，全部塞进 Web Worker；
不是正则模拟，也不是把代码发到云端。打开网页就能写证明、看诊断、看 Goal，代码不会上传。

在线使用：<https://criticalthinking.de5.net>（备用：<https://lean-init-ide.pages.dev>）

## 30 秒上手

打开 <https://criticalthinking.de5.net>，选一门课，点「运行」。

- 首次会下载约 102MB 运行时（zstd 压缩后），之后走浏览器持久缓存，二次进入通常 4–7 秒可用。
- 需要 cross-origin isolation（COOP/COEP）与 SharedArrayBuffer，Chromium 系浏览器体验最佳。
- 低内存设备（`navigator.deviceMemory ≤ 4`）不会自动下载，需要手动点「启动 Lean」。
- 只想读课程时不必启动引擎：正文直接可看，代码块点「运行」时才会拉起 Lean。

## 为什么不是又一个在线沙盒

单元测试只能测出你写到的那几个用例没错；Lean 能用数学逻辑把所有可能输入一次性证死，
错一步编译器当场红线拦住。

- **真编译器，不是模拟。** Lean 4.35.0 被编译成 WebAssembly，解析、精化、诊断都在页面里完成；
  没有靠正则判断「证明对错」的捷径。
- **诊断与 Goal 实时反馈。** 停手后 LSP 推送诊断；光标停在证明内部，右侧立刻显示当前目标。
- **Init + Std + Batteries 分包。** 默认只下载 Init；工程课按需挂载 Std 与 Batteries，不用时释放内存。
- **27 节课，三条路径。** 从零基础到真实数据结构与状态机，每节都能在页面里直接运行。

## 三条学习路径

| 路径 | 适合谁 | 节数 |
| --- | --- | --- |
| 入门路径 | 零基础，想先摸清交互式证明的手感 | 9 |
| 数学与验证 | 有数学直觉，想把它翻译成 Lean 代码 | 13 |
| 工程实战 | 后端、系统与安全工程师，想验证真实数据结构与状态不变量 | 5 |

## 趣味数学挑战

不想从第一课按顺序学，也可以直接挑一道经典数学题动手：

- `/zh/challenges`、`/en/challenges` 是与系统课程并列的挑战区，每题有独立分享链接
  `/<lang>/challenges/<slug>`，共用同一套运行时与 Service Worker 缓存。
- 页面保留实时 Goal 面板与 `rfl` / `intro` / `rw` / `simp` / `omega` 等快捷策略按钮，
  骨架代码只依赖 Init，不需要理解完整语法也能开始。
- 想换到自己熟悉的编辑器，可打开 `/<lang>/playground?challenge=<slug>`；本机已有草稿时不会静默覆盖。

## 课程

### 入门路径（9 节）

| 课时 | 主题 | 关键动作 |
| --- | --- | --- |
| `what-is-lean` | 会做数学题的编译器 | `#eval`、`#check`、`rfl` |
| `first-proof` | 你的第一个零漏洞证明 | `rfl`、等式即类型 |
| `implication` | 写一个 if…then… 风格的证明函数 | `intro`、`exact` |
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
| `code-sorting` | 证明插入排序永远不会排错 | `Sorted`、成员保持、有序性练习 |
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

## 限制

- 默认只带 **Init**；Std 与 Batteries 是可选扩展包，不含 Lean / Lake / Mathlib。
- 需要 cross-origin isolation（COOP/COEP）与 SharedArrayBuffer，Chromium 系浏览器体验最佳。

## 隐私

站内提供[隐私说明](https://criticalthinking.de5.net/zh/privacy)：运行指标不含 cookie、用户代码或设备指纹，
可在浏览器开启 Do Not Track 退出；页面浏览与 Core Web Vitals 由 Cloudflare Web Analytics 统计。

## 底层架构拆解

- **语言层**：Monaco + `@wasm-idle/lsp`，Lean 4.35.0 跑在 Web Worker 里，LSP 走 postMessage。
- **跨源隔离**：COOP/COEP 与 SharedArrayBuffer 让 wasm 线程模型原样运行，这是「真编译器」的前提。
- **资产层**：Service Worker 经站点同源 `/cdn/` 网关从 R2 按 4MB 分片下载，逐块 SHA-256 校验，
  失败回退 GitHub raw 与静态副本；`Init` 约 102MB，`Std` 约 75MB，`Batteries` 约 5.7MB，按需加载。
- **应用层**：静态站点，路由 / i18n / 主题都在前端；Pages Functions 只提供资产网关与指标接收端。

实现细节见 [架构与运行时分发](docs/ARCHITECTURE.md)。

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

- 改代码前先读 [AGENTS.md](AGENTS.md)：硬约束、模块边界与已知陷阱都在那里
- 一个提交只做一件事；课程代码只能在运行时可加载的范围内（Init，工程课可用 Std / Batteries）
- 用户可见文案必须中英文同时补齐，`locale-parity` 测试会校验键集合

## 文档

- [文档索引](docs/README.md)
- [CI / CD 工作流地图](docs/CI.md)
- [架构与运行时分发](docs/ARCHITECTURE.md)
- [本地开发与质量门禁](docs/DEVELOPMENT.md)
- [部署、指标与排查](docs/OPERATIONS.md)

## 许可证

本项目采用 **双协议**，你可以任选其一：

- [Apache License 2.0](LICENSE-APACHE)
- [木兰宽松许可证，第 2 版](LICENSE-MULAN)（Mulan Permissive Software License v2）

SPDX 标识：`(Apache-2.0 OR MulanPSL-2.0)`。
