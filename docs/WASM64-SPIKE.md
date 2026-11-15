# wasm64 运行时 spike 结论

分支：`spike/wasm64`（实验分支，不合并）
工作流：`.github/workflows/spike-wasm64.yml`
日期：2026-11-15

## 目标

把 Lean 4.34.1 浏览器运行时从 wasm32 改成真 64 位 WebAssembly（Emscripten `MEMORY64=1`），以便：

- 复用官方 64 位 Init olean，不再自己编译 649 个模块
- 跟随官方 Lean 版本，减少自维护成本

## 结论

**当前不可行。** 真 wasm64 的工具链、链接、模块实例化、Lean 初始化全部走通，但运行时的 64 位语义仍有多处不成立：

1. Lean 编译器生成的静态常量把 `Name` 哈希截断成 32 位（上游 #15814，已在 PR #15816 修复，未进入任何 rc/稳定版）
2. 官方 64 位 olean 用 GMP 编码（`flags=1`），wasm 构建是 `USE_GMP=OFF`（`flags=0`），头校验直接拒绝
3. **wasm64 运行时只要执行编译就非法内存访问**：连不 import 任何模块的最小文件都会 `memory access out of bounds`，而 `lean --version` 可以通过；调整初始内存、Emscripten 池栈、Lean 自身线程栈默认值均无效

第 3 点是决定性的：`-O0` 是保守构建、不是越界来源；GMP 编码也与该崩溃无关。问题在运行时本身的 64 位语义，不是构建参数或 olean 格式能绕过的。

## 已验证成立的部分

- Emscripten 6.0.0 + `MEMORY64=1` + pthreads：`memory64` / `memory64Shared` 探针在 Node 24 与 Chrome 157 通过
- libuv 用 `MEMORY64=1` 重建后可正常链接
- Lean 运行时与 649 个 Init 模块的目标文件可编译、可链接
- 浏览器内模块实例化成功，进入 `lean_main`
- Lean 初始化全部通过（`Init`、`Std`、`Lean.Data`、`Environment`、`Compiler`、`Attributes`、`Parser.*`）
- `lean --version` 正常输出：`Lean (version 4.34.1, wasm32-unknown-emscripten, commit 5045d005...)`

## 排查过程与证据

### 1. 最初的失败：unknown parser category `level`

失败点在 `runtime_initialize_Lean_Parser_Level`：先注册 `Category.level`，紧接着注册 `paren` 时报 category 不存在。

排除过程：

| 假设 | 排除方式 |
| --- | --- |
| Node 宿主差异 | 改用 runner 自带 Chrome 157 无头验证，表现一致 |
| argv 传参 | 修正 `callMain` 参数后仍然失败（当时是真实 init 错误） |
| olean 不兼容 | `--version` 不加载任何 olean 也失败 |
| 优化器误编译 | 全量 `-O0` 重编，错误不变 |
| 注册顺序错误 | 对照官方 `stage0/stdlib/Lean/Parser/Level.c`，顺序正确 |
| 注册表写入丢失 | 探针用运行时新建的等价 `level` Name 查表，命中（`is_error=0`） |
| Name 相等性/哈希 | 两个独立构造的 `level`：`eq=1`，哈希相同 |

最终定位：同一个逻辑名字，静态常量与运行时构造的哈希不一致。

```
运行时构造的 "level": 18250387975948097528 = 0fd46672b5f7257f8
静态常量里的 "level": 1601329144          =         b5f7257f8
```

后者正好是前者的低 32 位。`lean.h` 中 `lean_name_hash_ptr` 读取 `Name` 对象里缓存的 `uint64` 哈希；而静态常量由 `LEAN_SCALAR_PTR_LITERAL` 写入：

```c
#ifdef LEAN_EMSCRIPTEN
#define LEAN_SCALAR_PTR_LITERAL(...)  // 两个 4 字节槽
#else
#define LEAN_SCALAR_PTR_LITERAL(...)  // 一个 8 字节槽
#endif
```

v4.34.1 按 `LEAN_EMSCRIPTEN` 而不是按指针宽度选择，wasm64 下走了 4 字节形式，哈希被截断。

上游已修：issue #15814 / PR #15816（改为 `#if UINTPTR_MAX == UINT32_MAX`），2026-10-25 合入 master。

### 2. backport 之后：初始化通过

把上面两处修复（还有 #14886 的 `lean_kernel_diag_is_enabled` 声明）backport 到 4.34.1 后：

