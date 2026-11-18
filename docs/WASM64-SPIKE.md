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
| runtime（-O2 + GMP + tail call） | `wasm64-runtime-v16-<pin+backport+patch hash>` |
| cgen | `wasm64-cgen-v4-<pin+patch hash>` |
| objects（-O2 + GMP + tail call） | `wasm64-obj-v11-<pin+patch hash>` |
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
`scripts/patches/lean-replace-fn-iterative.patch` 修改的是 `src/kernel/replace_fn.cpp`（属于 libleancpp），所以只并入 runtime 键；
`scripts/patches/lean-whnf-stack.patch` 与 `scripts/patches/lean-simp-loop-stack.patch` 修改 Lean 源码，
由 cgen 生成 C、objects 编译，所以并入 cgen 与 objects 键。
补丁在 workflow 的 fetch 之后应用，fetch 的 `reset --hard` 会冲掉提前打上的源码补丁。

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
全部在 Dedicated Worker 里跑（与生产 Lean LSP 同环境），GitHub Actions 的 `ubuntu-latest`
自带 Chrome，headless，启动参数 `--enable-experimental-webassembly-features`；
具体版本记录在 `browser-results.json` 的 `features.userAgent`。
重型构建与浏览器探针一律由 `.github/workflows/depth-probe.yml` 执行，本地不跑。

| 配置 | 递归上界 | 说明 |
| --- | --- | --- |
| 普通非尾递归 | **7,974** 层 | 约 1 MB Worker 栈，emcc 帧约 121 B |
| 互递归 + `-mtail-call` | **≥ 4,194,304** | 生成 `return_call`，3 处 |
| 堆上显式工作栈 | **≥ 1,048,576** | 上限来自探针的 2M 帧数组，不是栈 |
| ASYNCIFY + 每 64 层挂起（缓冲区 1 / 8 / 32 MB） | **24,453–24,455** | 三档缓冲区结果相同，上界不在 `ASYNCIFY_STACK_SIZE` |
| ASYNCIFY + 每 4096 层挂起（缓冲区 1 / 8 / 32 MB） | **8,191** | 低频 yield 几乎等于不挂起（对照组 7,974） |
| JSPI + 已决议 Promise | **13,439** | `suspend=0/209`：一次都没真正挂起 |
| JSPI + 未决 Promise（微任务），每 64 层 | **17,258** | `suspend=269/269` |
| JSPI + 未决 Promise（微任务），每层 | **17,258** | `suspend=17258/17258`，密度提高 64 倍上界不变 |
| JSPI + 未决 Promise（宏任务），每 64 层 | **13,439** | `suspend=209/209`，真正让出事件循环 |
| Emscripten JSPI + 每 64 层 `emscripten_sleep` | **15,359** | `-sSTACK_SIZE` 8 MB，emsdk 6.0.0 |
| Emscripten JSPI，同上但 `-sSTACK_SIZE=1 MB` | **15,359** | 与 8 MB 完全相同：JSPI 栈不来自 wasm 线性栈 |
| pthread + 64 kB / 8 MB / 32 MB 线程栈 | **≥ 4,096** | 固定样本止步 4,096；探针帧约 16 B，不能反推 Lean |

2026-11-17 在 Actions（run `44102427140`）上用 emsdk 6.0.0 + HeadlessChrome 157 实测，
上表就是这一轮的数字；原始输出在 run 的 `depth-probe` artifact 里。

JSPI 这几行没有经过 Emscripten：`scripts/depth-probe/jspi-suspend.wat` 直接用
`WebAssembly.Suspending` + `WebAssembly.promising` 验证 V8 的栈切换，`Suspending` / `promising` 均存在。
栈上界由 V8 决定，不依赖 Emscripten 胶水，所以结论可迁移到「不使用 Emscripten 胶水」的场景。

