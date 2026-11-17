# wasm64 运行时 spike 结论

分支：`spike/wasm64`（实验分支）
工作流：`.github/workflows/spike-wasm64.yml`
日期：2026-11-15

## 目标

把 Lean 浏览器运行时从 wasm32 改成真 64 位 WebAssembly（Emscripten `MEMORY64=1`），复用官方 64 位 Init olean，跟随官方 Lean 版本。
当前跟到 mathlib4 主线使用的工具链 **v4.36.0-rc2**（commit `b35cb10c`）。

## 结论

**4.36.0-rc2 跑通了**（run `43811606032` 全绿，53 分钟）：

- 运行时：wasm64 + `USE_GMP=ON`（emcc 自建 GMP 6.3.0）→ 官方 64 位 Init/Std/Lean olean 直接可用
- 浏览器（无头 Chrome 157）：`--version` 与 `import Init` 编译成功
- 大整数：`#eval (2 ^ 100 : Nat)` 输出 `1267650600228229401496703205376`，`2 ^ 100 = ... := rfl` 通过（确认走真 GMP）
- 真实依赖：Mathlib 裁切 `Mathlib.Tactic.Spread` 闭包 94 个模块（4.36 版 mathlib 的闭包比 4.34 时大），
  93 个编译成功（7 个需要去掉 `-Dinterpreter.prefer_native=false` 重试），1 个（`Mathlib.Tactic.Linter.DirectoryDependency`）失败但不影响目标产物；
  `Mathlib/Tactic/Spread.olean` + `.ir` + `.olean.server` + `.olean.private` 都产出了
- 产物体积：release 变体 `lean.wasm` 122,042,100 B，zstd -19 后 11,218,328 B（10.7 MiB）
- LSP：`initialize` 握手与 `didOpen → publishDiagnostics` 诊断链路全部打通（run `43892016062`：`Init` 轮 `Bad.lean` 报 `Type mismatch`、`Good.lean` 等到 `$/lean/ileanInfoFinal` 且 `diagnostics=0`；`Mathlib.Tactic.Spread` 轮同样全过）

关键前提：`-O2`、标量字面量 backport、GMP、官方 oleans、缓存键绑定 Lean pin。

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

**后续（USE_GMP=ON）**：只编 Init 无法支撑 Mathlib（`Qq.Typ` 就 `import Lean.Meta.Check`，而 Lean/Std 也被跳过了）。现在改成用 emcc 编一个 wasm64 静态 GMP（`scripts/build-wasm64-gmp.sh`），构建脚本用 `-DUSE_GMP=ON -DGMP_INSTALL_PREFIX=...` 重新配置，flags 与 githash 都与官方一致，Init/Std/Lean 的官方 olean 直接复用，不再自建。首个验证是 `#eval (2 ^ 100 : Nat)` 与 `2 ^ 100 = 1267650600228229401496703205376 := rfl`。

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

`node scripts/wasm64-lsp-handshake.ts work/dist/lean.mjs work/olean32` 以 `-j2 --server` 启动，按 `Content-Length` 帧发送 `initialize`，捕获 fd1 输出：

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

- `scripts/wasm64-lsp-diagnostics.ts`：把 wasm 放进 worker 线程，用 `SharedArrayBuffer` 环形缓冲接管 fd 0
  （`scripts/lib/frames.ts` 负责帧编解码与游标），父线程按响应逐帧喂。两种模式：
  - `server`：`-j2 --server`，`initialize` → `initialized` → `didOpen`。只用于确认 watchdog 的行为。
  - `worker`：`-j4 --worker <uri>`，直接起文件 worker 再发 `initialize` + `didOpen`——SDK 在浏览器里就是这么绕开
    `Process.spawn` 的（`worker.js` 的 `startProcess(['-j4','--worker',document.uri])`）。这是真正验证 `publishDiagnostics` 的模式。
  断言 Bad.lean 收到带 `mismatch` 的诊断、Good.lean 为空。Good.lean 干净同时说明 import 的 olean 真被加载成功。
