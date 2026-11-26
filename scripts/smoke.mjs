#!/usr/bin/env node
/**
 * 线上冒烟：验证部署后的站点真的能跑，而不只是 CI 绿灯。
 *
 * 用 curl 而不是 fetch：curl 会自动读 http_proxy / https_proxy，
 * 在需要代理的环境里也能测；-D 只写服务端响应头，不会混入代理的 CONNECT 头。
 *
 * 用法：
 *   node scripts/smoke.mjs
 *   node scripts/smoke.mjs --origin=https://lean-init-ide.pages.dev
 *   LEAN_SITE_ORIGIN=https://example.com node scripts/smoke.mjs
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argOrigin = process.argv.find((arg) => arg.startsWith('--origin='));
const origin =
  (argOrigin ? argOrigin.slice('--origin='.length) : process.env.LEAN_SITE_ORIGIN) ||
  'https://criticalthinking.de5.net';

const manifest = JSON.parse(await readFile(resolve(root, 'config/lean4-runtime.json'), 'utf8'));
const wasm64Manifest = JSON.parse(
  await readFile(resolve(root, 'config/lean4-wasm64-runtime.json'), 'utf8'),
);
const probe = manifest.assets[0];
const tailAsset = manifest.assets.find((asset) => asset.name === 'lean-init-05.pack.gz.bin');
const workerAsset = manifest.assets.find((asset) => asset.name === 'runner-worker.js');
const wasm64Ranged = wasm64Manifest.assets.find((asset) => asset.ranged === true);
const wasm64Index = wasm64Manifest.assets.find((asset) => asset.name === 'lean-init-64.index.json');
const wasm64Packs = wasm64Manifest.assets
  .filter((asset) => /^lean-init-64-\d+\.pack\.zst\.bin$/.test(asset.name))
  .sort((left, right) => left.name.localeCompare(right.name));

const request = async (url, { method = 'GET', headers = {}, body: payload } = {}) => {
  const dir = await mkdtemp(join(tmpdir(), 'lean-smoke-'));
  const headPath = join(dir, 'headers.txt');
  const bodyPath = join(dir, 'body.bin');
  try {
    const args = ['-sS', '--max-time', '25', '-o', bodyPath, '-D', headPath, '-X', method];
    for (const [name, value] of Object.entries(headers)) args.push('-H', `${name}: ${value}`);
    if (payload !== undefined) args.push('--data-raw', payload);
    args.push(url);

    await run('curl', args, { maxBuffer: 4 * 1024 * 1024 });

    const [rawHead, body] = await Promise.all([readFile(headPath, 'utf8'), readFile(bodyPath)]);
    const lines = rawHead.split(/\r?\n/);
    // 走代理时 -D 会先写入代理自己的 "200 Connection Established"，取最后一个真实状态行。
    let statusIndex = -1;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (/^HTTP\/[\d.]+ \d{3}/.test(line) && !line.includes('Connection Established')) {
        statusIndex = index;
      }
    }

    const headersMap = new Map();
    for (let index = statusIndex + 1; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (line === '') break;
      const separator = line.indexOf(':');
      if (separator > 0) {
        headersMap.set(
          line.slice(0, separator).toLowerCase().trim(),
          line.slice(separator + 1).trim(),
        );
      }
    }

    const status = statusIndex === -1 ? 0 : Number(lines[statusIndex]?.split(' ')[1] ?? 0);
    return { status, headers: headersMap, body };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const results = [];
const check = async (name, task) => {
  const started = Date.now();
  try {
    const detail = await task();
    results.push({ name, ok: true, detail, ms: Date.now() - started });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message, ms: Date.now() - started });
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log(`冒烟目标：${origin}\n`);

await check('首页可用', async () => {
  const response = await request(`${origin}/`);
  assert(response.status === 200, `期望 200，实际 ${response.status}`);
  const html = response.body.toString('utf8');
  assert(html.includes('<div id="app">'), '缺少 #app 挂载点');
  assert(/<title>[^<]+<\/title>/.test(html), '缺少页面标题');
  return `${response.status}，${(response.body.length / 1024).toFixed(1)} KiB`;
});

await check('跨源隔离头', async () => {
  const response = await request(`${origin}/`);
  assert(
    response.headers.get('cross-origin-opener-policy') === 'same-origin',
    `COOP=${response.headers.get('cross-origin-opener-policy') ?? '(缺失)'}`,
  );
  assert(
    response.headers.get('cross-origin-embedder-policy') === 'require-corp',
    `COEP=${response.headers.get('cross-origin-embedder-policy') ?? '(缺失)'}`,
  );
  return 'COOP/COEP 正确';
});

await check('安全响应头', async () => {
  const response = await request(`${origin}/`);
  const csp = response.headers.get('content-security-policy') ?? '';
  const cspDirectives = csp
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean);
  const cspTokens = new Set(cspDirectives.flatMap((directive) => directive.split(/\s+/)));
  assert(cspTokens.has("'wasm-unsafe-eval'"), `CSP 缺少 wasm-unsafe-eval：${csp || '(缺失)'}`);
  assert(cspTokens.has('blob:'), 'CSP 缺少 blob:（Worker 动态模块需要）');
  assert(
    cspTokens.has('https://static.cloudflareinsights.com'),
    'CSP 未放行 Cloudflare Web Analytics',
  );
  assert(cspDirectives.includes("frame-ancestors 'none'"), 'CSP 缺少 frame-ancestors');
  assert(
    (response.headers.get('strict-transport-security') ?? '').includes('max-age=31536000'),
    `Strict-Transport-Security=${response.headers.get('strict-transport-security') ?? '(缺失)'}`,
  );
  assert(
    response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin',
    `Referrer-Policy=${response.headers.get('referrer-policy') ?? '(缺失)'}`,
  );
  assert(
    (response.headers.get('permissions-policy') ?? '').includes('camera=()'),
    `Permissions-Policy=${response.headers.get('permissions-policy') ?? '(缺失)'}`,
  );
  return 'HSTS / CSP / Referrer-Policy / Permissions-Policy 就位';
});

await check('Service Worker 可更新', async () => {
  const response = await request(`${origin}/sw.js`);
  assert(response.status === 200, `期望 200，实际 ${response.status}`);
  assert(response.body.length > 1024, `体积只有 ${response.body.length} 字节`);
  const type = response.headers.get('content-type') ?? '';
  assert(type.includes('javascript'), `Content-Type=${type || '(缺失)'}`);
  // Cloudflare Pages 会用自己的边缘 TTL 覆盖静态资源的 Cache-Control，
  // _headers 里的 no-cache 未必生效，这里只做信息输出，不作为失败条件。
  return `200，Cache-Control=${response.headers.get('cache-control') ?? '(缺失)'}`;
});

await check('SEO 文件直出', async () => {
  const sitemap = await request(`${origin}/sitemap.xml`);
  assert(sitemap.status === 200, `sitemap 期望 200，实际 ${sitemap.status}`);
  const sitemapType = sitemap.headers.get('content-type') ?? '';
  assert(sitemapType.includes('xml'), `sitemap Content-Type=${sitemapType || '(缺失)'}`);
  const xml = sitemap.body.toString('utf8');
  assert(xml.includes('<urlset'), 'sitemap 不是 XML，疑似被 SPA 回退改写成 HTML');
  assert(xml.includes('/zh/learn/') && xml.includes('/en/learn/'), 'sitemap 缺少中英文课程 URL');

  const robots = await request(`${origin}/robots.txt`);
  assert(robots.status === 200, `robots 期望 200，实际 ${robots.status}`);
  const robotsType = robots.headers.get('content-type') ?? '';
  assert(robotsType.includes('text/plain'), `robots Content-Type=${robotsType || '(缺失)'}`);
  assert(
    robots.body.toString('utf8').includes('Sitemap: https://criticalthinking.de5.net/sitemap.xml'),
    'robots.txt 未声明 sitemap',
  );

  const llms = await request(`${origin}/llms.txt`);
  assert(llms.status === 200, `llms.txt 期望 200，实际 ${llms.status}`);
  assert(llms.body.toString('utf8').startsWith('# '), 'llms.txt 缺少 H1 标题，疑似被 SPA 回退拦截');

  const catalog = await request(`${origin}/.well-known/ai-catalog.json`);
  assert(catalog.status === 200, `ai-catalog.json 期望 200，实际 ${catalog.status}`);
  const catalogType = catalog.headers.get('content-type') ?? '';
  assert(
    catalogType.includes('application/json'),
    `ai-catalog.json Content-Type=${catalogType || '(缺失)'}`,
  );
  JSON.parse(catalog.body.toString('utf8'));
  return '200，Content-Type 正确，未被 SPA 回退拦截';
});

await check(`/cdn 分片 Range（${probe.key}）`, async () => {
  const response = await request(`${origin}/cdn/${probe.key}`, {
    headers: { Range: 'bytes=0-15' },
  });
  assert(response.status === 206, `期望 206，实际 ${response.status}`);
  const expected = `bytes 0-15/${probe.bytes}`;
  const actual = response.headers.get('content-range');
  assert(actual === expected, `Content-Range=${actual ?? '(缺失)'}，期望 ${expected}`);
  assert(response.body.length === 16, `实际收到 ${response.body.length} 字节`);
  assert(Boolean(response.headers.get('etag')), '缺少 ETag');
  return `206，Content-Range 正确，ETag 存在`;
});

await check('/cdn 拒绝白名单外路径', async () => {
  const response = await request(`${origin}/cdn/__smoke_missing__.bin`);
  assert(response.status === 404, `期望 404，实际 ${response.status}`);
  return '404';
});

await check(`/cdn 尾部分片（${tailAsset.key}）`, async () => {
  const start = tailAsset.bytes - 1024;
  const response = await request(`${origin}/cdn/${tailAsset.key}`, {
    headers: { Range: `bytes=${start}-${tailAsset.bytes - 1}` },
  });
  assert(response.status === 206, `期望 206，实际 ${response.status}`);
  const expected = `bytes ${start}-${tailAsset.bytes - 1}/${tailAsset.bytes}`;
  const actual = response.headers.get('content-range');
  assert(actual === expected, `Content-Range=${actual ?? '(缺失)'}，期望 ${expected}`);
  assert(response.body.length === 1024, `实际收到 ${response.body.length} 字节`);
  return '206，尾部分片正确';
});

if (wasm64Ranged) {
  await check(`/cdn wasm64 Range（${wasm64Ranged.key}）`, async () => {
    const response = await request(
      `${origin}/cdn/${wasm64Ranged.key}?r=${wasm64Manifest.cacheKey}`,
      { headers: { Range: 'bytes=0-15' } },
    );
    assert(response.status === 206, `期望 206，实际 ${response.status}`);
    const expected = `bytes 0-15/${wasm64Ranged.bytes}`;
    const actual = response.headers.get('content-range');
    assert(actual === expected, `Content-Range=${actual ?? '(缺失)'}，期望 ${expected}`);
    assert(response.body.length === 16, `实际收到 ${response.body.length} 字节`);
    return '206，Content-Range 正确';
  });
}

if (wasm64Packs.length > 0) {
  await check('wasm64 pack 分片齐全', async () => {
    for (const pack of wasm64Packs) {
      const start = pack.bytes - 16;
      const response = await request(`${origin}/cdn/${pack.key}?r=${wasm64Manifest.cacheKey}`, {
        headers: { Range: `bytes=${start}-${pack.bytes - 1}` },
      });
      assert(response.status === 206, `${pack.name} 期望 206，实际 ${response.status}`);
      const expected = `bytes ${start}-${pack.bytes - 1}/${pack.bytes}`;
      const actual = response.headers.get('content-range');
      assert(
        actual === expected,
        `${pack.name} Content-Range=${actual ?? '(缺失)'}，期望 ${expected}`,
      );
      assert(response.body.length === 16, `${pack.name} 实际收到 ${response.body.length} 字节`);
    }
    return `${wasm64Packs.length} 个分片可读`;
  });
}

if (wasm64Index) {
  await check('wasm64 索引与清单一致', async () => {
    const response = await request(`${origin}/cdn/${wasm64Index.key}?r=${wasm64Manifest.cacheKey}`);
    assert(response.status === 200, `期望 200，实际 ${response.status}`);
    assert(
      response.body.length === wasm64Index.bytes,
      `字节数 ${response.body.length}，期望 ${wasm64Index.bytes}`,
    );
    const sha256 = createHash('sha256').update(response.body).digest('hex');
    assert(sha256 === wasm64Index.sha256, `sha256=${sha256}，期望 ${wasm64Index.sha256}`);
    return `200，${response.body.length} B，sha256 一致`;
  });
}

await check('worker 资产与清单一致', async () => {
  const response = await request(`${origin}/cdn/${workerAsset.key}?r=${manifest.cacheKey}`);
  assert(response.status === 200, `期望 200，实际 ${response.status}`);
  assert(
    response.body.length === workerAsset.bytes,
    `字节数 ${response.body.length}，期望 ${workerAsset.bytes}`,
  );
  const sha256 = createHash('sha256').update(response.body).digest('hex');
  assert(sha256 === workerAsset.sha256, `sha256=${sha256}，期望 ${workerAsset.sha256}`);
  return `200，${response.body.length} B，sha256 一致`;
});

const checkExtensions = async (archLabel, targetManifest) => {
  for (const ext of targetManifest.extensions ?? []) {
    const idxAsset = ext.assets.find((asset) => asset.name.endsWith('.index.json'));
    const packAsset = ext.assets.find((asset) => /\.pack\.(?:gz|zst)\.bin$/.test(asset.name));
    await check(`${archLabel} 扩展 ${ext.id} 索引与分片`, async () => {
      assert(idxAsset, `${ext.id} 清单缺少 .index.json`);
      const idxResp = await request(`${origin}/cdn/${idxAsset.key}?r=${targetManifest.cacheKey}`);
      assert(idxResp.status === 200, `索引期望 200，实际 ${idxResp.status}`);
      assert(
        idxResp.body.length === idxAsset.bytes,
        `索引字节数 ${idxResp.body.length}，期望 ${idxAsset.bytes}`,
      );
      const idxSha = createHash('sha256').update(idxResp.body).digest('hex');
      assert(idxSha === idxAsset.sha256, `索引 sha256=${idxSha}，期望 ${idxAsset.sha256}`);

      if (packAsset) {
        const packResp = await request(
          `${origin}/cdn/${packAsset.key}?r=${targetManifest.cacheKey}`,
          {
            headers: { Range: 'bytes=0-15' },
          },
        );
        assert(packResp.status === 206, `${packAsset.name} 期望 206，实际 ${packResp.status}`);
        const expectedRange = `bytes 0-15/${packAsset.bytes}`;
        const actualRange = packResp.headers.get('content-range');
        assert(
          actualRange === expectedRange,
          `${packAsset.name} Content-Range=${actualRange ?? '(缺失)'}，期望 ${expectedRange}`,
        );
        assert(
          packResp.body.length === 16,
          `${packAsset.name} 实际收到 ${packResp.body.length} 字节`,
        );
      }
      return `索引 ${idxAsset.bytes} B + 分片 206 一致`;
    });
  }
};

await checkExtensions('wasm32', manifest);
await checkExtensions('wasm64', wasm64Manifest);

await check('/api/telemetry 路由已接管', async () => {
  const getResp = await request(`${origin}/api/telemetry`);
  assert(getResp.status === 405, `GET 期望 405，实际 ${getResp.status}（疑似回落到 SPA）`);
  assert(
    (getResp.headers.get('allow') ?? '').includes('POST'),
    `Allow=${getResp.headers.get('allow') ?? '(缺失)'}`,
  );
  const postResp = await request(`${origin}/api/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert(postResp.status === 400, `空负载 POST 期望 400，实际 ${postResp.status}`);
  return 'GET 405 / 空负载 POST 400（Functions 正常接管）';
});

// 魔搭是第三方镜像，波动不应阻断发布：记录结果但不计入失败。
if (manifest.mirror) {
  const mirrorPrefix = manifest.mirror.prefix ?? manifest.cacheKey;
  const probeMirrorAsset = async (assetName, checkLabel) => {
    const started = Date.now();
    try {
      const response = await request(`${manifest.mirror.baseUrl}${mirrorPrefix}/${assetName}`, {
        headers: { Range: 'bytes=0-15' },
      });
      const ok = response.status === 206 || response.status === 200;
      results.push({
        name: checkLabel,
        ok,
        optional: true,
        detail: ok ? `${response.status}，${response.body.length} 字节` : `HTTP ${response.status}`,
        ms: Date.now() - started,
      });
    } catch (error) {
      results.push({
        name: checkLabel,
        ok: false,
        optional: true,
        detail: error.message,
        ms: Date.now() - started,
      });
    }
  };

  await probeMirrorAsset(probe.name, '魔搭镜像可读（可选）');
  const extProbe = manifest.extensions?.[0]?.assets?.[0];
  if (extProbe) {
    await probeMirrorAsset(extProbe.name, '魔搭扩展镜像可读（可选）');
  }
}

const failed = results.filter((result) => !result.ok && !result.optional);
for (const result of results) {
  const mark = result.ok ? 'PASS' : result.optional ? 'WARN' : 'FAIL';
  console.log(`  [${mark}] ${result.name} — ${result.detail} (${result.ms}ms)`);
}

if (failed.length > 0) {
  console.error(`\n冒烟失败：${failed.length}/${results.length} 项未通过`);
  process.exit(1);
}

const optional = results.filter((result) => result.optional).length;
console.log(
  `\n冒烟通过：${results.length - optional}/${results.length - optional} 项` +
    (optional > 0 ? `（另有 ${optional} 项可选检查）` : ''),
);
