// 浏览器级 JSPI：挂起导入 + promising 导出。
// 不依赖 Emscripten，直接验证 V8 的 JSPI 栈上界。
const url = new URL('./jspi-suspend.wasm', import.meta.url);
const modulePromise = WebAssembly.compileStreaming(fetch(url));

export default async function factory() {
  const module = await modulePromise;
  const suspend = new WebAssembly.Suspending(() => Promise.resolve());
  const instance = await WebAssembly.instantiate(module, { env: { suspend } });
  return { _yield_probe: WebAssembly.promising(instance.exports.yield_probe) };
}
