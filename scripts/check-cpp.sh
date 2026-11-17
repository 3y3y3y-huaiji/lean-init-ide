#!/usr/bin/env bash
# 手写 C/C++ 的静态门禁：格式 + 编译告警 + clang-tidy。
#
# 范围只有仓库里手写的 C/C++（目前是 scripts/depth-probe）。
# 上游 Lean runtime 与 `lean -c` 生成的 C 由上游自己负责，这里不扫：
# 全量扫会产出几千条历史写法告警，最后只能把规则整体关掉。
# yield-rec.cpp 依赖 emscripten.h，本机（以及只装了 clang 的 runner）没有该头文件，
# 改由 depth-probe workflow 的 emcc 构建来覆盖，这里只做格式化。
set -euo pipefail

cd "$(dirname "$0")/.."

CLANG_FORMAT=${CLANG_FORMAT:-clang-format}
CLANG_TIDY=${CLANG_TIDY:-clang-tidy}
CLANGXX=${CLANGXX:-clang++}

mapfile -t files < <(git ls-files 'scripts/**/*.cpp' 'scripts/**/*.cc' 'scripts/**/*.c')
if [ ${#files[@]} -eq 0 ]; then
  echo '没有需要检查的 C/C++ 文件'
  exit 0
fi

echo "== clang-format: ${#files[@]} 个文件"
"$CLANG_FORMAT" --dry-run --Werror "${files[@]}"

mapfile -t native < <(printf '%s\n' "${files[@]}" | grep -v '^scripts/depth-probe/yield-rec\.cpp$' || true)

echo "== clang++ -Wall -Wextra -Werror: ${#native[@]} 个文件"
for file in "${native[@]}"; do
  "$CLANGXX" -std=c++20 -Wall -Wextra -Werror -pthread -fsyntax-only "$file"
done

echo '== clang-tidy'
"$CLANG_TIDY" "${native[@]}" -- -std=c++20 -pthread

echo 'C/C++ 门禁通过'
