// 生产运行时是 -pthread 模型：Lean 的求值很可能跑在线程池里的线程上。
// 这个探针把同一段非尾递归放进 pthread，用来回答「调大线程栈能不能抬深度」。
#include <pthread.h>
#include <stddef.h>

// volatile 写入阻止 -O2 把 rec(n-1)+1 折成循环；否则测到的是循环上界，不是栈上界。
volatile int sink;

__attribute__((noinline)) int rec(int n) {
  if (n == 0)
    return 1;
  const int inner = rec(n - 1);
  sink = inner;
  return inner + 1;
}

namespace {
struct Arg {
  int n;
  int result;
};

void *run(void *raw) {
  auto *arg = static_cast<Arg *>(raw);
  arg->result = rec(arg->n);
  return nullptr;
}
} // namespace

extern "C" int pthread_probe(int n, int stackMb) {
  pthread_attr_t attr;
  pthread_attr_init(&attr);
  // 0 表示沿用构建时的 DEFAULT_PTHREAD_STACK_SIZE。
  if (stackMb > 0) {
    pthread_attr_setstacksize(&attr, static_cast<size_t>(stackMb) * 1024 * 1024);
  }
  Arg arg{n, 0};
  pthread_t thread;
  const int rc = pthread_create(&thread, &attr, run, &arg);
  pthread_attr_destroy(&attr);
  if (rc != 0)
    return -1;
  pthread_join(thread, nullptr);
  return arg.result;
}