- `scripts/mathlib-slice.ts`：不依赖 Lean 工具链，静态解析 `import` 得到候选目标的依赖闭包
  （`Mathlib.Order.Notation`（10 模块）/ `Mathlib.Tactic.Spread`（43）/ `Mathlib.Order.Basic`（94）里取最小的），
  按拓扑序把源文件摊平到 `work/mathlib-src`，再由 `run-lean.mjs` 逐个编译进 `work/mathlib-lib`（官方 olean 的副本）。
  闭包超过 120 个模块时脚本以 3 退出，workflow 跳过编译、诊断链路降级为 Init。

客户端本身用一个假 glue 在本地验证过收发与断言（initialize、Bad/Good 诊断、shutdown、exit 全通），不占用 CI 轮次。

两个已经踩到的坑：

- glue 的 `TTY.stream_ops.read` 会一直 `get_char` 到读满 `length` 字节。阻塞式 stdin 钩子拿到半帧后就卡在循环里，帧永远到不了 Lean。worker 里把 fd 0 换成「只在第一个字节上阻塞，之后有多少给多少」的 read。
- `-j2 --server` 进的是 `Watchdog`：`watchdogMain` 解析 `/etc/localtime`，手写的极简 TZif 被判成 `empty transitions`，catch 后直接 `forceExit 1`（表现为 initialize 成功后进程无声退出）。必须塞宿主的真实 TZif。
- `didOpen` 会让 watchdog `Process.spawn` 一个 `lean` 子进程（`Watchdog.lean`），上游 wasm 构建没有进程能力，报 `unsupported operation (error code: 52)` 后同样 `forceExit 1`。所以 `server` 模式只能验证到 didOpen；`publishDiagnostics` 走 `worker` 模式。
- `mathlib-lib` 如果从旧缓存恢复，会带着 flags=0 的自建 Init olean，所有 import 报 `incompatible header (flags=0)`。基座必须用官方 olean 覆盖，缓存前缀也要换。
- `EXIT_RUNTIME=1` 会在 main 返回后跑静态析构；官方 Init olean（402MB）下 `~initializer` 的 `free` 会抢 pthread 锁，浏览器主线程不允许 `Atomics.wait`，编译成功后反而在退出期抛异常。链接改成 `-sEXIT_RUNTIME=0`，退出码只看 `callMain` 返回值。
- 编译 Mathlib 不能带 `-Dinterpreter.prefer_native=false`：带 `initialize` 块的 Mathlib/Batteries 模块会踩 `ir_interpreter.cpp` 的 `mkDummyExternDecl` 断言（`fn_body_tag != Unreachable`）。默认解释器设置下同样的模块直接编过；编译步现在对失败模块自动用默认设置重试一次。
- `--worker` 模式能收下 `initialize` 与 `didOpen`，但**不产出任何输出**（连 hover 响应都没有）：已排除 `FileWorker.setupFile`（没有 `lake` 时直接返回 `noLakefile`，不会 `Process.spawn`），也排除了主线程阻塞（单独链了 `-sPROXY_TO_PTHREAD=1` 的 `lean-lsp.mjs`，main 跑在 pthread 上，现象不变；`PTHREAD_POOL_SIZE` 也从 4 调到 8）。根因是 stdin 走的是 Emscripten 的 TTY 钩子/线程代理，worker 里没有可读的 fd 0。移植 SDK 的 glue 适配（`scripts/adapt-glue.ts`：`lspStdin` 透传、fd0 环形缓冲、线程回收走代理）后才真正把帧送进 Lean。
- 4.36 下 `--worker -j4` 并发线程数超过 16（8/16 都会触发 `Lean LSP exhausted its pthread pool`；早期因 `adapt-glue.ts` 在 `__emscripten_check_mailbox()` 外包了一层 `catch(_){}` 把异常静默吞掉了，才误判成“异步调度卡死”）。LSP 专用变体（`link-wasm64-lsp.sh`）将 `-sPTHREAD_POOL_SIZE` 提高到 48、`-sDEFAULT_PTHREAD_STACK_SIZE` 设为 32MB，配合 `LEAN_STACK_SIZE_KB=16384` 与 `LEAN_MAIN_USE_THREAD=0`；CLI 与 release 变体保持 8 线程池，避免 CLI 启动开销。
- `_fd_read` 主线程等待 `lspStdin` 时的 `Atomics.wait(..., 20)` 会把每组跨线程代理 syscall（`stat`/`open`/`read`/MEMFS 文件加载以及 `fd1 write`）卡到 20ms 一拍，导致 `import Init` 的数千次 MEMFS 调用拖过 120s 超时；改成 `1ms` 短等并在前后均泵 `__emscripten_check_mailbox()` 后，Init 与 `Mathlib.Tactic.Spread` 的 `Bad.lean`/`Good.lean` 均在 26–56 秒内跑完并拿到正确诊断。
- CLI 退出期偶发 `lean::object_ref::~object_ref()` → `emscripten_builtin_free` 越界：`Shell.lean` 结尾在 `lthread` 里调 `IO.Process.exit`（`libc exit()`），在 `-sEXIT_RUNTIME=0` 下会先触发 `__funcs_on_exit()` 再回到 `lean_main` 跑析构。`backport-wasm64.ts` 让 `LEAN_EMSCRIPTEN` 下的 `lean_io_exit` 改为抛出 `lean::wasm_exit_exception`，并在 `shell.cpp` 进 `run_with_thread_stack` 前 `lean_mark_mt(shell_opts.raw())`、lambda 内捕获该异常写回 `shell_rc`。
- 环形缓冲的 `_fd_read` 第一版照抄 wasm32 的 iovec 布局，在 memory64 下读出一整段零：`struct iovec` 是 16 字节（8 字节 base + 8 字节 len），`iov_len` 必须从 `iov+8` 取，`nread` 也必须写 8 字节的 `size_t`（`HEAPU64[pnum/8]`）。按 8 字节 stride 取到的是 `iov_base` 的高 32 位，写回只写低 32 位则让宿主看到巨大的读取长度，表现为 `Invalid header field` 后 `main returned 1`。

