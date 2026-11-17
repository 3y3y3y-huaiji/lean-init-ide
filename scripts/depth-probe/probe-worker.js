// 探针 worker：在 Dedicated Worker 里跑 wasm，与 Lean 在生产里的执行环境一致。
// 每次都新建实例，避免上一次栈溢出污染后续测量。
const noop = () => {};

const CONFIG = {
  baseline: { fn: '_depth_probe', cap: 1 << 20, expected: (n) => n + 1 },
  jspi: { fn: '_depth_probe', cap: 1 << 20, expected: (n) => n + 1 },
  tailcall: { fn: '_tail_probe', cap: 1 << 22, expected: (n) => n + 1 },
  asyncify: { fn: '_yield_probe', cap: 1 << 18, expected: (n) => n, async: true },
  // 同一段代码不挂起：用来判断 asyncify 的上界是不是本来就有这么多。
  'yield-noasync': { fn: '_yield_probe', cap: 1 << 18, expected: (n) => n },
  // 1 MB 缓冲区但降低挂起频率：验证「低频 yield 分段接力」能否突破缓冲区上界。
  'asyncify-1m-4096': { fn: '_yield_probe', cap: 1 << 18, expected: (n) => n, async: true },
  // 缓冲区放大，看深度是否随 ASYNCIFY_STACK_SIZE 线性放大。
  'asyncify-8m': { fn: '_yield_probe', cap: 1 << 19, expected: (n) => n, async: true },
  'asyncify-32m': { fn: '_yield_probe', cap: 1 << 19, expected: (n) => n, async: true },
  'jspi-yield': { fn: '_yield_probe', cap: 1 << 20, expected: (n) => n },
  'jspi-yield-1m': { fn: '_yield_probe', cap: 1 << 20, expected: (n) => n },
  // 浏览器级 JSPI 两两对照：resolved 走 V8 已决议快路径，pending 才是真挂起。
  'jspi-resolved': {
    module: 'jspi-suspend',
    fn: '_yield_probe',
    cap: 1 << 20,
    args: (n) => [n, 64, 0],
    expected: (n) => n,
  },
  'jspi-pending': {
    module: 'jspi-suspend',
    fn: '_yield_probe',
    cap: 1 << 20,
    args: (n) => [n, 64, 1],
    expected: (n) => n,
  },
  // 每层都挂起：若上界随挂起密度放大，说明切栈确实回收了调用帧。
  'jspi-pending-1': {
    module: 'jspi-suspend',
    fn: '_yield_probe',
    cap: 1 << 16,
    args: (n) => [n, 1, 1],
    expected: (n) => n,
  },
  'jspi-pending-1024': {
    module: 'jspi-suspend',
    fn: '_yield_probe',
    cap: 1 << 20,
    args: (n) => [n, 1024, 1],
    expected: (n) => n,
  },
  // 宏任务挂起：真正让出事件循环，排除「同批微任务里偷偷续跑」的解释。
  'jspi-macrotask': {
    module: 'jspi-suspend',
    fn: '_yield_probe',
    // 每次挂起都要过宏任务，缩小 cap 以控制耗时；关键是与 17k 这个量级比较。
    cap: 1 << 15,
    args: (n) => [n, 64, 2],
    expected: (n) => n,
  },
  heapstack: { fn: '_heap_probe', cap: 1 << 20, expected: (n) => n },
  // pthread 变体每个实例会拉起线程池，只取几个固定深度，不做二分。
  'pthread-baseline': {
    fn: '_depth_probe',
    cap: 4096,
    samples: [512, 1200, 2000, 3000],
    expected: (n) => n + 1,
  },
  'pthread-jspi': {
    fn: '_depth_probe',
    cap: 4096,
    samples: [512, 1200, 2000, 3000],
    expected: (n) => n + 1,
  },
  // 线程栈大小对照：递归跑在线程池线程上，只改 DEFAULT_PTHREAD_STACK_SIZE。
  // 栈溢出会 abort 整个 worker，所以用固定样本、逐个变体单独跑。
  'pthread-stack-64k': {
    fn: '_pthread_probe',
    samples: [256, 512, 1024, 2048, 4096],
    args: (n) => [n, 0],
    expected: (n) => n + 1,
  },
  'pthread-stack-8m': {
    fn: '_pthread_probe',
    samples: [256, 512, 1024, 2048, 4096],
    args: (n) => [n, 0],
    expected: (n) => n + 1,
  },
  'pthread-stack-32m': {
    fn: '_pthread_probe',
    samples: [256, 512, 1024, 2048, 4096],
    args: (n) => [n, 0],
    expected: (n) => n + 1,
  },
};