**Emscripten JSPI 与裸 WAT 是同一个预算，差异只在帧大小。** `jspi-yield` 把 `yield-rec.cpp`
编成 `-sJSPI=1`，每 64 层 `emscripten_sleep(0)` 一次，上界 15,359；把 `-sSTACK_SIZE` 从 8 MB
压到 1 MB 再编一遍（`jspi-yield-1m`），结果**完全相同**。这说明挂起栈是 V8 单独分配的，
与 wasm 线性栈无关；15,359 与裸 WAT 的 17,258 之差来自 `yield-rec.cpp` 的帧更大（多了局部变量
与 volatile 写入），不是 Emscripten 把栈换掉了。

首轮这个变体还遇到一个配置坑：挂起时抛
`SuspendError: trying to suspend without WebAssembly.promising`，原因是 `JSPI_EXPORTS`
匹配的是 wasm 导出名（默认表里写的是 `main`），必须写 `yield_probe`；写成 C 符号
`_yield_probe` 不报错，但导出不会被包起来。

**探针自己也会骗人：LLVM 把递归折成了循环。** `rec(n-1)+1` 在 `-O2` 下会被 LLVM 改写成循环
（`clang -O2 -S` 里 0 条自调用），这时测的是循环迭代而不是栈深。第一版 `yield-rec.cpp` 与
`pthread-rec.cpp` 都中了这一枪，于是 `asyncify` 一度报出 ≥262,144、`jspi-yield` 一度报出
≥1,048,576。两个文件补上 `deep-rec.cpp` 那样的 volatile sink 后自调用恢复，数字才回到
24,453 / 15,359。

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

- **裸 WAT 的 JSPI 栈就是另一个约 1 MB 的固定栈，不是更大的栈。** V8 的默认值是 984 kB
  （`--wasm-stack-switching-stack-size`，单位 kB，`node --v8-options` 可查），
  17,258 × 57 B ≈ 984 kB，与 Worker 原生栈同一预算。`17,258 / 7,974 ≈ 2.2` 只是帧更小，
  不是栈更大；换成带 sink 的 emcc 帧，上界随帧宽掉到 15,359。
- **裸 WAT 下真挂起也不回收栈预算。** 挂起密度从每 1 层到每 1024 层，上界完全相同；改走宏任务也一样。
  栈切换只是把「整条链躺在一个栈上」换成「整条链躺在另一个栈上」，深度上界没变。
- **Emscripten 的 JSPI 路径没有额外红利。** `yield-rec.cpp` 在 8 MB 与 1 MB 的 wasm 栈下都是
  15,359 层，`-sSTACK_SIZE` 完全不参与；JSPI 给的仍是 V8 那个约 1 MB 的挂起栈。
  15,359 与裸 WAT 的 17,258 只差在每帧大小。而且前提是每 64 层真的挂起一次；
  Lean 的热点环是同步调用，没有这样的挂起点——把 `whnfCore` 拆成可挂起的协程，
  本身就是「续延数据化」的重构，不是换编译开关。再加上生产运行时是 `-pthread` 模型，
  JSPI 文档明确说从不可挂起的栈调挂起导入会直接 trap，这条也不是换编译开关能落地的。
- **调大这个栈没有出口。** 超过默认值会被夹回 1 MB 量级，growable stacks 的实验 flag 也没有效果；
  Worker 里的普通 wasm 栈同样不跟 `--js-flags=--stack-size=8192` 走（baseline 仍停在 7,972 层）。
  即便有效，也不可能要求用户带启动参数打开站点。
- **换算到 Lean，正好解释 N=1200。** 热点环上每层至少 4 个调用边
  （`reduceRec → lean_whnf → whnfEasyCases → whnfEasyCases → reduceRec`），且都是大函数，
  单帧远大于探针里 121 B 的简单帧；1 MB 只够 1,200 层左右，与实测撞顶吻合。
  JSPI 给的是同一个约 1 MB 预算（裸 WAT 与 Emscripten 两条路径都已证实），
  而且 Lean 没有可插入的挂起点，不会把 1,200 抬到 `maxRecDepth=4000`。