## CI 门禁

`.github/workflows/spike-wasm64.yml` 的 `lint` 作业先于 6 小时构建跑完，任何一项失败都不会占用构建 runner：

| 检查 | 命令 | 说明 |
| --- | --- | --- |
| 类型 | `pnpm run typecheck:spike` | `tsconfig.spike.json`，`strict` + `erasableSyntaxOnly`（保证 Node 能直接跑 .ts） |
| Lint | `pnpm run lint:spike` | `eslint.spike.config.mjs`，只覆盖 `scripts/**/*.ts` |
| 格式 | `pnpm run format:check:spike` | Prettier |
| 单测 + 覆盖率 | `pnpm run test:spike:coverage` | `vitest.spike.config.ts`，阈值 75% 行 / 60% 函数 |
| Workflow 语法 | `actionlint` | 校验 `.github/workflows/*.yml` |

脚本全部是 TS，Node 24 直接执行（原生类型擦除），不再有 `.mjs` 与 `.ts` 混用。
workflow 的 `actions/setup-node` 统一为 `@v7`（Node 24 action runtime），`package.json` 声明 `engines.node >= 24`。
诊断步骤 `timeout-minutes: 25`：Init 两轮各 120 秒，Mathlib 900 秒，脚本结束后强制退出，不会再出现「日志停在超时、步骤却挂 45 分钟」。
命令行参数统一走 `scripts/lib/cli.ts`：未知参数、缺值、空字符串、非数字都会以退出码 2 失败，
workflow 里也不再出现 `"$MODULE"` 传空这种调用。

## 当前产物与缓存

| 名称 | key |
| --- | --- |
| emsdk | `wasm64-emsdk-6.0.0-v1` |
| Lean 源码与引导包 | `wasm64-src-v6` |
| runtime（-O2 + GMP + tail call） | `wasm64-runtime-v15-<pin+backport+patch hash>` |
| cgen | `wasm64-cgen-v2-<pin hash>` |
| objects（-O2 + GMP + tail call） | `wasm64-obj-v9-<pin+patch hash>` |
| GMP（wasm64 静态库） | `wasm64-gmp-v1` |
| 官方 64 位 oleans | 不缓存，直接从引导包 `work/lean-*-linux/lib/lean` 复制到 `work/olean32` |
| Mathlib 源码（浅克隆） | `wasm64-mathlib-src-v3` |
| Mathlib 裁切编译产物 | `wasm64-mathlib-lib3-<pin hash>-<run_number>`，`restore-keys: wasm64-mathlib-lib3-<pin hash>-` 取最新，逐轮增量 |

