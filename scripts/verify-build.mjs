#!/usr/bin/env node
/**
 * 校验 dist/ 的构建产物是否具备上线条件。
 *
 * 这些约束一旦破了，表现形式都是「线上打不开」或者「wasm 加载链路断掉」，
 * 而在本地 dev 里完全看不出来，所以必须在构建后立刻检查。
 */
import { createHash } from 'node:crypto';
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

// 1. 应用入口与预渲染静态页
const HAN = /\p{Script=Han}/u;
const hanCount = (value) => Array.from(value).filter((char) => HAN.test(char)).length;
const checkSeoLengths = (rel, html) => {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
  const description = /<meta\s+name="description"\s+content="([^"]*)"\s*\/>/.exec(html)?.[1] ?? '';
  const zhPage = rel.startsWith('zh/');
  if (!/<link rel="canonical" href="https:\/\/criticalthinking\.de5\.net\//.test(html)) {
    fail(`dist/${rel} 缺少 canonical`);
  }
  if (!html.includes('hreflang="x-default"')) fail(`dist/${rel} 缺少 x-default hreflang`);
  if ((html.match(/<h1\b/g) ?? []).length !== 1) {
    fail(`dist/${rel} 的 <h1> 数量不是恰好 1 个`);
  }
  if (zhPage) {
    if (hanCount(title) < 15 || hanCount(title) > 30) {
      fail(`dist/${rel} 的中文标题汉字数 ${hanCount(title)} 不在 15–30`);
    }
    if (hanCount(description) < 55 || hanCount(description) > 85) {
      fail(`dist/${rel} 的中文描述汉字数 ${hanCount(description)} 不在 55–85`);
    }
  } else {
    if (title.length < 30 || title.length > 60) {
      fail(`dist/${rel} 的英文标题长度 ${title.length} 不在 30–60`);
    }
    if (description.length < 110 || description.length > 155) {
      fail(`dist/${rel} 的英文描述长度 ${description.length} 不在 110–155`);
    }
  }
};