- **线程栈这组探针没有区分度。** 同一段非尾递归放进 `pthread`，只改
  `DEFAULT_PTHREAD_STACK_SIZE`（64 kB / 8 MB / 32 MB），三个变体在固定的 4,096 层样本上都通过。
  C++ 探针的帧只有十几字节，64 kB 就够装 4,096 层；这个规模与 Lean 的大函数帧不在一个量级，
  所以这组数字只能说明配置生效，不能反推 Lean 的上界，也不再作为「调线程栈无用」的依据。
  生产 LSP 早已把线程栈设到 32 MB，N=1200 仍撞顶，说明问题在每层帧太贵，不在栈配多大。
- **WasmFX 目前没有可用的构建入口。** Emscripten 6.0.0 的设置里只有 `JSPI` / `JSPI_EXPORTS` / `JSPI_IMPORTS`，
  没有 WasmFX 或 stack-switching 设置；Chrome 155 有实验 flag，但没有面向 Emscripten 的代码生成与 JS 接口。
- **ASYNCIFY 的 3 倍上界与缓冲区大小无关。** 缓冲区 1 / 8 / 32 MB、每 64 层挂起，三档都是
  24,453–24,455；把频率降到每 4096 层一次，三档一起掉回 8,191（完全不挂起的对照 7,974）。
  所以「大缓冲区 + 低频 yield 分段接力」在这版 Emscripten 里不成立：瓶颈在 unwind / rewind
  本身，不在 `ASYNCIFY_STACK_SIZE`。代价还有整程序插桩（Lean 规模约 +50% 体积、链接显著变慢，
  见 Emscripten Issue #26455），而且热点路径必须真的能挂起——Lean 的 elaboration 是同步的，
  LSP 的异步只到 I/O 边界。`-pthread + -sASYNCIFY` 能编过（探针里 `pthread-asyncify` 构建成功），
  但这不改变上界只有 3 倍的事实。
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
再编成 wasm 对象反汇编数 `return_call`。`.github/workflows/depth-probe.yml` 的 `whnf-audit` job
用 emsdk 6.0.0 跑下面三条命令，下表就是它的结果（本机 apt 3.1.6 的行数略高，结论相同）。

```bash
# whnf-audit job 里执行的命令
LEAN_PATH=$DIST/lib/lean $DIST/bin/lean -c work/WHNF.c work/lean-src/src/Lean/Meta/WHNF.lean
emcc -c -O2 -mtail-call -I$DIST/include -o work/WHNF.o work/WHNF.c
wasm2wat --enable-all work/WHNF.o -o work/WHNF.wat
```

产物里 550 个函数、173 条 `return_call`，但热点环上一条都没有：

| 函数 | wasm 函数体行数 | `return_call` |
| --- | --- | --- |
| `lean_whnf`（`whnfImp` 的 `@[export]`） | 1,024 | 0 |
| `whnfEasyCases`（`whnfImp` 特化） | 7,117 | 0 |
| `whnfEasyCases`（`whnfCore` 特化） | 8,026 | 0，自调用 2 次、调 `reduceRec` 1 次，全是普通 `call` |
| `whnfEasyCases`（未特化） | 5,475 | 0 |
| `reduceRec` 实体（`___redArg`） | 5,458 | 0 |
| `reduceQuotRec` 实体（`___redArg`） | 1,989 | 0 |

全对象 550 个函数、173 条 `return_call`，其中 5 条落在 4–11 行的薄包装上
（`reduceRec` / `reduceQuotRec` 的未特化入口、`deltaBetaDefinition` 与两个生成适配器），
它们只是尾调 `___redArg` 实体，压不平热点环。

源码能直接对上：`whnfImp` 的 `cache useCache e (← whnfImp e'')` 要把递归结果交给 `cache`；
`reduceRec` 的 `major ← whnf major` 要拿结果继续构造。两处都不是尾位置，编译器没有可压平的对象。
按 wat 的调用图，经过 `reduceRec` 的最短环是
`reduceRec → lean_whnf → whnfEasyCases(whnfImp) → whnfEasyCases(whnfCore) → reduceRec`
（4 条边）；这几支都是大函数，帧槽远大于探针里的 121 B，1 MB 只够 1,200 层左右。