`<pin hash>` 是 `hashFiles('scripts/pin-lean.ts')`。runtime / cgen / objects / Mathlib 产物的缓存键都带上它：
`stage_cgen` 对已存在的 `.c` 直接跳过、不会随 Lean 版本失效，换版本后会拿旧版生成的 C 去配新版运行时，链出一个「混血」wasm——
oleans 的 githash 检查能过（运行时确实是新版），但前端还是旧版，`#eval` 报 `cannot evaluate code because '[anonymous]' uses 'sorry'`。
换 Lean 版本必须让这几类缓存一起失效。

`<patch hash>` 是 `hashFiles('scripts/patch-wasm64.sh')`，只并入 runtime 与 objects：编译开关（`MEMORY64`、`-mtail-call`）写在那个脚本里，
而 `stage_objects` 对「比源文件新的 `.o`」直接跳过。不把它算进缓存键，改开关后会复用旧对象、静默链出一个没打开该开关的 wasm。

`work/dist` 下有 `lean.mjs` / `lean.wasm`（含 pthread worker），`work/olean32` 是官方 Init/Std/Lean 的 olean/server/ir 文件，`work/mathlib-lib` 是同一份官方库加上自己编出来的 Mathlib/Batteries olean。

## tail call（`-mtail-call`）

2026-11-17 起，`scripts/patch-wasm64.sh` 与两个 link 脚本都带 `-mtail-call`，产物用 `return_call` / `return_call_indirect`。

为什么只在这里开、不开到生产 wasm32：

- **wasm64 已经要求 Memory64**，浏览器范围早就被收窄过一次；再叠一个 tail call 不再额外损失兼容性。生产 wasm32 相反——它是宽兼容基线，加了就等于把引擎门槛抬到「支持 tail call」。
- **尾调用只能压平尾位置的帧**。`docs/WASM32-STACK-SPIKE.md` 记录的爆栈路径是 `Lean.Meta.reduceRec` 这类「递归结果还要当参数用」的非尾递归，`return_call` 对它无能为力；而且默认 `maxRecDepth=1000` 时报的是 Lean 自己的递归上限，不是栈。
- 已知副作用：V8 会把 tail-caller 的栈帧直接丢掉（见 V8 2023-04-06 的 wasm tail call 博文），所以崩溃栈里看不见这些帧。诊断靠 `lean_log_write` 的 `[LEAN_WASM_ERR]` 前缀，不依赖 JS 栈，影响可控。

三个必须同时满足的点，少一个就等于没开：

1. **编译步**带 `-mtail-call`（`stage_objects` 的 `emcc -c`）。只在 link 带，`.o` 里没有 `return_call`，链接器不会凭空造出来。
2. **link 步**带 `-mtail-call`，让 wasm-ld / Binaryen 打开 `tail-call` 特性；否则对象里带特性、链接器不认。
3. **objects 与 runtime 缓存键**包含 `scripts/patch-wasm64.sh`，否则复用的旧 `.o` 会让第 1 点静默失效。

CI 用一个反汇编断言兜第 3 点：`wasm-dis work/dist/lean.wasm | grep -c return_call`，数到 0 直接失败。
`-fwasm-exceptions` 会影响覆盖度——带 catch/cleanup 的函数不能做尾调用，所以 `return_call` 只出现在没有 landing pad 的函数里，数量比函数总数少是正常的。

## 递归深度探针（2026-11-17）

在动 Lean 构建之前，先用 `scripts/depth-probe/` 的十几行 C++ 把「浏览器到底能撑多深」测出来。
全部在 Dedicated Worker 里跑（与生产 Lean LSP 同环境），Chrome for Testing 155.0.8059.39，Linux x64，headless，
启动参数 `--enable-experimental-webassembly-features`。

