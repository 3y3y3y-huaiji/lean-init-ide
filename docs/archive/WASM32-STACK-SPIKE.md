> **历史归档声明**：本文档记录早期基于 Lean 4.34.1 的 `wasm32` 递归深度与 `-O3` 编译实验日志（归档自 `docs/WASM32-STACK-SPIKE.md`）。生产已迁移至 Lean 4.35.0（见 `.github/workflows/runtime-wasm32-435.yml`）；下文仅保留历史实测数据，请勿作为当前实现与开发规范的直接依据。

# wasm32 递归深度与编译性能 spike 结论（历史归档）

分支：`perf/wasm32-runtime`（历史实验分支，未合入 main）
工作流：4.35 生产工作流 `.github/workflows/runtime-wasm32-435.yml`（4.34 历史工作流已删除）
日期：2026-11-16

## 目标

1. 提高浏览器里 Lean 的可用递归深度（`simp [f]` 等深递归不再轻易爆栈）。
2. 重编 wasm32 运行时，改善启动与编译性能。

## 结论

**递归深度卡在 Chrome Web Worker 的原生栈（约 1MB），不是 wasm 线性栈。**
重编运行时、放大 `-sSTACK_SIZE` / `-sDEFAULT_PTHREAD_STACK_SIZE`、调 Lean `-s` 都无法突破；
默认 `maxRecDepth = 1000` 已经接近浏览器安全上限，继续抬会把可恢复的
`maximum recursion depth has been reached` 变成进程崩溃。

## 当时确立的 4.35 生产决策

正式 wasm32 运行时只保留 **`-O3`**，其余全部保持上游默认：

- `STACK_SIZE`：保持 `16777216`（16MB），不占额外的 32 位线性内存。
- `DEFAULT_PTHREAD_STACK_SIZE` / `LEAN_DEFAULT_THREAD_STACK_SIZE`：保持默认 8MB。
- `maxRecDepth`：保持 1000，不把验证用的 8000 带进正式配置。
- `replace_fn` / `replace_rec_fn`：保持上游原实现，不应用堆栈化补丁。
- CI 额外做 zstd（Node level 19）与 gzip 打包，产出可直接托管的 `lean.mjs` / `lean.wasm.gz.bin`。

## 实测数据（4.34.1 历史样本）

### 递归深度（playground + 本地网关）

| 配置 | 结果 |
| --- | --- |
| 默认 maxRecDepth=1000 | N=500 通过；N=800 报 `maximum recursion depth` |
| maxRecDepth=8000，O3 运行时 | N=1000 通过；N=1200 触发 `RuntimeError: unreachable`；N=1400 触发 `RangeError: Maximum call stack size exceeded` |
| maxRecDepth=8000，8MB Lean 线程栈 | N=1500 触发 `RangeError` |
| maxRecDepth=8000，32MB Lean 线程栈 | 与 8MB 相同的失败区间，深度没有实质提升 |

### 编译性能（Node CLI，同一 harness）

| 指标 | 原运行时（O2） | O3 运行时 | 变化 |
| --- | --- | --- | --- |
| `import Init` 启动（中位数） | 16.5s | 8.5s | -48% |
| 500 条 `simp [f]`（depth 200）总耗时 | 29.6s | 19.8s | -33% |
| 上述 workload 扣除启动后的精化时间 | 13.1s | 11.3s | -14% |
| `lean.wasm` 原始字节 | 113,033,667 | 110,532,156 | -2.5MB |
| `lean.wasm.gz.bin`（zstd 19） | 10,417,830 | 10,453,734 | +36KB |

### replace_fn 堆栈化实验

- 第一层 `replace_fn::apply` 与第二层 `replace_rec_fn::apply` 堆栈化后，第三层 `Lean.Meta.reduceRec` → `instantiateLevelParams` 仍在 N=12000 时爆栈。
- 该路线后来转移到 `wasm64` + 三份堆上续延栈补丁继续推进。
