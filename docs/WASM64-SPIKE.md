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

## 诊断日志（内核侧）

约定：**所有诊断只走 stderr**，stdout 留给 LSP 的 JSON-RPC，避免协议帧被冲坏。

1. **外层兜底**：`src/util/shell.cpp` 的 `lean_main` 用 C++ `try/catch` 接住 `lean::throwable`、`std::exception` 和 `...`，按固定前缀输出并返回非零：

   ```
   [LEAN_WASM_ERR] {"type":"lean::exception","msg":"..."}
   ```

   异常在被 JS 看到之前就已经解包，宿主不再需要处理 `WebAssembly.Exception` / `getExceptionMessage`；只有 wasm 硬 trap（越界、爆栈）才需要宿主的 `onAbort` / Worker `onerror` 兜底。

2. **`LEAN_WASM_TRACE` 门控**：`src/util/io.h` 提供 `lean_log_write` / `lean_trace_write`，默认零输出；在 `Module.ENV` 里设置 `LEAN_WASM_TRACE=1` 后输出：

   ```
   info: [init] Init start
   info: [io] <io_result 错误文本>
   info: [olean] failed to read file '...', incompatible header (version=2, flags=1, githash=...)
   ```

   插桩点：`consume_io_result`（所有 `Except.error` 转 C++ 异常的汇聚处）、`initialize_Init/Std/Lean` 入口、olean 头校验失败分支。

3. **验证**：负向探针用官方 GMP olean 触发，得到

   ```
   error: failed to read file '/lean/lib/lean/Init.olean', incompatible header
          (version=2, flags=1, githash=5045d005...)
   wasm contains LEAN_WASM_ERR: 1
   ```

## LSP 握手

`node scripts/wasm64-lsp-handshake.mjs work/dist/lean.mjs work/olean32` 以 `-j2 --server` 启动，按 `Content-Length` 帧发送 `initialize`，捕获 fd1 输出：

```
[handshake] outcome=1 bytes=1564
[handshake] ok
{"id":1,"jsonrpc":"2.0","result":{"capabilities":{...},"serverInfo":{"name":"Lean 4 Server","version":"0.3.0"}}}
```

要点：

- 当前 glue 没有 `lspStdin` 钩子（`grep -c lspStdin lean.mjs` 为 0），stdin 走标准 Emscripten `Module.stdin`
- `Module.stdin` 必须**逐字节返回字符码**，EOF 返回 `null`；返回 `Buffer` 会被当成对象转成 `\x00`，服务端报 `Invalid header field`
- LSP 协议帧只走 fd 1（stdout），所有内核诊断走 fd 2（stderr），与前述约定一致

## 完整诊断链路与真实依赖

握手只证明 server 能启动。为了验证 `didOpen → publishDiagnostics`，新增两个脚本：

- `scripts/wasm64-lsp-diagnostics.mjs`：把 wasm 放进 worker 线程，用 `SharedArrayBuffer` + `Atomics` 让 `Module.stdin`
  在没数据时挂起（主线程阻塞会拿不到 stdout），父线程按响应逐帧喂：
  `initialize` → `initialized` → `didOpen(Bad.lean)` → `didOpen(Good.lean)` → `shutdown` → `exit`。
  断言 Bad.lean 收到带 `mismatch` 的诊断、Good.lean 为空。Good.lean 干净同时说明 import 的 olean 真被加载成功。
- `scripts/mathlib-slice.mjs`：不依赖 Lean 工具链，静态解析 `import` 得到候选目标的依赖闭包
  （`Mathlib.Init` / `Mathlib.Data.Nat.Defs` / `Mathlib.Logic.Basic` / `Mathlib.Order.Basic` 里取最小的），
  按拓扑序把源文件摊平到 `work/mathlib-src`，再由 `run-lean.mjs` 逐个编译进 `work/mathlib-lib`（Init olean 的副本）。
  闭包超过 120 个模块时脚本以 3 退出，workflow 跳过编译、诊断链路降级为 Init。

客户端本身用一个假 glue 在本地验证过收发与断言（initialize、Bad/Good 诊断、shutdown、exit 全通），不占用 CI 轮次。

两个已经踩到的坑：

- glue 的 `TTY.stream_ops.read` 会一直 `get_char` 到读满 `length` 字节。阻塞式 stdin 钩子拿到半帧后就卡在循环里，帧永远到不了 Lean。worker 里把 fd 0 换成「只在第一个字节上阻塞，之后有多少给多少」的 read。
- `-j2 --server` 进的是 `Watchdog`：`watchdogMain` 解析 `/etc/localtime`，手写的极简 TZif 被判成 `empty transitions`，catch 后直接 `forceExit 1`（表现为 initialize 成功后进程无声退出）。必须塞宿主的真实 TZif。

## 当前产物与缓存

| 名称 | key |
| --- | --- |
| emsdk | `wasm64-emsdk-6.0.0-v1` |
| Lean 源码与引导包 | `wasm64-src-v5` |
| runtime（-O2） | `wasm64-runtime-v12` |
| cgen | `wasm64-cgen-v1` |
| objects（-O2） | `wasm64-obj-v7` |
| 64 位 oleans | `wasm64-oleans-v2`（约 117MB） |
| Mathlib 源码（浅克隆） | `wasm64-mathlib-src-v1` |
| Mathlib 裁切编译产物 | `wasm64-mathlib-lib-<run_number>`，`restore-keys: wasm64-mathlib-lib-` 取最新，逐轮增量 |

`work/dist` 下有 `lean.mjs` / `lean.wasm`（含 pthread worker），`work/olean32` 是 1947 个 64 位 olean/server/ilean 文件。

## 尚未验证

- 浏览器内 LSP：浏览器侧只验证了 CLI 编译（`--mode=version|compile`），`--server` 目前只在 Node 里跑通
- 内存占用与性能：`-O2` + memory64 + 1GB 上限下的实际峰值未测
- 与 Mathlib 的兼容性：裁切编译与诊断链路已接进 CI，等下一轮结果

## 复现

```bash
git checkout spike/wasm64
git push origin spike/wasm64
gh run watch
```

诊断插桩在 `finish` job 的「在 Level 初始化里插入 Name / 查表探针」步骤，属于临时诊断代码；`-O2` 与三处 backport（lean.h、environment.cpp、thread.cpp）是实际生效的修改。
