// 探针 worker：在 Dedicated Worker 里跑 wasm，与 Lean 在生产里的执行环境一致。
// 每次都新建实例，避免上一次栈溢出污染后续测量。
const noop = () => {};

const CONFIG = {
  baseline: { fn: '_depth_probe', cap: 1 << 20, expected: (n) => n + 1 },
  jspi: { fn: '_depth_probe', cap: 1 << 20, expected: (n) => n + 1 },
  tailcall: { fn: '_tail_probe', cap: 1 << 22, expected: (n) => n + 1 },
  asyncify: { fn: '_yield_probe', cap: 1 << 16, expected: (n) => n, async: true },
  'jspi-yield': { fn: '_yield_probe', cap: 1 << 16, expected: (n) => n },
  'jspi-suspend': { fn: '_yield_probe', cap: 1 << 16, expected: (n) => n },
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
};

const factories = new Map();

const load = async (name) => {
  if (!factories.has(name)) {
    factories.set(
      name,
      import(`/out/${name}.mjs`).then((mod) => mod.default),
    );
  }
  return factories.get(name);
};

const attempt = async (name, n) => {
  const config = CONFIG[name];
  try {
    const factory = await load(name);
    const instance = await factory({ noInitialRun: true, print: noop, printErr: noop });
    const value = config.async
      ? await instance.ccall('yield_probe', 'number', ['number'], [n], { async: true })
      : await instance[config.fn](n, 1);
    return { ok: value === config.expected(n), value };
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
  if (fail === 0) return { name, maxDepth: ok, capped: true, error: null };
  while (fail - ok > 1) {
    const mid = Math.floor((ok + fail) / 2);
    const result = await attempt(name, mid);
    if (result.ok) ok = mid;
    else {
      fail = mid;
      lastError = result.error;
    }
  }
  return { name, maxDepth: ok, firstFail: fail, capped: false, error: lastError };
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