const factories = new Map();

const load = async (name) => {
  if (!factories.has(name)) {
    const moduleName = CONFIG[name]?.module ?? name;
    factories.set(
      name,
      import(`/out/${moduleName}.mjs`).then((mod) => mod.default),
    );
  }
  return factories.get(name);
};

const attempt = async (name, n) => {
  const config = CONFIG[name];
  try {
    const factory = await load(name);
    const instance = await factory({ noInitialRun: true, print: noop, printErr: noop });
    const args = config.args ? config.args(n) : [n, 1];
    const value = config.async
      ? await instance.ccall('yield_probe', 'number', ['number'], [n], { async: true })
      : await instance[config.fn](...args);
    // stats 只用于证明挂起真的发生了（JSPI 已决议 Promise 会走不切栈的快路径）。
    const stats = instance.stats ? { ...instance.stats } : null;
    return { ok: value === config.expected(n), value, stats };
  } catch (error) {
    return { ok: false, error: String(error?.stack ?? error).slice(0, 500) };
  }
};

const binarySearch = async (name) => {
  const { cap } = CONFIG[name];
  let ok = 0;
  let fail = 0;
  let lastError = null;
  for (let n = 64; n <= cap; n *= 2) {
    const result = await attempt(name, n);
    if (result.ok) {
      ok = n;
    } else {
      fail = n;
      lastError = result.error;
      break;
    }
  }
  if (fail === 0) {
    const final = ok > 0 ? await attempt(name, ok) : null;
    return {
      name,
      maxDepth: ok,
      capped: true,
      error: null,
      stats: final?.stats ?? null,
    };
  }
  while (fail - ok > 1) {
    const mid = Math.floor((ok + fail) / 2);
    const result = await attempt(name, mid);
    if (result.ok) ok = mid;
    else {
      fail = mid;
      lastError = result.error;
    }
  }
  // 终值再跑一次，让 stats 与 maxDepth 对得上。
  const final = ok > 0 ? await attempt(name, ok) : null;
  return {
    name,
    maxDepth: ok,
    firstFail: fail,
    capped: false,
    error: lastError,
    stats: final?.stats ?? null,
  };
};

const fixedSamples = async (name) => {
  const results = [];
  for (const n of CONFIG[name].samples) {
    const result = await attempt(name, n);
    results.push({ n, ok: result.ok, error: result.error ?? null });
  }
  return { name, samples: results };
};

const features = () => ({
  userAgent: navigator.userAgent,
  jspi: {
    suspending: typeof WebAssembly.Suspending === 'function',
    promising: typeof WebAssembly.promising === 'function',
  },
  memory64: (() => {
    // 最小的 memory64 模块：只有一个 64 位 memory 段。
    const bytes = Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 4, 0]);
    return WebAssembly.validate(bytes);
  })(),
});

self.onmessage = async (event) => {
  const variants = event.data?.variants ?? [];
  const results = [];
  for (const name of variants) {
    if (!CONFIG[name]) {
      results.push({ name, status: 'unknown-variant' });
      continue;
    }
    self.postMessage({ type: 'progress', name });
    try {
      const result = CONFIG[name].samples ? await fixedSamples(name) : await binarySearch(name);
      results.push({ name, status: 'ok', ...result });
    } catch (error) {
      results.push({ name, status: 'failed', error: String(error?.stack ?? error).slice(0, 500) });
    }
  }
  self.postMessage({ done: true, features: features(), results });
};