| 配置 | 递归上界 | 说明 |
| --- | --- | --- |
| 普通非尾递归 | **7,973** 层 | 约 1 MB Worker 栈，emcc 帧约 121 B |
| 互递归 + `-mtail-call` | **≥ 4,194,304** | 生成 `return_call`，3 处 |
| 堆上显式工作栈 | **≥ 1,048,576** | 上限来自探针的 2M 帧数组，不是栈 |
| ASYNCIFY + 每 64 层 `emscripten_sleep` | **≥ 262,144** | 栈展开到线性内存，继续加深只加内存与耗时 |
| JSPI + 已决议 Promise | **13,439–17,279** | `suspend=0/209`：一次都没真正挂起 |
| JSPI + 未决 Promise（微任务），每 64 层 | **17,258** | `suspend=269/269` |
| JSPI + 未决 Promise（微任务），每层 | **17,258** | `suspend=17258/17258`，密度提高 64 倍上界不变 |
| JSPI + 未决 Promise（宏任务），每 64 层 | **13,439** | `suspend=209/209`，真正让出事件循环 |
| pthread + 64 kB 线程栈 | **4,096 层通过** | 同一段递归跑在线程池线程上 |
| pthread + 32 MB 线程栈 | **4,096 层通过** | 与 64 kB 完全一致，线程栈大小不影响上界 |

JSPI 这几行没有经过 Emscripten：本机 apt 只有 Emscripten 3.1.6（不认识 `-sJSPI`），emsdk 6.0.0 的下载被限速。
`scripts/depth-probe/jspi-suspend.wat` 直接用 `WebAssembly.Suspending` + `WebAssembly.promising` 验证 V8 的栈切换，
`Suspending` / `promising` 均存在。栈上界由 V8 决定，不依赖 Emscripten 胶水，所以结论可迁移。

**旧结论在这里被推翻过一次，值得记下来。** 第一版探针的导入固定返回 `Promise.resolve()`，那是已决议 Promise，
V8 走快路径直接续跑，根本不切栈；当时测到的 17,279 层只是「换了一个栈」，不是「挂起回收了栈」。
探针现在把 `calls` / `pending` 一起报出来：`pending=0` 就说明这次测量无效。下面是真正挂起后的结果。

改变 V8 的 JSPI 栈大小（`--js-flags=--wasm-stack-switching-stack-size=<kB>`）也测了一轮：

| 栈大小 | 上界 |
| --- | --- |
| 64 kB | **907** |
| 984 kB（V8 默认） | **17,258** |
| 2,048 kB | **13,439** |
| 8,192 kB | **17,258** |

64 kB 那一行证明 flag 确实生效（约 57 B/帧），但超过默认值后上界被夹回 1 MB 量级；
`--experimental-wasm-growable-stacks` 同时打开也只有 12.3k–15.8k，没有数量级变化。

### 这组数字说明什么

- **JSPI 的栈就是另一个约 1 MB 的固定栈，不是更大的栈。** V8 的默认值是 984 kB
  （`--wasm-stack-switching-stack-size`，单位 kB，`node --v8-options` 可查），
  17,258 × 57 B ≈ 984 kB，与 Worker 原生栈同一预算。`17,258 / 7,973 ≈ 2.2` 只是帧更小，
  不是栈更大；换成同样的 emcc 帧立刻回到 8k 量级。
- **真挂起也不回收栈预算。** 挂起密度从每 1 层到每 1024 层，上界完全相同；改走宏任务也一样。
  栈切换只是把「整条链躺在一个栈上」换成「整条链躺在另一个栈上」，深度上界没变。
- **调大这个栈没有出口。** 超过默认值会被夹回 1 MB 量级，growable stacks 的实验 flag 也没有效果；
  即便有效，也不可能要求用户带启动参数打开站点。
- **换算到 Lean，正好解释 N=1200。** 1 MB / 121 B ≈ 8k 个 wasm 帧；`whnfCore → reduceRec → 续延`
  一个逻辑层要消耗约 6–7 个帧，8k / 6.5 ≈ 1,230 层，与实测 N=1200 撞顶吻合。
  JSPI 给的是同一个 1 MB 预算，不会把 1,200 抬到 `maxRecDepth=4000`。
