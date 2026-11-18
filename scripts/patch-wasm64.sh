#!/usr/bin/env bash
# 把 wasm-llvm 的 lean-browser 构建脚本改成 wasm64 + GMP + tail call 版本。
# 用法: bash scripts/patch-wasm64.sh <repoRoot>
#
# 这里只改 producer 的 build.sh 开关。Lean 源码补丁（scripts/patches/*.patch）
# 必须在 build.sh fetch 之后应用：fetch 会对 work/lean4 做 reset --hard，提前打会被冲掉。
# 显式工作栈的两个补丁（lean-whnf-stack.patch / lean-replace-fn-iterative.patch）
# 由 .github/workflows/spike-wasm64.yml 在 fetch 步骤末尾按序应用并 grep 校验。
#
# -mtail-call 打开 WebAssembly 尾调用（return_call）。wasm64 本身已经要求 Memory64，
# 浏览器范围早就被收窄过一次，再叠一个 tail-call 不会额外损失兼容性；
# 换来的是尾递归函数不再占栈（V8 因为 return_call 直接复用当前帧）。
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

# tail call：clang 对 wasm 默认不做兄弟调用优化，尾递归函数照样一层层压栈；
# -mtail-call 才让它在尾位置发 return_call / return_call_indirect。
# 关键是**编译步**必须带：只在 link 加上，.o 里根本没有 return_call，等于没加。
# CMAKE_* 的值里含空格，必须整体加单引号——build.sh 的 cmake 行没有引号，不包起来会被拆成两个 argv。
# 优化等级与 wasm32 主线一致：cgen 生成的 C 与 runtime 都用 -O3。
# wasm32 主线实测 -O3 更快，这里同步；缓存键已并入本脚本，改完会重编。
sed -i \
  -e "s|-DCMAKE_BUILD_TYPE=Release|-DCMAKE_BUILD_TYPE=Release '-DCMAKE_C_FLAGS=-sMEMORY64=1 -mtail-call' '-DCMAKE_CXX_FLAGS=-sMEMORY64=1 -mtail-call' '-DCMAKE_EXE_LINKER_FLAGS=-sMEMORY64=1 -mtail-call'|" \
  -e 's|emcc -c -O2|emcc -sMEMORY64=1 -mtail-call -c -O3|g' \
  -e 's|emcc -O2 -pthread|emcc -sMEMORY64=1 -mtail-call -O3 -pthread|g' \
  -e 's|-sMODULARIZE=1|-sEXCEPTION_STACK_TRACES=1 --profiling-funcs -sMODULARIZE=1|' \
  -e 's|-sINITIAL_MEMORY=268435456|-sINITIAL_MEMORY=2147483648|' \
  -e 's|-sDEFAULT_PTHREAD_STACK_SIZE=8388608|-sDEFAULT_PTHREAD_STACK_SIZE=67108864|' \
  -e 's|-sEXIT_RUNTIME=1|-sEXIT_RUNTIME=0|' \
  -e 's|-sPTHREAD_POOL_SIZE=4|-sPTHREAD_POOL_SIZE=8|' \
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

grep -q -- '-O3' "$SCRIPT" || {
  echo 'build.sh 里没有 -O3，优化等级替换失败' >&2
  exit 1
}
grep -n -- 'MEMORY64\|GMP\|-O3' "$SCRIPT"
