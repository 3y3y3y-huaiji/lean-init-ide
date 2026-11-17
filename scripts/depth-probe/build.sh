#!/usr/bin/env bash
# 构建深递归探针的各种运行时配置。只编两个十几行的 demo，不碰 Lean。
# 用法: bash scripts/depth-probe/build.sh [输出目录]
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$ROOT/../../work/depth-probe}"
mkdir -p "$OUT"

EMSDK_DIR="${EMSDK:-}"
if [ -n "$EMSDK_DIR" ] && [ -f "$EMSDK_DIR/emsdk_env.sh" ]; then
  # shellcheck disable=SC1090
  source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1
fi
if ! command -v emcc >/dev/null; then
  for candidate in "$ROOT/../../emsdk" /tmp/emsdk; do
    if [ -x "$candidate/upstream/emscripten/emcc" ]; then
      EMSDK_DIR="$candidate"
      # shellcheck disable=SC1090
      source "$candidate/emsdk_env.sh" >/dev/null 2>&1
      break
    fi
  done
fi
command -v emcc >/dev/null || { echo '找不到 emcc：装 emsdk 6.0.0、系统 emscripten，或设置 EMSDK' >&2; exit 1; }

WASM_DIS=''
if [ -n "$EMSDK_DIR" ] && [ -x "$EMSDK_DIR/upstream/bin/wasm-dis" ]; then
  WASM_DIS="$EMSDK_DIR/upstream/bin/wasm-dis"
elif command -v wasm-dis >/dev/null; then
  WASM_DIS="$(command -v wasm-dis)"
fi

COMMON=(
  -O2
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sENVIRONMENT=web,worker
  -sALLOW_MEMORY_GROWTH=1
  -sEXIT_RUNTIME=0
  -sFILESYSTEM=0
  "${STACK_FLAG:--sSTACK_SIZE=8388608}"
  -sINITIAL_MEMORY=33554432
  --no-entry
)

SUMMARY="$OUT/summary.tsv"
: > "$SUMMARY"

# build <名字> <源文件> <导出函数> [额外参数...]
build() {
  local name="$1" src="$2" exports="$3"
  shift 3
  local start end ms bytes status error call
  start="$(date +%s%3N)"
  if emcc "$ROOT/$src" "${COMMON[@]}" \
      "-sEXPORTED_FUNCTIONS=$exports" \
      "$@" -o "$OUT/$name.mjs" > "$OUT/$name.log" 2>&1; then
    status=ok
    error=''
  else
    status=failed
    error="$(tr '\n\t' '  ' < "$OUT/$name.log" | cut -c1-400)"
  fi
  end="$(date +%s%3N)"
  ms=$((end - start))
  bytes=0
  [ -f "$OUT/$name.wasm" ] && bytes="$(stat -c %s "$OUT/$name.wasm")"
  call=0
  if [ -n "$WASM_DIS" ] && [ -f "$OUT/$name.wasm" ]; then
    call="$("$WASM_DIS" "$OUT/$name.wasm" 2>/dev/null | grep -c 'return_call' || true)"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$name" "$status" "$src" "$bytes" "$ms" "$call" "$error" >> "$SUMMARY"
  printf '%-14s %-7s %8s B %7s ms return_call=%s\n' "$name" "$status" "$bytes" "$ms" "$call"
}

# 同步递归：JSPI 只改「wasm 调 JS 异步导入」的挂起语义，预期不改变纯 wasm 递归上界。
build baseline deep-rec.cpp _depth_probe,_tail_probe
build jspi deep-rec.cpp _depth_probe,_tail_probe -sJSPI=1
# 尾调用对照组：互递归在 -mtail-call 下应变成 return_call_indirect，不再压栈。
build tailcall deep-rec.cpp _depth_probe,_tail_probe -mtail-call -DUSE_TAIL_CALL

# 挂起对照组：每 64 层 sleep 一次。ASYNCIFY 会把栈展开到线性内存。
build asyncify yield-rec.cpp _yield_probe -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=1048576 -sEXPORTED_RUNTIME_METHODS=ccall,Asyncify
build jspi-yield yield-rec.cpp _yield_probe -sJSPI=1 -sJSPI_EXPORTS=_yield_probe -sJSPI_IMPORTS=emscripten_sleep

# 堆上工作栈对照组：同样的非尾递归，原生栈深度恒定为 1。
build heapstack heap-stack.cpp _heap_probe

# 浏览器级 JSPI 对照组：不依赖 Emscripten，只需要 wabt 把 WAT 汇编成 wasm。
if command -v wat2wasm >/dev/null; then
  start="$(date +%s%3N)"
  if wat2wasm "$ROOT/jspi-suspend.wat" -o "$OUT/jspi-suspend.wasm" > "$OUT/jspi-suspend.log" 2>&1; then
    cp "$ROOT/jspi-suspend.mjs" "$OUT/jspi-suspend.mjs"
    status=ok
    error=''
  else
    status=failed
    error="$(tr '\n' ' ' < "$OUT/jspi-suspend.log" | cut -c1-400)"
  fi
  end="$(date +%s%3N)"
  bytes=0
  [ -f "$OUT/jspi-suspend.wasm" ] && bytes="$(stat -c %s "$OUT/jspi-suspend.wasm")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' jspi-suspend "$status" jspi-suspend.wat "$bytes" "$((end - start))" 0 "$error" >> "$SUMMARY"
  printf '%-14s %-7s %8s B\n' jspi-suspend "$status" "$bytes"
else
  echo 'wat2wasm 不在 PATH，跳过 jspi-suspend（可直接用 npm 安装 wabt）'
fi

# 冲突验证：生产运行时是 -pthread，JSPI 与它不兼容时这里应当失败或告警。
build pthread-jspi deep-rec.cpp _depth_probe,_tail_probe -pthread -sJSPI=1 -sPTHREAD_POOL_SIZE=2
build pthread-baseline deep-rec.cpp _depth_probe,_tail_probe -pthread -sPTHREAD_POOL_SIZE=2

# pthread 栈大小对照：同一段递归放进线程池线程，只改线程栈。
build pthread-stack-64k pthread-rec.cpp _pthread_probe -pthread -sPTHREAD_POOL_SIZE=2 -sDEFAULT_PTHREAD_STACK_SIZE=65536
build pthread-stack-8m pthread-rec.cpp _pthread_probe -pthread -sPTHREAD_POOL_SIZE=2 -sDEFAULT_PTHREAD_STACK_SIZE=8388608 -sINITIAL_MEMORY=67108864
build pthread-stack-32m pthread-rec.cpp _pthread_probe -pthread -sPTHREAD_POOL_SIZE=2 -sDEFAULT_PTHREAD_STACK_SIZE=33554432 -sINITIAL_MEMORY=134217728

node - "$SUMMARY" "$OUT/build-summary.json" <<'NODE'
const fs = require('node:fs');
const [tsvPath, jsonPath] = process.argv.slice(2);
const rows = fs.readFileSync(tsvPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => {
  const [name, status, source, bytes, ms, returnCalls, error] = line.split('\t');
  return { name, status, source, bytes: Number(bytes), buildMs: Number(ms), returnCalls: Number(returnCalls), error };
});
fs.writeFileSync(jsonPath, `${JSON.stringify({ rows }, null, 2)}\n`);
NODE

echo "产物与耗时: $OUT/build-summary.json"
