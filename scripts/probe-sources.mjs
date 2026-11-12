#!/usr/bin/env node
/**
 * 资产源探活：对魔搭镜像 / 同源 /cdn 网关 / GitHub raw 各取 64KiB，
 * 报告状态码、首字节时间与估算速率。
 *
 * 国内访问问题的根因是部分 Anycast IPv4 被 TLS reset（不是 DNS 解析错误），
 * 所以在「打不开」的那条线路上跑这个脚本，就能区分是某个源不可达还是整站都不通。
 *
 * 用法：
 *   pnpm run probe:sources
 *   LEAN_ASSET_ORIGIN=https://lean-init-ide.pages.dev pnpm run probe:sources
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetSources, rangedAssets } from '../src/asset-sources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'config/lean4-runtime.json'), 'utf8'));

const origin = process.env.LEAN_ASSET_ORIGIN?.trim() || 'https://criticalthinking.de5.net';
const primaryBaseUrl =
  process.env.LEAN_ASSET_BASE_URL?.trim() || new URL(manifest.primary.baseUrl, origin).href;

const asset = rangedAssets(manifest)[0];
if (!asset) {
  console.error('清单里没有 ranged 资产，无法探活');
  process.exit(1);
}

const SAMPLE_BYTES = 64 * 1024;
const TIMEOUT_MS = 20_000;

const probe = async (source) => {
  const started = Date.now();
  try {
    const response = await fetch(source.url, {
      // Range 同时验证三件事：网关支持分片、镜像按块缓存、GitHub raw 不会返回整份。
      headers: { Range: `bytes=0-${SAMPLE_BYTES - 1}`, 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ttfb = Date.now() - started;
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.arrayBuffer();
    const elapsed = Math.max(1, Date.now() - started);
    const mib = data.byteLength / 1024 / 1024;
    const rate = (mib / (elapsed / 1000)).toFixed(2);
    return {
      ok: true,
      detail: `${response.status} · ${(data.byteLength / 1024).toFixed(0)} KiB · TTFB ${ttfb}ms · ≈${rate} MiB/s`,
    };
  } catch (error) {
    const name = error?.name ?? '';
    const reason =
      name === 'TimeoutError' ? `超时（${TIMEOUT_MS / 1000}s）` : (error?.message ?? error);
    return { ok: false, detail: String(reason) };
  }
};

const sources = assetSources(manifest, asset, primaryBaseUrl, { mirrorFirst: true });
console.log(`探活资产：${asset.name}（${(asset.bytes / 1024 / 1024).toFixed(1)} MiB）`);
console.log(`主源域名：${origin}`);
console.log(`样本大小：${SAMPLE_BYTES / 1024} KiB\n`);

const results = [];
for (const source of sources) {
  const result = await probe(source);
  results.push({ label: source.label, ...result });
  console.log(`  [${result.ok ? 'PASS' : 'FAIL'}] ${source.label} — ${result.detail}`);
}

if (results.every((result) => !result.ok)) {
  console.error('\n所有资产源都不可达：先确认本机网络，再检查站点是否在线');
  process.exit(1);
}

console.log(`\n可用源：${results.filter((result) => result.ok).length}/${results.length}`);