- 所有探针哈希一致（`18250387975948097528`）
- `paren`、`max`、`imax` 等注册全部通过
- Lean 启动并打印版本

### 3. 官方 olean：GMP 编码不兼容

```
failed to read file '/lean/lib/lean/Init.olean', incompatible header
```

头校验只有三处：`version`（2/3）、`flags`、`githash`。githash 已对上（`5045d005...`），`flags` 只有一位：GMP 编码。

- 官方 Linux 包：`USE_GMP=ON` → `flags=1`
- producer 的 wasm 构建：`-DUSE_GMP=OFF` → `flags=0`

Emscripten 没有 GMP port，把 GMP 编进 wasm64 需要自己交叉编译，且 limb 宽度能否与官方编码一致没有保证。

### 4. 自建 64 位 oleans：运行时崩溃

改用 producer 自带的 `oleans` 阶段（`build-oleans.mjs`，由这个 wasm64 Lean 自己编译 Init）：

```
RuntimeError: memory access out of bounds
    at lean::task_manager::spawn_worker()
    ...
    0 个模块成功
```

排除栈大小因素：

| 调整 | 结果 |
| --- | --- |
| `-sINITIAL_MEMORY` 256MB → 2GB（避免共享内存增长） | OOB 变成 `Maximum call stack size exceeded`（`getHeadInfo?` + `lean_alloc`） |
| `-sDEFAULT_PTHREAD_STACK_SIZE` 8MB → 64MB | 不变 |
| `runtime/thread.cpp` 的 `LEAN_DEFAULT_THREAD_STACK_SIZE` 8MB → 64MB（wasm64 仍走 `LEAN_EMSCRIPTEN` 的 8MB 分支） | 不变 |

### 5. 最小文件探针：编译任意文件就崩

```
def one : Nat := 1
```

不 import 任何模块，`run-lean.mjs` 下依然 `memory access out of bounds`，退出码 1。

结论：不是 `Init.Prelude` 的递归深度问题，而是 **wasm64 运行时只要进入编译流程就出现非法内存访问**；`lean --version` 这类几乎不碰编译器/分配器的路径能通过。`-O0` 是保守构建，不是 OOB 的来源；GMP 也与该崩溃无关。

顺带在 `LEAN_EMSCRIPTEN` 扫描中确认了同类位宽假设：

```c
// src/runtime/thread.cpp
#ifdef LEAN_EMSCRIPTEN
#define LEAN_DEFAULT_THREAD_STACK_SIZE 8*1024*1024 // 8MB for 32-bit
#else
#define LEAN_DEFAULT_THREAD_STACK_SIZE 1024*1024*1024 // 1GB for 64-bit
#endif
```

以及 `lean_kernel_diag_is_enabled` 的 `uint8*`/`uint8` 声明不一致（上游 #14886，rc2 已含）。

## 上游状态

| 修复 | v4.35.0 | v4.36.0-rc2 | master / nightly |
| --- | --- | --- | --- |
| #14886 `lean_kernel_diag_is_enabled` 声明 | ❌ | ✅ | ✅ |
| #15814 / #15816 `LEAN_SCALAR_PTR_LITERAL` | ❌ | ❌ | ✅ |

没有任何 rc/稳定版同时包含两项。升级到 `v4.36.0-rc2` 仍需 backport 哈希那一行，且要 rebase producer 的 Emscripten 补丁（4.37 nightly 上实测 8 个文件冲突）。

## 建议

- 主线保持 wasm32 + Init-only 自建 olean，浏览器内 LSP 继续正常演进
- 若要再试 wasm64，前置条件是 Lean 上游先做到：统一 64 位 Name 哈希、修掉剩余指针宽度假设、并在 wasm64 下跑通 `Init.Prelude` 的自编译
- Mathlib 能力继续走「文档对照 + 最小裁切库」路线

## 复现方式

```bash
git checkout spike/wasm64
git push origin spike/wasm64
gh run watch
```

诊断插桩在 `finish` job 的「在 Level 初始化里插入 Name / 查表探针」步骤，属于临时诊断代码，不进入主线。

## 相关缓存键

| 名称 | key |
| --- | --- |
| emsdk | `wasm64-emsdk-6.0.0-v1` |
| Lean 源码与引导包 | `wasm64-src-v4` |
| runtime | `wasm64-runtime-v8` |
| cgen | `wasm64-cgen-v1` |
| objects | `wasm64-obj-v6` |
| 64 位 oleans | `wasm64-oleans-v1` |
