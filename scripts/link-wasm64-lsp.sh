#!/usr/bin/env bash
# 链接一个 LSP 专用的 wasm 变体：-sPROXY_TO_PTHREAD=1。
#
# 为什么需要第二份产物：Lean 的 FileWorker 用 `Std.Channel.forAsync (prio := .dedicated)`
# 把 LSP 输出放到专用线程。默认构建里 main 跑在主 JS 线程上，harness 在主线程
# `Atomics.wait` 等 stdin 时，pthread 的消息永远泵不回来，publishDiagnostics 就出不来。
# PROXY_TO_PTHREAD 把 main 放到 pthread 上，主线程空出来泵消息。
#
# 用法: bash scripts/link-wasm64-lsp.sh <repoRoot> [--release]   （需要已 source emsdk）
# --release 会写到 work/release-lsp/，剥离 --profiling-funcs 与 EXCEPTION_STACK_TRACES，
# 并压出 lean-lsp.wasm.zst 供生产环境评估体积。
set -euo pipefail
ROOT="${1:?usage: link-wasm64-lsp.sh <repoRoot> [--release]}"
MODE="${2:-}"
if [ -n "$MODE" ] && [ "$MODE" != "--release" ]; then
  echo "unknown flag: $MODE" >&2
  exit 2
fi

WORK="$ROOT/work"
BUILD="$WORK/build-wasm"
OBJ="$WORK/obj"
GMP="$WORK/gmp-install"

DEBUG_FLAGS=(-sEXCEPTION_STACK_TRACES=1 --profiling-funcs)
DIST="$WORK/dist"
if [ "$MODE" = "--release" ]; then
  DEBUG_FLAGS=()
  DIST="$WORK/release-lsp"
fi
mkdir -p "$DIST"

# 初始堆降到 512 MiB（Init 稳态 ~370-500 MiB），按需扩展到 4 GiB：
# 避免小文件无谓保留 2 GiB 提交内存，也能让前端真实观测到 memory.grow。
emcc -sMEMORY64=1 -mtail-call -O3 -pthread -fwasm-exceptions @"$OBJ/objs.rsp" "$OBJ/symtab.o" \
  "$BUILD/lib/temp/libleanmain.a" "$BUILD/lib/temp/libleanshell.a" \
  "$BUILD/lib/lean/libleancpp.a" "$BUILD/lib/lean/libleanrt.a" "$GMP/lib/libgmp.a" \
  "$BUILD/libuv/src/libuv/libuv.a" \
  -Wl,--gc-sections \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=536870912 -sMAXIMUM_MEMORY=4294967296 \
  -sSTACK_SIZE=16777216 -sDEFAULT_PTHREAD_STACK_SIZE=33554432 -sPTHREAD_POOL_SIZE=48 \
  "${DEBUG_FLAGS[@]}" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLean -sENVIRONMENT=web,worker,node \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sFORCE_FILESYSTEM=1 -lnodefs.js \
  -sEXPORTED_RUNTIME_METHODS=FS,callMain,ENV,NODEFS \
  -sPROXY_TO_PTHREAD=1 \
  -o "$DIST/lean-lsp.mjs"

ls -l "$DIST/lean-lsp.mjs" "$DIST/lean-lsp.wasm"
if [ "$MODE" = "--release" ]; then
  zstd -19 -T0 -f -q "$DIST/lean-lsp.wasm" -o "$DIST/lean-lsp.wasm.zst"
  ls -l "$DIST/lean-lsp.wasm.zst"
  echo "lean-lsp.wasm.zst: $(( $(stat -c%s "$DIST/lean-lsp.wasm.zst") / 1048576 )) MB"
fi