const indexPath = resolve(dist, 'index.html');
let indexHtml = '';
if (!(await exists(indexPath))) {
  fail('缺少 dist/index.html');
} else {
  indexHtml = await readFile(indexPath, 'utf8');
  if (!indexHtml.includes('<div id="app">')) fail('index.html 缺少 #app 挂载点');
  if (!/<script[^>]+src="\/assets\//.test(indexHtml)) fail('index.html 没有引用打包后的入口脚本');
  if (/<link\b[^>]*rel=["']stylesheet["']/i.test(indexHtml)) {
    fail('index.html 仍存在阻塞首屏的外部 stylesheet 链接，未内联 CSS');
  }
  if (!/<style>[\s\S]+<\/style>/.test(indexHtml)) {
    fail('index.html 缺少内联 <style> 样式');
  }
  // 根路径由 `_redirects` 回落到 index.html，必须和预渲染页一样带有可抓取的标题。
  if (!indexHtml.includes('<meta name="lean-ssg"')) fail('index.html 缺少 lean-ssg 标记');
  if (!/<h1[^>]*>[^<]+<\/h1>/.test(indexHtml)) fail('index.html 没有预渲染主标题 <h1>');
  // 英文首页是唯一主入口：canonical 与 x-default 都指向 `/`。
  if (!indexHtml.includes('<link rel="canonical" href="https://criticalthinking.de5.net/" />')) {
    fail('dist/index.html 的 canonical 不是 https://criticalthinking.de5.net/');
  }
  if (
    !indexHtml.includes(
      '<link rel="alternate" hreflang="x-default" href="https://criticalthinking.de5.net/" />',
    )
  ) {
    fail('dist/index.html 的 x-default 不是 https://criticalthinking.de5.net/');
  }
  checkSeoLengths('index.html', indexHtml);
}
if (await exists(resolve(dist, 'en/index.html'))) {
  fail('dist/en/index.html 不应存在：英文首页规范入口是根路径 /');
}
for (const rel of [
  'zh/index.html',
  'zh/playground.html',
  'en/playground.html',
  'zh/learn/what-is-lean.html',
  'en/learn/what-is-lean.html',
]) {
  const file = resolve(dist, rel);
  if (!(await exists(file))) {
    fail(`缺少预渲染页面 dist/${rel}`);
    continue;
  }
  const html = await readFile(file, 'utf8');
  if (!html.includes('<div id="app">')) fail(`dist/${rel} 缺少 #app 挂载点`);
  if (!html.includes('<meta name="lean-ssg"')) fail(`dist/${rel} 缺少 lean-ssg 标记`);
  if (!/<h1[^>]*>[^<]+<\/h1>/.test(html)) fail(`dist/${rel} 没有预渲染主标题 <h1>`);
  checkSeoLengths(rel, html);
}
if (await exists(resolve(dist, '.vite'))) {
  fail('dist/.vite 清单目录未在构建后清理');
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
    // 镜像回退在页面 / Service Worker 里跨源 fetch；漏放行会静默退回慢源。
    'https://*.modelscope.cn',
    // SEO 与智能体文件类型必须显式声明，避免边缘按默认类型返回。
    'Content-Type: application/xml; charset=utf-8',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Type: application/json; charset=utf-8',
    'Strict-Transport-Security: max-age=31536000; includeSubDomains',
  ]) {
    if (!headers.includes(requirement)) fail(`_headers 缺少 "${requirement}"`);
  }

  const scriptSrcMatch = /script-src\s+([^;\r\n]+)/.exec(headers);
  const scriptSrc = scriptSrcMatch?.[1] ?? '';
  if (scriptSrc.includes("'unsafe-inline'")) {
    fail("_headers 的 script-src 不应保留 'unsafe-inline'");
  }
  for (const match of indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const hash = `'sha256-${createHash('sha256').update(match[1], 'utf8').digest('base64')}'`;
    if (!scriptSrc.includes(hash)) {
      fail(`_headers 的 script-src 缺少内联脚本哈希 ${hash}`);
    }
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

// 7. SEO 产物：必须真实存在，课程 URL 数量与构建出的课程页一一对应
const sitemapPath = resolve(dist, 'sitemap.xml');
const robotsPath = resolve(dist, 'robots.txt');

if (!(await exists(sitemapPath))) {
  fail('缺少 dist/sitemap.xml，构建时 generate-seo.mjs 未执行');
}
if (!(await exists(robotsPath))) {
  fail('缺少 dist/robots.txt，构建时 generate-seo.mjs 未执行');
}

if (await exists(sitemapPath)) {
  const xml = await readFile(sitemapPath, 'utf8');
  if (!xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')) {
    fail('sitemap.xml 缺少合法的 urlset 声明');
  }

  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
  if (locs.length === 0) fail('sitemap.xml 没有任何 <loc>');
  if (new Set(locs).size !== locs.length) fail('sitemap.xml 存在重复 URL');
  for (const loc of locs) {
    if (!loc.startsWith('https://criticalthinking.de5.net/')) {
      fail(`sitemap.xml 含非本站 URL：${loc}`);
    }
  }
  if (!locs.includes('https://criticalthinking.de5.net/')) {
    fail('sitemap.xml 缺少英文首页规范 URL https://criticalthinking.de5.net/');
  }
  if (locs.includes('https://criticalthinking.de5.net/en/')) {
    fail('sitemap.xml 不应包含重复的英文首页 https://criticalthinking.de5.net/en/');
  }
  for (const match of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(match[1])) fail(`sitemap.xml 的 lastmod 非法：${match[1]}`);
  }

  for (const locale of ['zh', 'en']) {
    const learnDir = resolve(dist, locale, 'learn');
    if (!(await exists(learnDir))) {
      fail(`缺少 dist/${locale}/learn/，无法核对 sitemap 课程数量`);
      continue;
    }
    const pages = (await readdir(learnDir)).filter((name) => name.endsWith('.html'));
    const lessonLocs = locs.filter((loc) => loc.includes(`/${locale}/learn/`));
    if (lessonLocs.length !== pages.length) {
      fail(
        `sitemap.xml 的 ${locale} 课程 URL 有 ${lessonLocs.length} 条，` +
          `构建出的课程页有 ${pages.length} 个，两者不一致`,
      );
    }
    for (const page of pages) {
      const slug = page.slice(0, -'.html'.length);
      if (!locs.includes(`https://criticalthinking.de5.net/${locale}/learn/${slug}`)) {
        fail(`sitemap.xml 缺少课程 URL /${locale}/learn/${slug}`);
      }
    }
  }
}

if (await exists(robotsPath)) {
  const robots = await readFile(robotsPath, 'utf8');
  if (!robots.includes('User-agent: *')) fail('robots.txt 缺少 User-agent');
  if (!robots.includes('Sitemap: https://criticalthinking.de5.net/sitemap.xml')) {
    fail('robots.txt 未声明 sitemap 地址');
  }
}

// 7b. 智能体发现文件：llms.txt 与 /.well-known/ai-catalog.json
const llmsPath = resolve(dist, 'llms.txt');
if (!(await exists(llmsPath))) {
  fail('缺少 dist/llms.txt，构建时 generate-seo.mjs 未执行');
} else {
  const llms = await readFile(llmsPath, 'utf8');
  if (!llms.startsWith('# ')) fail('llms.txt 缺少必需的 H1 标题');
  if (!/\[[^\]]+\]\(https:\/\/criticalthinking\.de5\.net\/[^)]+\)/.test(llms)) {
    fail('llms.txt 缺少站内 Markdown 链接');
  }
}

