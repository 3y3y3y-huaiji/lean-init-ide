# wasm64 运行时 spike 结论

分支：`spike/wasm64`（实验分支，不合并）
工作流：`.github/workflows/spike-wasm64.yml`
日期：2026-11-15

## 目标

把 Lean 4.34.1 浏览器运行时从 wasm32 改成真 64 位 WebAssembly（Emscripten `MEMORY64=1`），以便：

- 复用官方 64 位 Init olean，不再自己 cgen + 编译 649 个模块
- 跟随官方 Lean 版本，减少自维护成本

## 结论

**当前不可行。** 真 wasm64 的构建链已经打通，但 Lean 的 `Name` 缓存哈希在静态常量与运行时构造之间位宽不一致，导致所有以 `Name` 为键的哈希表（parser category、环境常量表等）在 wasm64 下必然查不到条目。这是 Lean 上游问题，不是构建配置能绕过的。

## 已验证成立的部分

- Emscripten 6.0.0 + `MEMORY64=1` + pthreads：`memory64` 与 `memory64Shared` 探针在 Node 24 和 Chrome 157 下都通过
- libuv 用 `MEMORY64=1` 重建后可与 Lean 对象一起链接
- 整个 Lean 运行时可编译、可链接（含 649 个 Init 模块的目标文件）
- 浏览器内模块实例化成功，`createLean ok`，能进入 `lean_main`
- 官方 64 位 Init oleans（1297 个文件 / 402MB）能正常写入 MEMFS 并被读取
- `Init`、`Std`、`Lean.Data`、`Lean.Environment`、`Lean.Compiler`、`Lean.Attributes`、`Lean.Parser.Basic` 的初始化全部通过

## 失败点与证据链

### 1. 失败点

```
initialize_Lean_Parser_Level
└─ runtime_initialize_Lean_Parser_Level
   ├─ runtime_initialize_Lean_Parser_Extra            ✅
   ├─ initFn_00 → registerBuiltinParserAttribute ... Category.level   ✅
   └─ paren → regBuiltin → addBuiltinLeadingParser    ❌ lean::exception: unknown parser category `level`
```

注册在前、使用在后，顺序完全正确（与官方 `stage0/stdlib/Lean/Parser/Level.c` 一致），排除顺序问题。

### 2. 排除的假设

| 假设 | 排除方式 |
| --- | --- |
| Node 宿主差异 | 改用 runner 自带 Chrome 157 无头验证，表现一致 |
| argv 缺少程序名 | 统一改为 `callMain(['lean', ...])`，`--version` 仍失败 |
| olean 不兼容 | `--version` 模式（不加载任何 olean）同样失败 |
| 优化器误编译 | 全量 `-O0` 重编，错误不变 |
| category 注册未执行 | `registerBuiltinParserAttribute` 返回值非错误 |
| 注册表写入丢失 | 探针用运行时新建的等价 `level` Name 查表，`is_error=0`，命中 |
| Name 相等性/哈希不一致 | 两个独立构造的 `level` Name：`eq=1`，哈希相同 |

### 3. 根因

在 `runtime_initialize_Lean_Parser_Level` 中加入两个探针后，同一逻辑名字的哈希出现分歧：

```
运行时构造的 "level"（Name.mkSimple）: hash = 18250387975948097528 = 0fd46672b5f7257f8
真实 regBuiltin 里的 "level"（静态常量）: hash = 1601329144          =         b5f7257f8
```

`1601329144` 恰好是 64 位哈希的低 32 位。

`src/include/lean/lean.h` 中：

```c
static inline uint64_t lean_name_hash_ptr(b_lean_obj_arg n) {
    assert(!lean_is_scalar(n));
    return lean_ctor_get_uint64(n, sizeof(lean_object*)*2);
}
```

`Name` 对象里缓存的是 `uint64` 哈希，但：

- C 后端生成的静态 Name 常量（以及 olean 中反序列化的 Name）只带 **32 位**哈希，零扩展到 64 位
- 运行时用 `Name.mkSimple` 构造的 Name 带完整 **64 位**哈希

wasm32 下两者都是 32 位，天然一致；wasm64 下高位不同，`PersistentHashMap` 按哈希分桶时分到不同桶，`find?` 直接 miss。

这同时解释了为什么 `eq=1`、结构相同、map 状态正常，却查不到。

## 如果要继续，需要 Lean 上游做什么

1. 统一 `Name` 哈希位宽：`name::hash()` / 静态常量生成 / olean 序列化全部改为 64 位，并与 Lean 侧 `Name.hash` 实现一致
2. 重新生成 stage0 静态常量与所有官方 olean
3. 修掉 memory64 下暴露的签名不一致（wasm32 下不可见）：
   - `lean_kernel_diag_is_enabled`：C++ 声明为 `uint8*`，Lean 导出为 `Bool`（`(i64)->i64` vs `(i64)->i32`）
   - `llvm_is_declaration`：同类问题
4. 以上完成后，还需验证 memory64 + pthreads 在浏览器里的大内存与多线程行为

规模上这已经接近「Lean 官方支持 wasm64」的工程量，超出本项目范围。

## 当前主线方案

保持 wasm32 + Init-only 自建 cgen/olean，浏览器内 LSP 正常工作。Mathlib 相关能力继续走「文档对照 + 最小裁切库」路线。

## 复现方式

```bash
git checkout spike/wasm64
git push origin spike/wasm64        # 触发 .github/workflows/spike-wasm64.yml
gh run watch                         # finish job 里查看 Chrome 验证输出
```

工作流中的诊断插桩位于 `finish` job 的「在 Level 初始化里插入 Name / 查表探针」步骤，属于临时诊断代码，不进入主线。

## 相关缓存键

| 名称 | key |
| --- | --- |
| emsdk | `wasm64-emsdk-6.0.0-v1` |
| Lean 源码与引导包 | `wasm64-src-v1` |
| runtime | `wasm64-runtime-v6`（-O0 诊断版） |
| cgen | `wasm64-cgen-v1` |
| objects | `wasm64-obj-v4`（-O0 诊断版） |