- **调大线程栈不是杠杆。** 把同一段非尾递归放进 `pthread`，只改 `DEFAULT_PTHREAD_STACK_SIZE`（64 kB / 8 MB / 32 MB），
  三个变体在 4,096 层的行为完全一样。决定 wasm 递归上界的是 V8 的栈，不是 Emscripten 的线程栈；
  生产 LSP 变体早已把线程栈设到 32 MB，N=1200 照样撞顶，原因就在这里。
- **WasmFX 目前没有可用的构建入口。** Emscripten 6.0.0 的设置里只有 `JSPI` / `JSPI_EXPORTS` / `JSPI_IMPORTS`，
  没有 WasmFX 或 stack-switching 设置；Chrome 155 有实验 flag，但没有面向 Emscripten 的代码生成与 JS 接口。
- **ASYNCIFY + 挂起点确实能解除上界**，因为它把栈展开成线性内存里的数据再 rewind。
  代价是整程序插桩（Lean 规模约 +50% 体积、链接显著变慢，见 Emscripten Issue #26455），
  而且热点路径必须真的能挂起：Lean 的 elaboration 是同步的，LSP 的异步只到 I/O 边界。
  再加上生产运行时是 `-pthread` 模型，JSPI 文档明确说从不可挂起的栈调挂起导入会直接 trap，
  这不是一个能靠换编译开关落地的方案。
- **尾调用的前提是真正的尾位置，而热点环里没有。** 见下一节审计：
  `whnfImp → whnfEasyCases → whnfCore → reduceRec → lean_whnf` 这一圈里 0 条 `return_call`，
  递归结果都要先交给 `cache` 或后续构造，`-mtail-call` 没有可压平的东西。
  探针里的互递归能到 4M，是因为它被编译成了直接 `return_call`。
- **堆上工作栈是唯一不依赖浏览器 flag 的路径。** 探针把「结果还要参与外层计算」的续延放进显式数组，
  原生栈深度恒定为 1。对 Lean 4.36 来说，`src/Lean/Meta/WHNF.lean` 的 `whnfCore` 已经是 Lean 层的 CPS：
  `whnfEasyCases e fun e => ...`、`reduceRec ... (fun e => go e)`，以及非尾的 `let f' ← go f`。
  要彻底解决，需要把这些续延变成数据（显式栈 / 状态机），这是一次真正的重构，不是一行 patch。

### 尾调用审计：热点环里一条都没有

不用全量编 Lean 也能看产物：官方 Linux 4.36.0-rc2 的 `lean` 只把 `src/Lean/Meta/WHNF.lean` 编成 C，
再用 emcc 3.1.6 加 `-O2 -mtail-call` 编成 wasm 对象，反汇编后数 `return_call`。

```bash
LEAN_PATH=$DIST/lib/lean $DIST/bin/lean -c /tmp/WHNF.c src/Lean/Meta/WHNF.lean
emcc -c -O2 -mtail-call -I$DIST/include -o /tmp/WHNF.o /tmp/WHNF.c
wasm2wat --enable-all /tmp/WHNF.o -o /tmp/WHNF.wat
```

产物里 550 个函数、173 条 `return_call`，但热点环上一条都没有：

| 函数 | wasm 函数体行数 | `return_call` |
| --- | --- | --- |
| `lean_whnf`（`whnfImp` 的 `@[export]`） | 1,072 | 0 |
| `whnfEasyCases`（`whnfImp` 特化） | 7,370 | 0 |
| `whnfEasyCases`（`whnfCore` 特化） | 8,355 | 0，自调用 2 次、调 `reduceRec` 1 次，全是普通 `call` |
| `reduceRec` 实体（`___redArg`） | 5,585 | 0 |
| `reduceQuotRec` 实体（`___redArg`） | 2,046 | 0 |

源码能直接对上：`whnfImp` 的 `cache useCache e (← whnfImp e'')` 要把递归结果交给 `cache`；
`reduceRec` 的 `major ← whnf major` 要拿结果继续构造。两处都不是尾位置，编译器没有可压平的对象。
环上每层约 6–7 个帧，正好是 8k 帧 / 1,200 层。

