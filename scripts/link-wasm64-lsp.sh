#!/usr/bin/env bash
# 链接一个 LSP 专用的 wasm 变体：-sPROXY_TO_PTHREAD=1。
#
# 为什么需要第二份产物：Lean 的 FileWorker 用 `Std.Channel.forAsync (prio := .dedicated)`
# 把 LSP 输出放到专用线程。默认构建里 main 跑在主 JS 线程上，harness 在主线程
# `Atomics.wait` 等 stdin 时，pthread 的消息永远泵不回来，publishDiagnostics 就出不来。
# PROXY_TO_PTHREAD 把 main 放到 pthread 上，主线程空出来泵消息。
#
# 用法: bash scripts/link-wasm64-lsp.sh <repoRoot>   （需要已 source emsdk）
set -euo pipefail
ROOT="${1:?usage: link-wasm64-lsp.sh <repoRoot>}"
WORK="$ROOT/work"
BUILD="$WORK/build-wasm"
OBJ="$WORK/obj"
DIST="$WORK/dist"
GMP="$WORK/gmp-install"

emcc -sMEMORY64=1 -O2 -pthread -fwasm-exceptions @"$OBJ/objs.rsp" "$OBJ/symtab.o" \
  "$BUILD/lib/temp/libleanmain.a" "$BUILD/lib/temp/libleanshell.a" \
  "$BUILD/lib/lean/libleancpp.a" "$BUILD/lib/lean/libleanrt.a" "$GMP/lib/libgmp.a" \
  "$BUILD/libuv/src/libuv/libuv.a" \
  -Wl,--gc-sections \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=2147483648 -sMAXIMUM_MEMORY=4294967296 \
  -sSTACK_SIZE=16777216 -sDEFAULT_PTHREAD_STACK_SIZE=67108864 -sPTHREAD_POOL_SIZE=4 \
  -sEXCEPTION_STACK_TRACES=1 --profiling-funcs \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLean -sENVIRONMENT=web,worker,node \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sFORCE_FILESYSTEM=1 -lnodefs.js \
  -sEXPORTED_RUNTIME_METHODS=FS,callMain,ENV,NODEFS \
  -sPROXY_TO_PTHREAD=1 \
  -o "$DIST/lean-lsp.mjs"

ls -l "$DIST/lean-lsp.mjs" "$DIST/lean-lsp.wasm"
