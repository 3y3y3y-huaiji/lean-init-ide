#include <emscripten.h>

// 每 YIELD_INTERVAL 层挂起一次：ASYNCIFY 会把栈展开到线性内存，JSPI 交给 V8 的栈切换。
// 用来回答「把执行路径拆成挂起点后，原生栈上界还在不在」。
extern "C" {
// 与 deep-rec.cpp 同理：volatile 写入让 LLVM 不能把累积递归折成循环。
// 没有它，-O2 下 yield_rec 里一条自调用都不剩，测出来的是循环不是递归。
volatile int sink;

#ifndef YIELD_INTERVAL
#define YIELD_INTERVAL 64
#endif

#ifdef PROBE_NO_YIELD
#define probe_yield() ((void)0)
#else
#define probe_yield() emscripten_sleep(0)
#endif

__attribute__((noinline)) int yield_rec(int n) {
  if (n == 0)
    return 0;
  if (n % YIELD_INTERVAL == 0)
    probe_yield();
  const int inner = yield_rec(n - 1);
  sink = inner;
  return inner + 1;
}

int yield_probe(int n) { return yield_rec(n); }
}
