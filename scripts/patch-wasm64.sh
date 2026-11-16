#!/usr/bin/env bash
# 把 wasm-llvm 的 lean-browser 构建脚本改成 wasm64 + GMP 版本。
# 用法: bash scripts/patch-wasm64.sh <repoRoot>
#
# GMP 用 emcc 编成静态库放到 <repoRoot>/work/gmp-install，
# Lean 的 CMake 通过 GMP_INSTALL_PREFIX 找 include/gmp.h 与 lib/libgmp.a。
#
# EXIT_RUNTIME=0：EXIT_RUNTIME=1 会在 main 返回后跑静态析构，官方 Init olean（402MB）下
# `~initializer` 里的 free 会抢 pthread 锁，浏览器主线程不允许 Atomics.wait，直接抛异常。
# 进程退出码由 callMain 返回，不依赖析构。
set -euo pipefail
ROOT="${1:?usage: patch-wasm64.sh <repoRoot>}"
SCRIPT="$ROOT/wasm-llvm/producer/lean-browser/scripts/build.sh"
GMP="$ROOT/work/gmp-install"

if grep -q 'GMP_INSTALL_PREFIX' "$SCRIPT"; then
  echo "build.sh 已打过补丁，跳过"
  exit 0
fi

PY=python3
command -v python3 > /dev/null 2>&1 || PY=python

sed -i \
  -e 's|-DCMAKE_BUILD_TYPE=Release|-DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS=-sMEMORY64=1 -DCMAKE_CXX_FLAGS=-sMEMORY64=1 -DCMAKE_EXE_LINKER_FLAGS=-sMEMORY64=1|' \
  -e 's|emcc -c -O2|emcc -sMEMORY64=1 -c -O2|g' \
  -e 's|emcc -O2 -pthread|emcc -sMEMORY64=1 -O2 -pthread|g' \
  -e 's|-sMODULARIZE=1|-sEXCEPTION_STACK_TRACES=1 --profiling-funcs -sMODULARIZE=1|' \
  -e 's|-sINITIAL_MEMORY=268435456|-sINITIAL_MEMORY=2147483648|' \
  -e 's|-sDEFAULT_PTHREAD_STACK_SIZE=8388608|-sDEFAULT_PTHREAD_STACK_SIZE=67108864|' \
  -e 's|-sEXIT_RUNTIME=1|-sEXIT_RUNTIME=0|' \
  -e 's|-sPTHREAD_POOL_SIZE=4|-sPTHREAD_POOL_SIZE=16|' \
  "$SCRIPT"

"$PY" - "$SCRIPT" "$GMP" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
gmp = sys.argv[2]
text = path.read_text()
text = text.replace("-DUSE_GMP=OFF", f"-DUSE_GMP=ON -DGMP_INSTALL_PREFIX={gmp}")
text = text.replace('-I"$BUILD/include"', f'-I"$BUILD/include" -I"{gmp}/include"')
text = text.replace('"$BUILD/lib/lean/libleanrt.a"', f'"$BUILD/lib/lean/libleanrt.a" "{gmp}/lib/libgmp.a"')
path.write_text(text)
PY

grep -n -- 'MEMORY64\|GMP' "$SCRIPT"
