// 浏览器级 JSPI：挂起导入 + promising 导出。
// 不依赖 Emscripten，直接验证 V8 的 JSPI 栈上界。
//
// 关键：只有导入返回「未决」Promise 时 V8 才会真正切栈保存调用帧；
// 返回 Promise.resolve() 会走已决议快路径，等于没挂起。stats.pending 用来证伪。
const url = new URL('./jspi-suspend.wasm', import.meta.url);
const modulePromise = WebAssembly.compileStreaming(fetch(url));

export default async function factory() {
  const module = await modulePromise;
  const stats = { calls: 0, pending: 0 };
  const suspend = new WebAssembly.Suspending((mode) => {
    stats.calls += 1;
    if (mode < 0) {
      stats.pending += 1;
      // -2 走宏任务（真正让出事件循环），-1 走微任务（返回时仍是 pending）。
      if (mode === -2) return new Promise((resolve) => setTimeout(resolve, 0));
      return Promise.resolve().then(() => 0);
    }
    return Promise.resolve(0);
  });
  const instance = await WebAssembly.instantiate(module, { env: { suspend } });
  return { _yield_probe: WebAssembly.promising(instance.exports.yield_probe), stats };
}
