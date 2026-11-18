# wasm32 递归深度与编译性能 spike 结论

> 历史记录：以下实验基于 Lean 4.34.1。生产已升级到 Lean 4.35.0
> （`.github/workflows/runtime-wasm32-435.yml`）；结论（Chrome Worker 原生栈上界、
> `maxRecDepth` 1000、只保留 O3）仍然适用。

分支：`perf/wasm32-runtime`（实验分支，不合并 main）
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

## 生产决策

正式运行时只保留 **`-O3`**，其余全部保持上游默认：

- `STACK_SIZE`：保持 `16777216`（16MB），不占额外的 32 位线性内存。
- `DEFAULT_PTHREAD_STACK_SIZE` / `LEAN_DEFAULT_THREAD_STACK_SIZE`：保持默认 8MB。
- `maxRecDepth`：保持 1000，不把验证用的 8000 带进正式配置。
- `replace_fn` / `replace_rec_fn`：保持上游原实现，不应用堆栈化补丁。
- CI 额外做 zstd（Node level 19）与 gzip 打包，产出可直接托管的
  `lean.mjs` / `lean.wasm.gz.bin`。

这样做的依据：大栈和内核补丁都没有提高浏览器可用深度，却会增加内存占用或引入
未验证的表达式遍历语义变化；O3 的启动/编译收益则已在 Node 和 22 节课程里验证。

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

`perf/wasm32-runtime` 分支上的 `scripts/patches/lean-replace-fn-iterative.patch` 把：

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

- `perf/wasm32-runtime` 分支：完整实验记录，包含 `scripts/patches/lean-replace-fn-iterative.patch`
  和 32MB 栈 / profiling 构建参数。
- `spike/wasm32-runtime-ci`（本 PR）：只保留生产用的 `-O3` 构建流水线、zstd 打包和本文档；
  不应用任何内核补丁。
- CI 产物：`wasm32-runtime-o3`（`lean.mjs` / `lean.wasm` / `lean.wasm.gz` /
  `lean.wasm.gz.bin` / `runtime-summary.json` / `SHA256SUMS`）。

## 生产接入步骤

1. 把 `lean.mjs` 和 `lean.wasm.gz.bin` 上传到 R2 / 魔搭的新版本目录（例如 `zo3v1/`），
   不要覆盖线上旧对象。
2. 更新 `config/lean4-runtime.json` 的 `cacheKey`、`key`、`bytes`、`sha256`，
   以及 `producer-receipt.json` 的资产哈希。
3. 跑 `pnpm run fetch:assets`、`verify:manifest`、完整 CI 和浏览器 e2e；
   确认新缓存键下的分片、解压和 LSP 诊断都正常。
4. 合并后再删除旧版本对象；保留回退能力。
