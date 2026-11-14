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
const probe = manifest.assets[0];
const tailAsset = manifest.assets.find((asset) => asset.name === 'lean-init-05.pack.gz.bin');
const workerAsset = manifest.assets.find((asset) => asset.name === 'runner-worker.js');

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
  assert(csp.includes("'wasm-unsafe-eval'"), `CSP 缺少 wasm-unsafe-eval：${csp || '(缺失)'}`);
  assert(csp.includes('blob:'), 'CSP 缺少 blob:（Worker 动态模块需要）');
  assert(
    csp.includes('https://static.cloudflareinsights.com'),
    'CSP 未放行 Cloudflare Web Analytics',
  );
  assert(csp.includes("frame-ancestors 'none'"), 'CSP 缺少 frame-ancestors');
  assert(
    response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin',
    `Referrer-Policy=${response.headers.get('referrer-policy') ?? '(缺失)'}`,
  );
  assert(
    (response.headers.get('permissions-policy') ?? '').includes('camera=()'),
    `Permissions-Policy=${response.headers.get('permissions-policy') ?? '(缺失)'}`,
  );
  return 'CSP / Referrer-Policy / Permissions-Policy 就位';
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
  const started = Date.now();
  try {
    const response = await request(`${manifest.mirror.baseUrl}${manifest.cacheKey}/${probe.name}`, {
      headers: { Range: 'bytes=0-15' },
    });
    const ok = response.status === 206 || response.status === 200;
    results.push({
      name: '魔搭镜像可读（可选）',
      ok,
      optional: true,
      detail: ok ? `${response.status}，${response.body.length} 字节` : `HTTP ${response.status}`,
      ms: Date.now() - started,
    });
  } catch (error) {
    results.push({
      name: '魔搭镜像可读（可选）',
      ok: false,
      optional: true,
      detail: error.message,
      ms: Date.now() - started,
    });
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
