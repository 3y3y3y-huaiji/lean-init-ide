#!/usr/bin/env bash
# 用 emcc 编一个 wasm64 的静态 GMP，供 Lean 的 USE_GMP=ON 使用。
# 用法: bash scripts/build-wasm64-gmp.sh <installDir>
#
# USE_GMP=OFF 与官方 olean（GMP 编码，flags=1）不兼容；
# 自己编 GMP 之后 flags 与 githash 都对得上，官方 Init/Std/Lean olean 可以直接用。
set -euo pipefail
DEST="${1:?usage: build-wasm64-gmp.sh <installDir>}"
VERSION=6.3.0
BASE="$(dirname "$DEST")"
SRC="$BASE/gmp-$VERSION"
TARBALL="$BASE/gmp-$VERSION.tar.xz"

if [ -f "$DEST/lib/libgmp.a" ] && [ -f "$DEST/include/gmp.h" ]; then
  echo "gmp already built: $DEST"
  exit 0
fi

if [ ! -d "$SRC" ]; then
  [ -f "$TARBALL" ] || curl -fL --retry 3 -o "$TARBALL" "https://gmplib.org/download/gmp/gmp-$VERSION.tar.xz"
  tar -xJf "$TARBALL" -C "$BASE"
fi

cd "$SRC"
# --host 与构建机不同 -> cross 模式，configure 不跑 wasm 测试程序；
# 生成 mpn 表的辅助程序仍用宿主编译器（CC_FOR_BUILD）。
emconfigure ./configure \
  --prefix="$(cd "$BASE" && pwd)/$(basename "$DEST")" \
  --host=wasm64-unknown-none \
  --disable-assembly \
  --enable-static \
  --disable-shared \
  --with-pic \
  CC="emcc -sMEMORY64=1" \
  CFLAGS="-O2 -sMEMORY64=1" \
  AR=emar \
  RANLIB=emranlib
make -j"${JOBS:-3}"
make install

ls -l "$DEST/lib/libgmp.a" "$DEST/include/gmp.h"
