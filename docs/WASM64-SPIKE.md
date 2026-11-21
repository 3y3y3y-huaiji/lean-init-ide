**何时读我**：修改实验性 `wasm64` 构建链、升级 Lean 版本 pin、调整三份堆栈补丁或排查差分门禁失败时阅读。
**单一事实来源**：版本 pin 见 [pin-lean.ts](../scripts/pin-lean.ts)，现行架构边界见 [DECISIONS.md](DECISIONS.md) ADR-03。
**维护边界**：只记录当前生效的 `wasm64` 构建、补丁与验证规范；历史实验探针与早期调试日志已归档到 [WASM64-SPIKE-EXPERIMENTS.md](archive/WASM64-SPIKE-EXPERIMENTS.md)。

# wasm64 运行时规范与升级 SOP

实验性 `wasm64`（Emscripten `MEMORY64=1` + `USE_GMP=ON`）打破 4 GiB 地址空间限制以承载 Mathlib 教学子集，运行在独立构建链与 [spike-wasm64.yml](../.github/workflows/spike-wasm64.yml) 上，默认生产入口仍为 `wasm32`。

## 版本 Pin 与升级清单一

版本唯一定义在 [scripts/pin-lean.ts](../scripts/pin-lean.ts) 的 `LEAN_PIN`（当前默认 **4.36.0-rc2**）：

- **临时验证**：同时传入 `LEAN_PIN_VERSION` / `LEAN_PIN_COMMIT` / `LEAN_PIN_BOOTSTRAP_URL` / `LEAN_PIN_BOOTSTRAP_SHA256`（缺一报错）。
- **正式升级**：必须修改 `LEAN_PIN` 让 CI 缓存键 `hashFiles(...)` 自动失效，否则 `stage_cgen` / `stage_objects` / Mathlib 缓存会混出不匹配的混合二进制。

升级顺序（不可颠倒）：

1. 更新 [scripts/pin-lean.ts](../scripts/pin-lean.ts) 中的 `LEAN_PIN`。
2. 验证 [scripts/ci/backport-wasm64.ts](../scripts/ci/backport-wasm64.ts) 与三份栈补丁在新源码上 `patch -p1 --dry-run` 通过；锚点变化时重做补丁。
3. **同一份打过补丁的源码构建 `.olean`**（见 [DECISIONS.md](DECISIONS.md) ADR-03）：当 `.lean` 补丁改变了公开或内部签名时，绝不能与上游未打补丁官方 `.olean` 混用。
4. 在 Actions 运行完整构建与差分门禁通过后，再同步更新 [config/lean4-wasm64-runtime.json](../config/lean4-wasm64-runtime.json)。

## 三份现行堆栈补丁

Chrome Dedicated Worker 原生调用栈上限约 1 MB，下列补丁将热点递归转化为堆上显式工作栈：

| 补丁 | 目标 | 作用与缓存键归属 |
| --- | --- | --- |
| [lean-replace-fn-iterative.patch](../scripts/patches/lean-replace-fn-iterative.patch) | `<lean4>/src/kernel/replace_fn.cpp` | `Expr.replace` 后序迭代化；计入 `runtime` 缓存键 |
| [lean-whnf-stack.patch](../scripts/patches/lean-whnf-stack.patch) | `<lean4>/src/Lean/Meta/WHNF.lean` | `whnfCore / whnfEasyCases / reduceRec` 栈缓解；计入 `cgen`/`objects` |
| [lean-simp-loop-stack.patch](../scripts/patches/lean-simp-loop-stack.patch) | `<lean4>/src/Lean/Meta/Tactic/Simp/Main.lean` | `simpLoop` 三处非尾调用改为显式续延栈；计入 `cgen`/`objects` |

## 差分与静态门禁

本地仅运行零构建静态检查与门禁单测：

```bash
pnpm run format:check:spike
pnpm run lint:spike
pnpm run typecheck:spike
pnpm run test:spike
```

Actions 中的行为硬基准为 [scripts/wasm64-patch-equivalence.ts](../scripts/wasm64-patch-equivalence.ts)：同一语料对比官方原生 Lean 与打补丁 `wasm64`，校验归一化 stdout 逐字节一致。

- **容忍边界**：仅允许「退出期已知 trap」（stderr 命中 `emscripten_builtin_free` / `lean_dec_ref_cold` 且 stdout 逐字节一致，重跑复现才降级告警）及 `IO.Process.exit` 退出码差异（worker `DataCloneError` 已知限制）。
- **红线**：任意 stdout 差异或栈溢出（`Maximum call stack size exceeded`）必须直接失败。

## 现行浏览器侧关键机制与待收口项

- **诊断与协议隔离**：stdout 专供 JSON-RPC `Content-Length` 帧，`<lean4>/src/util/shell.cpp` 异常按 `[LEAN_WASM_ERR]` 输出到 stderr（支持 `Module.ENV.LEAN_WASM_TRACE=1`）。
- **IPC 环形缓冲**：[src/lean-wasm64-supervisor.ts](../src/lean-wasm64-supervisor.ts) 管理独立 Worker 进程与 SharedArrayBuffer stdin 环形缓冲（memory64 下 `struct iovec` 为 16 字节 stride，`_fd_read` 短等 1ms 并泵 `__emscripten_check_mailbox()`）。
- **当前待收口项**：`.olean` 自洽构建与按需扩展包接入尚未完成全量浏览器联调，详见 [DECISIONS.md](DECISIONS.md)。