`@[specialize]` 对照实验：给 `reduceRec`、`reduceQuotRec` 加上 `@[specialize]` 重新生成后，
`reduceRec` 的 wasm 函数体与原版 **SHA-1 完全相同**（5,585 行），`return_call` 总数仍是 173。
这两个 `private def` 早就按调用点的续延特化成了 `___redArg`，属性没有新增任何特化。
**这条改动可以划掉，不要再花一轮全量构建去试。**

### 下一步的先后顺序

1. 已经排除：JSPI（同 1 MB 预算、挂起不回收）、调大 JSPI 栈 / growable stacks（被夹回 1 MB）、
   调大 pthread 栈（4,096 层行为不变）、`-mtail-call`（热点环 0 条尾调用）、
   `@[specialize]`（函数体逐字节相同）。
2. 剩下唯一能根治的路径是 **在 Lean 侧把 `whnfCore` 的续延变成数据**（显式工作栈 / 状态机），
   验收条件是 1 MB Worker 栈下 `maxRecDepth=4000` 不 trap。这是重构，不是 patch；
   动手前先在 wasm32 与 wasm64 各跑一次现有课程的全量编译做基线。
3. 可选的低风险缓冲：减少每层帧数（去掉 `withTraceNode` 包装、把 `whnfImp` 的 unfold 自递归改成循环），
   乐观估计能把 1,200 抬到 2,000–3,000 量级，但到不了 4,000，不能当最终方案。
4. 以上任一条落地之前，不要把 JSPI / ASYNCIFY 合进 wasm32 或 wasm64 运行时。

复现：

```bash
# Emscripten 6.0.0
bash scripts/depth-probe/build.sh work/depth-probe
node scripts/depth-probe/run.ts --out work/depth-probe \
  --variants baseline,jspi,tailcall,asyncify,jspi-yield,jspi-resolved,jspi-pending,heapstack

# 本机 apt 的 3.1.6（STACK_SIZE 在旧版叫 TOTAL_STACK；jspi-suspend 需要 wabt）
STACK_FLAG=-sTOTAL_STACK=8388608 bash scripts/depth-probe/build.sh /tmp/depth-emcc
node scripts/depth-probe/run.ts --out /tmp/depth-emcc \
  --variants jspi-resolved,jspi-pending,jspi-pending-1,jspi-macrotask,jspi-pending-1024

# 观察 V8 flag 的影响（单位 kB）
node scripts/depth-probe/run.ts --out /tmp/depth-emcc --variants jspi-pending-1 \
  --js-flags="--wasm-stack-switching-stack-size=64"
```

判读：JSPI 那几个变体只在 `suspend.pending > 0` 时才代表真实挂起；`pending=0` 说明走了已决议快路径，
那一行结果不能用来支持任何结论。

## 尚未验证

- 浏览器内 LSP：浏览器侧目前只验证了 CLI 编译（`--mode=version|compile`），`--worker` 诊断链路已在 Node `worker_threads` 跑通 `Init` 与 `Mathlib.Tactic.Spread`，尚未接入前端 Monaco + 浏览器 Worker 联调
- Mathlib 教学子集扩展：已打通 `Mathlib.Tactic.Spread` 的 `olean` 编译与 LSP 诊断，后续按需扩展 `scripts/mathlib-slice.ts` 目标并打包进浏览器运行时资产
- 内存占用与性能：`-O2` + memory64 下的峰值内存未精细压测；当前 Init 诊断约 26–37 秒、`Mathlib.Tactic.Spread` 约 51–56 秒（受限于 MEMFS 跨线程 syscall 每拍 1ms 的 `Atomics.wait`）

## 复现

```bash
git checkout spike/wasm64
git push origin spike/wasm64
gh run watch
```

wasm64 的源码修复集中在 `scripts/ci/backport-wasm64.ts`（lean.h 标量字面量、CMakeLists 的 MEMORY64、线程栈、
内核日志与异常兜底插桩），关键锚点缺失会让 CI 直接失败；`-O2` 与这三处 backport 是实际生效的修改。
缓存键统一绑定 `scripts/pin-lean.ts` 的哈希，换 Lean 版本自动失效。