换优化等级也不是原因：`-O1` 与 `-O2 -fno-inline` 各编一遍，热点环上仍然全是 0 条 `return_call`
（`lean_whnf` 1,232 / 135 行、`reduceRec` 5,963 / 826 行），说明不是内联把尾位置吃掉了，
而是源码里本来就没有尾位置。

`@[specialize]` 对照实验：给 `reduceRec`、`reduceQuotRec` 加上 `@[specialize]` 重新生成后，
`reduceRec` 的 wasm 函数体与原版 **SHA-1 完全相同**（5,585 行），`return_call` 总数仍是 173。
这两个 `private def` 早就按调用点的续延特化成了 `___redArg`，属性没有新增任何特化。
**这条改动可以划掉，不要再花一轮全量构建去试。**

### 下一步的先后顺序

1. 已经排除：裸 WAT 与 Emscripten 两条 JSPI 路径（同为约 1 MB 预算、挂起不回收、与 `-sSTACK_SIZE` 无关）、
   调大 JSPI 栈 / growable stacks（被夹回 1 MB）、`-mtail-call`（热点环 0 条尾调用）、
   `@[specialize]`（函数体逐字节相同）、ASYNCIFY（缓冲区 1 / 8 / 32 MB 与每 64 / 4096 层频率都已实测，
   3 倍是固定上界，且需要可挂起点）。
   pthread 栈那组因为探针帧太小没有区分度，不构成结论。
2. 剩下唯一能根治的路径是 **在 Lean 侧把 `whnfCore` 的续延变成数据**（显式工作栈 / 状态机），
   验收条件是 1 MB Worker 栈下 `maxRecDepth=4000` 不 trap。这是重构，不是 patch；
   动手前先在 wasm32 与 wasm64 各跑一次现有课程的全量编译做基线。
3. 可选的低风险缓冲：减少每层帧数（去掉 `withTraceNode` 包装、把 `whnfImp` 的 unfold 自递归改成循环），
   乐观估计能把 1,200 抬到 2,000–3,000 量级，但到不了 4,000，不能当最终方案。
4. 以上任一条落地之前，不要把 JSPI / ASYNCIFY 合进 wasm32 或 wasm64 运行时。

复现：重型部分（emsdk 构建、Chrome 探针、Lean 发行包审计）全部在 GitHub Actions 跑，本地不跑。

```bash
# 推送到工作分支即触发 probe job
git push origin spike/wasm64
gh run watch
gh run download <run-id> --name depth-probe   # browser-results.json / build-summary.json

# 手动指定变体或 V8 flag
gh workflow run depth-probe.yml --ref spike/wasm64 \
  -f variants=jspi-pending-1,jspi-macrotask \
  -f js_flags=--wasm-stack-switching-stack-size=64

# 尾调用审计（下载约 600 MB 发行包）
gh workflow run depth-probe.yml --ref spike/wasm64 -f whnf_audit=true
# 本地 token 没有 actions:write 时改用提交信息标记 [whnf-audit] 后 push
```

本地只跑静态检查：`pnpm run format:check:spike && pnpm run lint:spike && pnpm run typecheck:spike`。

判读：JSPI 那几个变体只在 `suspend.pending > 0` 时才代表真实挂起；`pending=0` 说明走了已决议快路径，
那一行结果不能用来支持任何结论。workflow 的「校验结果」步骤会在 `pending=0` 时直接失败。

## replace_fn 显式堆栈（2026-11-18）

浏览器 depth 冒烟在 `N=800` 报 `RangeError: Maximum call stack size exceeded`，
符号化栈是 `Lean_Expr_instantiateLevelParams → lean::replace_fn::apply` 连续自递归。
`instantiateLevelParams` 在 Lean 侧走 `Expr.replace`（`lean_replace_expr`），
`replace_fn::apply` 是非尾递归后序遍历，表达式树每深一层就压一个 C++ 帧；
Memory64 只放大线性内存，不会放大约 1 MB 的 Worker 调用栈。

