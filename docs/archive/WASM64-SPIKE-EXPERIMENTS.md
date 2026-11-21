> **历史归档声明**：本文档保存 2026-11-15 至 2026-11-18 期间针对 `wasm64` 构建选项、`-mtail-call` 审计、Chrome Worker 递归深度探针（ASYNCIFY / JSPI / pthread / 显式工作栈）与早期排障的过程日志，供审计与历史考古参考。**严禁将本文内容当作当前实现或开发规范**；现行 wasm64 架构与升级规范请阅读 [docs/WASM64-SPIKE.md](../WASM64-SPIKE.md) 与 [docs/DECISIONS.md](../DECISIONS.md)。

# wasm64 早期实验与探针历史日志（归档）

## 早期踩坑记录（v4.34.1 → v4.36.0-rc2）

1. **`LEAN_SCALAR_PTR_LITERAL` 按工具链而非指针宽度分支**：v4.34.1 下静态 `Name` 哈希被截断成 32 位导致 `unknown parser category 'level'`；已通过 `scripts/ci/backport-wasm64.ts` 从 upstream PR #15816 backport（改为按 `UINTPTR_MAX == UINT32_MAX` 分支）。
2. **`-O0` 帧膨胀**：`-O0` 下 `getHeadInfo?` 深递归叠加 `lean_alloc` 直接爆栈，切回 `-O2` 后 649 个 Init 模块通过。
3. **自建 vs 官方 `.olean` 演进**：
   - 早期因 `-DUSE_GMP=OFF`（`flags=0`）无法读取官方 GMP `.olean`（`flags=1`），切换 `USE_GMP=ON` 后曾在未改签名期复用官方 `Init/Std/Lean` `.olean`。
   - 后续由于 `WHNF.lean` 与 `Simp/Main.lean` 栈补丁实质修改了函数签名（如 `simpLoop.visitPreContinue` 参数变更），已确认必须使用**同一份打过补丁的源码（同 `LEAN_GITHASH` + `USE_GMP=ON`）自洽构建 `.olean`**（见 [ADR-03](../DECISIONS.md#adr-03)）。
4. **worker 通信与内存模型细节**：
   - Emscripten `Module.stdin` 需逐字节返回字符码（返回 `Buffer` 会转 `\x00`）；
   - Memory64 下 `struct iovec` 为 16 字节（8 字节 base + 8 字节 len），`nread` 为 8 字节 `size_t`；
   - LSP `--worker -j4` 并发线程数需 `-sPTHREAD_POOL_SIZE=48`、`-sDEFAULT_PTHREAD_STACK_SIZE=32MB`，`_fd_read` 等待采用 `1ms` `Atomics.wait` 并泵 `__emscripten_check_mailbox()`；
   - `-sEXIT_RUNTIME=0` + `wasm_exit_exception` 避免静态析构阶段主线程 `Atomics.wait` 死锁。

## `-mtail-call` 审计（2026-11-17）

- 通过 `.github/workflows/depth-probe.yml`（`whnf-audit`）对 `Lean.Meta.WHNF` 编译结果统计 `return_call`：
  - `lean_whnf`（1,024 行）：`return_call = 0`
  - `whnfEasyCases(whnfImp)`（7,117 行）：`return_call = 0`
  - `whnfEasyCases(whnfCore)`（8,026 行）：`return_call = 0`
  - `reduceRec___redArg`（5,458 行）：`return_call = 0`
- 给 `reduceRec` / `reduceQuotRec` 加 `@[specialize]` 后产物 SHA-1 与原版一致。结论：**热点环本质上是非尾递归，`-mtail-call` 与 `@[specialize]` 均无法压平该环**，已划掉。

## 浏览器 Worker 递归深度探针（2026-11-17，HeadlessChrome 157 + emsdk 6.0.0）

| 配置 | 递归上界 | 结论 |
| --- | --- | --- |
| 普通非尾递归 | 7,974 层 | Worker 原生栈约 1 MB |
| 互递归 + `-mtail-call` | ≥ 4,194,304 | 仅对真尾位置有效 |
| 堆上显式工作栈 | ≥ 1,048,576 | 摆脱原生栈限制 |
| ASYNCIFY（1 / 8 / 32 MB，每 64 层 yield） | 24,453–24,455 | 固定 ~3 倍上界且全程序膨胀 ~50% |
| JSPI（已决议 Promise） | 13,439 (`pending=0`) | 未真挂起，无效样本 |
| JSPI（未决 Promise，64 层/每层） | 17,258 | V8 独立约 984 kB 栈切换预算，不回收栈 |
| Emscripten JSPI（8 MB / 1 MB 线性栈） | 15,359 | 与线性栈大小无关 |

排除路线：JSPI（仍受 ~1 MB 预算且与 `-pthread` 不兼容）、ASYNCIFY（固定 3x 且开销过大）、调大 `--stack-size` / `@[specialize]`。唯一治本路径是将内核与 Lean 热环续延显式堆栈化。
