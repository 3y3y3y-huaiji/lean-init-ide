#!/usr/bin/env bash
# 链接发布用的 wasm64 Lean：去掉 --profiling-funcs 与 EXCEPTION_STACK_TRACES。
# 这两项是调试用的，会让 129MB 的 wasm 多出近一半体积、压缩率从 ~11x 掉到 ~6x。
# 用法: bash scripts/link-wasm64-release.sh <repoRoot>   （需要已 source emsdk）
set -euo pipefail
ROOT="${1:?usage: link-wasm64-release.sh <repoRoot>}"
WORK="$ROOT/work"
BUILD="$WORK/build-wasm"
OBJ="$WORK/obj"
DIST="$WORK/release"
GMP="$WORK/gmp-install"
mkdir -p "$DIST"

emcc -sMEMORY64=1 -mtail-call -O3 -pthread -fwasm-exceptions @"$OBJ/objs.rsp" "$OBJ/symtab.o" \
  "$BUILD/lib/temp/libleanmain.a" "$BUILD/lib/temp/libleanshell.a" \
  "$BUILD/lib/lean/libleancpp.a" "$BUILD/lib/lean/libleanrt.a" "$GMP/lib/libgmp.a" \
  "$BUILD/libuv/src/libuv/libuv.a" \
  -Wl,--gc-sections \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=536870912 -sMAXIMUM_MEMORY=4294967296 \
  -sSTACK_SIZE=16777216 -sDEFAULT_PTHREAD_STACK_SIZE=67108864 -sPTHREAD_POOL_SIZE=8 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLean -sENVIRONMENT=web,worker,node \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sFORCE_FILESYSTEM=1 -lnodefs.js \
  -sEXPORTED_RUNTIME_METHODS=FS,callMain,ENV,NODEFS \
  -o "$DIST/lean.mjs"

ls -l "$DIST/lean.mjs" "$DIST/lean.wasm"
# 发行用 zstd（整个仓库的资产都是 zstd）；比 gzip 小，解压也快。
zstd -19 -T0 -f -q "$DIST/lean.wasm" -o "$DIST/lean.wasm.zst"
ls -l "$DIST/lean.wasm.zst"
echo "lean.wasm.zst: $(( $(stat -c%s "$DIST/lean.wasm.zst") / 1048576 )) MB"
