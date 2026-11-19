// 最小深递归探针：volatile 写入阻止编译器把纯递归折叠成 return n。
extern "C" {
volatile int sink;

__attribute__((noinline)) int rec(int n, int seed) {
  if (n == 0)
    return seed;
  const int inner = rec(n - 1, seed);
  sink = inner;
  return inner + 1;
}

// 互递归 + musttail 才能稳定生成 return_call；LLVM 会把自递归尾调用直接改成循环。
#ifdef USE_TAIL_CALL
#define TAIL_CALL [[clang::musttail]]
#else
#define TAIL_CALL
#endif

__attribute__((noinline)) int odd_step(int n, int acc);
__attribute__((noinline)) int even_step(int n, int acc) {
  if (n == 0)
    return acc;
  TAIL_CALL return odd_step(n - 1, acc + 1);
}
__attribute__((noinline)) int odd_step(int n, int acc) {
  if (n == 0)
    return acc;
  TAIL_CALL return even_step(n - 1, acc + 1);
}

int depth_probe(int n, int seed) { return rec(n, seed); }
int tail_probe(int n, int seed) { return even_step(n, sink + seed); }
}