const aiCatalogPath = resolve(dist, '.well-known', 'ai-catalog.json');
if (!(await exists(aiCatalogPath))) {
  fail('缺少 dist/.well-known/ai-catalog.json，构建时 generate-seo.mjs 未执行');
} else {
  try {
    const catalog = JSON.parse(await readFile(aiCatalogPath, 'utf8'));
    if (typeof catalog.specVersion !== 'string' || !Array.isArray(catalog.entries)) {
      fail('ai-catalog.json 缺少 specVersion 或 entries 数组');
    }
  } catch (error) {
    fail(`ai-catalog.json 不是合法 JSON：${error.message}`);
  }
}

// 8. Pages 的 _redirects 先于静态资源匹配：必须把 SEO 与智能体文件放在 SPA 兜底之前
const redirectsPath = resolve(dist, '_redirects');
if (!(await exists(redirectsPath))) {
  fail('缺少 dist/_redirects');
} else {
  const redirects = await readFile(redirectsPath, 'utf8');
  const fallbackIndex = redirects.search(/^\/\*\s+\/index\.html\s+200$/m);
  if (fallbackIndex === -1) {
    fail('_redirects 缺少 /* /index.html 200 回退规则');
  }
  for (const [from, to] of [
    ['/sitemap.xml', '/sitemap.xml'],
    ['/robots.txt', '/robots.txt'],
    ['/llms.txt', '/llms.txt'],
    ['/.well-known/ai-catalog.json', '/.well-known/ai-catalog.json'],
    ['/ai-catalog.json', '/.well-known/ai-catalog.json'],
    ['/.well-known/ard.json', '/.well-known/ai-catalog.json'],
  ]) {
    const rule = new RegExp(
      `^${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+200$`,
      'm',
    );
    const match = rule.exec(redirects);
    if (!match) {
      fail(`_redirects 缺少 ${from} -> ${to} 的 200 直出规则，会被 /* SPA 回退吞掉`);
    } else if (fallbackIndex !== -1 && match.index > fallbackIndex) {
      fail(`_redirects 中 ${from} 位于 /* 回退之后，无法生效`);
    }
  }

  // 旧英文首页必须永久重定向到根路径，且规则要排在 /* 回退之前。
  for (const from of ['/en', '/en/']) {
    const rule = new RegExp(`^${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+/\\s+301$`, 'm');
    const match = rule.exec(redirects);
    if (!match) {
      fail(`_redirects 缺少 ${from} -> / 的 301 重定向`);
    } else if (fallbackIndex !== -1 && match.index > fallbackIndex) {
      fail(`_redirects 中 ${from} 的 301 规则位于 /* 回退之后，无法生效`);
    }
  }
}

if (errors.length > 0) {
  console.error(`构建产物校验失败（${errors.length} 项）：`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('构建产物校验通过');
