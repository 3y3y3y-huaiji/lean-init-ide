# wasm64 运行时 spike 结论

分支：`spike/wasm64`（实验分支）
工作流：`.github/workflows/spike-wasm64.yml`
日期：2026-11-15

## 目标

把 Lean 4.34.1 浏览器运行时从 wasm32 改成真 64 位 WebAssembly（Emscripten `MEMORY64=1`），复用官方 64 位 Init olean，跟随官方 Lean 版本。

## 结论

**跑通了。** 在无头 Chrome（157）里：

```
version:      ok=true  code=0
compile-init: ok=true  code=0   oleanCount=1947
probe.olean   exists=true size=1688
```

即 wasm64 运行时 + 自建 64 位 Init oleans + `import Init` 编译（`example : 1 + 1 = 2 := rfl`）全部成功。

关键前提有三个：`-O2` 构建、backport 上游的标量字面量修复、用 wasm64 Lean 自己生成 oleans。

## 踩过的坑（按发现顺序）

### 1. `LEAN_SCALAR_PTR_LITERAL` 按工具链而不是指针宽度分支

v4.34.1 里：

```c
#ifdef LEAN_EMSCRIPTEN
#define LEAN_SCALAR_PTR_LITERAL(...)   // 4 字节形式
#else
#define LEAN_SCALAR_PTR_LITERAL(...)   // 8 字节形式
#endif
```

wasm64 下走了 4 字节形式，静态常量里的 `Name` 哈希被截断成 32 位，而运行时构造的 `Name` 是 64 位，`PersistentHashMap` 按哈希分桶直接 miss。表现是 `unknown parser category `level``。

证据：同一个 `level`，静态常量哈希 `1601329144`，运行时哈希 `18250387975948097528`，前者正好是后者的低 32 位。

上游已修：issue #15814 / PR #15816（改为 `#if UINTPTR_MAX == UINT32_MAX`，2026-10-25 合入 master），没有任何 rc/稳定版包含该修复，需要 backport 一行。

### 2. `-O0` 下无法编译任何 Lean 代码

`-O0` 时连 `def one : Nat := 1` 都失败：

```
RuntimeError: memory access out of bounds      （提高初始内存后变成）
RangeError: Maximum call stack size exceeded   （getHeadInfo? 深递归 + lean_alloc）
```

排除过：初始内存 256MB→2GB、Emscripten 池栈 8MB→64MB、`thread.cpp` 的 `LEAN_DEFAULT_THREAD_STACK_SIZE` 8MB→64MB，均无效。

**改回 `-O2` 后 649 个 Init 模块全部编译成功**。`-O0` 下帧膨胀/代码生成是直接原因，不需要改运行时。

### 3. 官方 olean 是 GMP 编码

```
failed to read file '/lean/lib/lean/Init.olean', incompatible header
```

头校验只有 `version`、`flags`、`githash` 三项，githash 已对齐（`5045d005...`），`flags` 只有一位：GMP。官方 Linux 包 `USE_GMP=ON`（flags=1），producer 的 wasm 构建 `-DUSE_GMP=OFF`（flags=0）。

因此放弃复用官方 olean，改为用这个 wasm64 Lean 自己编译 Init（producer 自带的 `oleans` 阶段），得到 flags=0 的 64 位 oleans。

### 4. 浏览器侧的三个加载细节

- `Init.olean.server` 必须一起提供：Lean 默认 `inServer=true`，会加载 `.olean.server`；清单生成原来只遍历 `Init/` 子目录，漏了根目录的 `Init.olean.server`
- `-sEXIT_RUNTIME=1` 下 `callMain` 用 `ExitStatus` 异常退出，harness 需要捕获并把 `status` 当作退出码
- Lean 启动会解析 appPath/libdir，即使 `--version` 也要先建好 `/lean/bin`、`/lean/lib/lean`

## 当前产物与缓存

| 名称 | key |
| --- | --- |
| emsdk | `wasm64-emsdk-6.0.0-v1` |
| Lean 源码与引导包 | `wasm64-src-v4` |
| runtime（-O2） | `wasm64-runtime-v10` |
| cgen | `wasm64-cgen-v1` |
| objects（-O2） | `wasm64-obj-v7` |
| 64 位 oleans | `wasm64-oleans-v2`（约 117MB） |

`work/dist` 下有 `lean.mjs` / `lean.wasm`（含 pthread worker），`work/olean32` 是 1947 个 64 位 olean/server/ilean 文件。

## 尚未验证

- 浏览器 LSP：本次只验证了 CLI 编译，`--server`/LSP 路径还没在 wasm64 下跑
- 内存占用与性能：`-O2` + memory64 + 1GB 上限下的实际峰值未测
- `-O2` 下 649 个模块的编译时间与缓存策略（当前 oleans 阶段单进程）
- 与 Mathlib 的兼容性（下一步更有价值的验证）

## 复现

```bash
git checkout spike/wasm64
git push origin spike/wasm64
gh run watch
```

诊断插桩在 `finish` job 的「在 Level 初始化里插入 Name / 查表探针」步骤，属于临时诊断代码；`-O2` 与三处 backport（lean.h、environment.cpp、thread.cpp）是实际生效的修改。
