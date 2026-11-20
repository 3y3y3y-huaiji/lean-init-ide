// 对照实现：同一个「递归结果还要参与外层计算」的非尾递归，
// 把续延（successK）放到堆上的显式工作栈，原生栈深度恒定为 1。
// 用静态数组而不是 std::vector，保证可以用 clang 直接编成 freestanding wasm 做离线对比。
extern "C" {
struct Frame {
  bool add;
  int n;
};

__attribute__((noinline)) int heap_probe(int n) {
  static Frame work[1 << 21];
  int top = 0;
  work[top++] = {false, n};
  int result = 0;
  while (top > 0) {
    const Frame frame = work[--top];
    if (frame.add) {
      result += 1;
    } else if (frame.n > 0) {
      work[top++] = {true, 0};
      work[top++] = {false, frame.n - 1};
    }
  }
  return result;
}
}