`scripts/patches/lean-replace-fn-iterative.patch` 把 `replace_fn::apply` 与
`replace_rec_fn::apply` 改成堆上显式栈的后序遍历，逐节点状态机与递归版一一对应：

- `shared` 在表达式复制进 frame **之前**计算。frame 自己持有的引用会把 rc 从 1 抬到 2，
  若在 apply 入口再判 `is_shared` / `is_likely_unshared`，所有节点都会被误判成共享，整棵树都写进缓存。
- 续延用 `optional<expr>` 而不是 `expr`：`expr` 的默认构造会创建一个 dummy 常量。
- `App` / `Pi` / `Lambda` / `Let` 的子节点顺序与 `offset + 1` 的 binder 深度与递归版一致。

主机侧对照（g++，`ulimit -s 1024`，同一棵 App 链）：

| 版本 | N=5,000 | N=10,000 | N=1,000,000 |
| --- | --- | --- | --- |
| 原递归版 | 通过 | SIGSEGV | — |
| 显式栈版 | 通过 | 通过 | 通过 |

两条路径（`replace(expr, std::function)` 与 `lean_replace_expr(closure)`）在 `N=1,000,000`
都返回与输入逐指针相同的树（`rec_same=1 fn_same=1`）。

补丁在 `spike-wasm64.yml` 的 fetch 之后应用，并计入 runtime 缓存键；`replace_fn.cpp` 属于 libleancpp，
只影响 runtime，不影响 cgen / objects。补丁的 `wants_cache` 标记缺失会让 CI 直接失败，不会静默跳过。

如果 depth 在更高档位继续爆栈，先按 `LEAN_WASM_ERR` / Emscripten 异常栈符号化，
确认下一层是 `Lean_Level_substParams_go`、`whnfImp` 还是 `ReduceRec` 再决定改动范围，不要直接改构建开关。

## simpLoop 显式续延栈（2026-11-18）

`replace_fn` 修好后，run `44274559203`（#111）的 depth 在 `N=800` 仍然爆栈。
把 Worker 的 `Error.stackTraceLimit` 提到 200 后拿到完整栈：`replace_rec_fn::apply`
只出现一次，真正重复的是

```text
Lean.Meta.Simp.simpLoop
Lean.Meta.Simp.simpLoop_visitPreContinue
```

200 帧窗口里已经有 84 对；`f 800` 的 `f (n+1) → f n` 每重写一步就递归一次
`simpLoop`，真实链长约 800 对。栈顶的 `mk_binding → mk_data` 只是栈满瞬间正在重建的节点。

原因在 `Simp/Main.lean` 的三处非尾调用（`.visit`、`visitPreContinue` 的 rewrite 分支、
`visitPostContinue`）：递归结果返回后还要 `mkEqTrans` 与 `cacheResult`，所以每步在
wasm 原生栈上留 `simpLoop + visitPreContinue` 两个帧，800 步就把约 1 MB 的栈吃光。

`scripts/patches/lean-simp-loop-stack.patch` 把这三处改成显式续延栈：

- `SimpLoopCont { e, cfg, r }` 压进 `List`，`SimpLoopTask.eval` / `.finish` 之间只有尾调用。
- `.finish` 沿列表逆序还原 `r.mkEqTrans` 并补 `cacheResult`，顺序与递归版一致。
- 缓存命中、`numSteps` 检查、`pre` / `post` 的调用时机全部保持原样。
- `withIncRecDepth` 只在最外层 `simpLoop` 入口计一次；迭代重写链不再按步数增加递归深度，
  步数仍由 `maxSteps` 限制。这是显式栈版本唯一有意的语义差异。

补丁用 `leanprover/lean4 v4.36.0-rc2` 的官方 `lean` 单独 typecheck 过
（`LEAN_PATH=<release>/lib/lean lean -R src -o /tmp/Main.olean src/Lean/Meta/Tactic/Simp/Main.lean`）。
它改的是 Lean 源码，计入 cgen / objects 缓存键；CI 的 link 校验会确认
`simpLoopStep` 真的进了 wasm，缺失就失败。

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
