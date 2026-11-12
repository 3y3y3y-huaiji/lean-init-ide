#!/usr/bin/env node
/**
 * 校验 dist/ 的构建产物是否具备上线条件。
 *
 * 这些约束一旦破了，表现形式都是「线上打不开」或者「wasm 加载链路断掉」，
 * 而在本地 dev 里完全看不出来，所以必须在构建后立刻检查。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

/** @type {string[]} */
const errors = [];
const fail = (message) => errors.push(message);

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      const info = await stat(full);
      files.push({ path: full, size: info.size });
    }
  }
  return files;
};

if (!(await exists(dist))) {
  console.error('dist/ 不存在，请先运行 npm run build:web');
  process.exit(1);
}

// 1. 应用入口
const indexPath = resolve(dist, 'index.html');
if (!(await exists(indexPath))) {
  fail('缺少 dist/index.html');
} else {
  const html = await readFile(indexPath, 'utf8');
  if (!html.includes('<div id="app">')) fail('index.html 缺少 #app 挂载点');
  if (!/<script[^>]+src="\/assets\//.test(html)) fail('index.html 没有引用打包后的入口脚本');
}

// 2. Service Worker
const swPath = resolve(dist, 'sw.js');
if (!(await exists(swPath))) {
  fail('缺少 dist/sw.js');
} else {
  const sw = await readFile(swPath, 'utf8');
  const size = (await stat(swPath)).size;
  if (size < 1024) fail(`sw.js 只有 ${size} 字节，疑似构建失败`);
  if (!sw.includes('addEventListener')) fail('sw.js 里没有事件监听，疑似被清空');
}

// 3. Functions 路由范围：只允许精确路径，静态资源不能进 Functions
const routesPath = resolve(dist, '_routes.json');
if (!(await exists(routesPath))) {
  fail('缺少 dist/_routes.json，Pages Functions 会被全站拦截');
} else {
  const routes = JSON.parse(await readFile(routesPath, 'utf8'));
  const include = JSON.stringify(routes.include ?? []);
  // /api/telemetry 是运行指标接收端；扩成通配符会让静态资源也进 Functions，首屏变慢。
  const expected = JSON.stringify(['/cdn/*', '/api/telemetry']);
  if (include !== expected) {
    fail(`_routes.json 的 include 必须恰好是 ${expected}，实际为 ${include}`);
  }
  if ((routes.exclude ?? []).length > 0) {
    fail('_routes.json 的 exclude 应为空，避免与 include 语义冲突');
  }
}

// 4. 跨源隔离头：wasm 线程模型依赖这两个头
const headersPath = resolve(dist, '_headers');
if (!(await exists(headersPath))) {
  fail('缺少 dist/_headers，COOP/COEP 不会生效');
} else {
  const headers = await readFile(headersPath, 'utf8');
  for (const requirement of [
    'Cross-Origin-Opener-Policy: same-origin',
    'Cross-Origin-Embedder-Policy: require-corp',
    "connect-src 'self' data:",
  ]) {
    if (!headers.includes(requirement)) fail(`_headers 缺少 "${requirement}"`);
  }
}

// 4b. zstd 解码器：资产是 zstd，worker 启动时必须能加载同源解码器
const zstdPath = resolve(dist, 'vendor/zstddec.mjs');
if (!(await exists(zstdPath))) {
  fail('缺少 dist/vendor/zstddec.mjs，zstd 资产无法解码');
} else if (!(await readFile(zstdPath, 'utf8')).includes('ZSTDDecoder')) {
  fail('dist/vendor/zstddec.mjs 不是有效的 zstd 解码器');
}

// 5. 静态资源与体积预算
const assetsDir = resolve(dist, 'assets');
if (!(await exists(assetsDir))) {
  fail('缺少 dist/assets/');
} else {
  const files = await walk(assetsDir);
  const jsFiles = files.filter((file) => extname(file.path) === '.js');
  const cssFiles = files.filter((file) => extname(file.path) === '.css');

  if (jsFiles.length === 0) fail('dist/assets 里没有 JS 产物');
  if (cssFiles.length === 0) fail('dist/assets 里没有 CSS 产物');

  const jsBytes = jsFiles.reduce((sum, file) => sum + file.size, 0);
  const budget = 6 * 1024 * 1024;
  if (jsBytes > budget) {
    fail(`JS 产物 ${(jsBytes / 1024 / 1024).toFixed(2)} MiB 超过预算 ${budget / 1024 / 1024} MiB`);
  }

  const maps = files.filter((file) => file.path.endsWith('.map'));
  if (maps.length > 0) fail(`dist/assets 里混入了 ${maps.length} 个 sourcemap`);

  const jsTexts = await Promise.all(jsFiles.map((file) => readFile(file.path, 'utf8')));
  if (!jsTexts.some((text) => text.includes('zstddec.mjs'))) {
    fail('worker 产物没有引用 zstddec.mjs，zstd 资产会在启动时失败');
  }

  console.log(
    `静态资源：${jsFiles.length} 个 JS / ${(jsBytes / 1024 / 1024).toFixed(2)} MiB，${cssFiles.length} 个 CSS`,
  );
}

// 6. 同源兜底副本：存在时必须与 zstd 清单的字节数一致（防止旧 gzip 资产混入）
const wasmDir = resolve(dist, 'wasm-lean4');
if (!(await exists(wasmDir))) {
  console.log('提示：dist/wasm-lean4 不存在（CI 构建跳过资产下载，属预期）');
} else {
  const manifest = JSON.parse(await readFile(resolve(root, 'config/lean4-runtime.json'), 'utf8'));
  for (const asset of manifest.assets) {
    const file = resolve(wasmDir, asset.name);
    if (!(await exists(file))) {
      fail(`dist/wasm-lean4 缺少 ${asset.name}`);
      continue;
    }
    const size = (await stat(file)).size;
    if (size !== asset.bytes) {
      fail(`dist/wasm-lean4/${asset.name} 为 ${size} 字节，清单要求 ${asset.bytes}`);
    }
  }
}

if (errors.length > 0) {
  console.error(`构建产物校验失败（${errors.length} 项）：`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('构建产物校验通过');
