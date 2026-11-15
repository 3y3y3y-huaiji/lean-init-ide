# wasm32 递归深度与编译性能 spike 结论

分支：`perf/wasm32-runtime`（实验分支，不合并 main）
工作流：`.github/workflows/runtime-wasm32.yml`
日期：2026-11-16

## 目标

1. 提高浏览器里 Lean 的可用递归深度（`simp [f]` 等深递归不再轻易爆栈）。
2. 重编 wasm32 运行时，改善启动与编译性能。

## 结论

**递归深度卡在 Chrome Web Worker 的原生栈（约 1MB），不是 wasm 线性栈。**
重编运行时、放大 `-sSTACK_SIZE` / `-sDEFAULT_PTHREAD_STACK_SIZE`、调 Lean `-s` 都无法突破；
默认 `maxRecDepth = 1000` 已经接近浏览器安全上限，继续抬会把可恢复的
`maximum recursion depth has been reached` 变成进程崩溃。

## 实测数据

### 递归深度（真实 playground + 本地网关）

测试代码：

```lean
import Init

def f : Nat → Nat
  | 0 => 0
  | n + 1 => f n

example : f N = 0 := by simp [f]
```

| 配置 | 结果 |
| --- | --- |
| 默认 maxRecDepth=1000 | N=500 通过；N=800 报 `maximum recursion depth` |
| maxRecDepth=8000，O3 运行时 | N=1000 通过；N=1200 触发 `RuntimeError: unreachable`；N=1400 触发 `RangeError: Maximum call stack size exceeded` |
| maxRecDepth=8000，8MB Lean 线程栈（旧运行时） | N=1500 触发 `RangeError` |
| maxRecDepth=8000，32MB Lean 线程栈 | 与 8MB 相同的失败区间，深度没有实质提升 |

关键点：

- Chrome worker 的原生栈由浏览器创建，`--js-flags=--stack-size` 对 Worker 不生效，
  页面侧也没有标准 API 可以调整。
- Emscripten 的 `DEFAULT_PTHREAD_STACK_SIZE` 会被 Lean 自己的
  `pthread_attr_setstacksize(LEAN_DEFAULT_THREAD_STACK_SIZE)` 覆盖；
  仅改 `thread.cpp` 的常量也只能扩大 wasm 线性栈，原生栈仍然是硬上限。
- 默认 1000 是当前浏览器下可用的安全值；不建议为了“多几轮”把它抬到 1200+。

### 编译性能（Node CLI，同一 harness）

| 指标 | 原运行时（O2） | O3 运行时 | 变化 |
| --- | --- | --- | --- |
| `import Init` 启动（中位数） | 16.5s | 8.5s | -48% |
| 500 条 `simp [f]`（depth 200）总耗时 | 29.6s | 19.8s | -33% |
| 上述 workload 扣除启动后的精化时间 | 13.1s | 11.3s | -14% |
| `lean.wasm` 原始字节 | 113,033,667 | 110,532,156 | -2.5MB |
| `lean.wasm.gz.bin`（zstd 19） | 10,417,830 | 10,453,734 | +36KB |

浏览器侧 22 节课程代码块全部通过，说明 O3 没有破坏常用精化路径。

### replace_fn 堆栈化实验

`scripts/patches/lean-replace-fn-iterative.patch` 把：

- `src/kernel/replace_fn.cpp` 的 `replace_fn::apply`
- `replace_rec_fn::apply`

改成显式堆栈的后序遍历。两版都能编译并通过 `import Init` 冒烟；符号化爆栈栈帧后：

- 第一层：`replace_fn::apply` 递归（已消除）
- 第二层：`replace_rec_fn::apply` 递归（已消除）
- 第三层：`Lean.Meta.reduceRec` → `instantiateLevelParams` → `replace_fn`，仍在 N=12000 时爆栈

即：表达式遍历递归可以堆栈化，但 **WHNF / reduceRec 的递归**才是 `simp [f]` 的真正上限，
需要重写归约机或等上游改进，不是编译参数能解决的。

## 上游线索

Lean 上游 2026-07-07 的变更提到：kernel 的深递归失败改为由 `maxRecDepth` 约束，
而不是原生栈大小，错误会跨平台确定。当前 4.34.1 不包含该改动；后续升级 Lean 时值得复核，
但它改善的是“确定性报错”，不一定会提高可用深度。

## 实验资产

- `perf/wasm32-runtime` 分支的全部提交
- `.github/workflows/runtime-wasm32.yml`：可手动触发（`workflow_dispatch`）的 wasm32 重编流水线
- `scripts/patches/lean-replace-fn-iterative.patch`：堆栈化补丁
- CI 产物：`wasm32-runtime-o3-stack32`（`lean.mjs` + `lean.wasm`）

## 后续可选方向

1. **只上 O3 运行时**：保留 `maxRecDepth=1000`，换取启动/编译性能；需要新建运行时 release、
   更新资产清单、上传 R2/魔搭并跑全量门禁。
2. **继续攻递归深度**：为 `Lean.Meta.reduceRec` / WHNF 设计堆工作栈，或升级到包含
   deep-recursion 改进的上游版本；周期长、风险高。
3. **维持现状**：主线继续使用现有运行时，等上游 Lean 的改动落地。
