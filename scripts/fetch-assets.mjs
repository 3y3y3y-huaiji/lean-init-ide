import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, zstdCompressSync, constants as zlibConstants } from 'node:zlib';
import { assetSources } from '../src/asset-sources.mjs';

/**
 * Downloads the pinned Lean 4.35.0 Init runtime used by @wasm-idle/lsp.
 *
 * The manifest in config/lean4-runtime.json is shared with the Service Worker and
 * Pages Functions: the primary source is the same-origin /cdn/ gateway; the
 * fallback baseUrl points at the GitHub Release and is used here (Node) for
 * upstream artifacts. Upstream artifacts use `.gz` names while the runtime expects
 * `.gz.bin`. Every file is verified against its pinned byte count and SHA-256.
 *
 * Node cannot fetch a relative /cdn/ URL without an origin. Set LEAN_ASSET_ORIGIN
 * (e.g. https://criticalthinking.de5.net) to use the deployed gateway during builds;
 * otherwise the build goes straight to the GitHub Release assets.
 * LEAN_ASSET_BASE_URL overrides the primary source entirely.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'wasm-lean4');
const manifest = JSON.parse(readFileSync(path.join(root, 'config', 'lean4-runtime.json'), 'utf8'));
const assetOrigin = process.env.LEAN_ASSET_ORIGIN?.trim();
const primaryOverride =
  process.env.LEAN_ASSET_BASE_URL?.trim() ||
  (assetOrigin && manifest.primary.baseUrl.startsWith('/')
    ? new URL(manifest.primary.baseUrl, assetOrigin).href
    : undefined);

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GitHub Release / 镜像在大规模并发下偶发连接重置或 5xx；
 * 单个源内重试，避免一次抖动就让整个构建失败。
 */
const fetchWithRetry = async (url, init, attempts = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(
          `warn   ${url} 第 ${attempt}/${attempts} 次请求失败：${error.message ?? error}，重试`,
        );
        await sleep(attempt * 1000);
      }
    }
  }
  throw lastError;
};

const isValid = (file, asset) => {
  if (!existsSync(file)) return false;
  if (statSync(file).size !== asset.bytes) return false;
  return sha256(readFileSync(file)) === asset.sha256;
};

const verify = (asset, data) => {
  const actualSha = sha256(data);
  if (data.length !== asset.bytes || actualSha !== asset.sha256) {
    throw new Error(
      `${asset.name} verification failed: ${data.length} bytes / ${actualSha}; ` +
        `expected ${asset.bytes} / ${asset.sha256}`,
    );
  }
};

/**
 * zstd 资产的原始字节仍在上游 GitHub Release（gzip）。下载后按清单校验上游 gzip，
 * 再解压、以 level 19 重新压缩，最后用交付哈希复核。这样 CI 不需要预上传 R2。
 */
const fetchUpstream = async (asset) => {
  if (!asset.upstream || !asset.upstreamBytes || !asset.upstreamSha256) {
    throw new Error(`${asset.name} 缺少 upstream 字段，无法生成 zstd 资产`);
  }
  const url = new URL(asset.upstream, manifest.fallback.baseUrl).href;
  const response = await fetchWithRetry(url, {
    headers: { 'Accept-Encoding': 'identity' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`upstream HTTP ${response.status}: ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length !== asset.upstreamBytes || sha256(data) !== asset.upstreamSha256) {
    throw new Error(`${asset.name} 上游 gzip 校验失败`);
  }
  return data;
};

const toZstd = (asset, upstream) => {
  const raw = gunzipSync(upstream);
  const data = zstdCompressSync(raw, {
    params: { [zlibConstants.ZSTD_c_compressionLevel]: 19 },
  });
  if (raw.length !== asset.uncompressedBytes || sha256(raw) !== asset.uncompressedSha256) {
    throw new Error(`${asset.name} 解压后的字节数或 SHA-256 与清单不一致`);
  }
  verify(asset, data);
  return data;
};

const fetchFromSources = async (asset) => {
  let lastError;
  // 构建期把魔搭镜像也纳入回退：GitHub Release 偶发抖动时仍能完成下载。
  const candidates = assetSources(manifest, asset, primaryOverride, {
    includeMirror: true,
  }).filter((source) => /^https?:\/\//i.test(source.url));
  if (candidates.length === 0) {
    throw new Error(`no fetchable absolute source for ${asset.name}; set LEAN_ASSET_ORIGIN`);
  }
  for (const source of candidates) {
    try {
      const response = await fetchWithRetry(source.url, {
        headers: { 'Accept-Encoding': 'identity' },
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      verify(asset, data);
      return { data, label: source.label };
    } catch (error) {
      lastError = error;
      console.warn(`warn   ${asset.name} <- ${source.label}: ${error.message ?? error}`);
    }
  }
  throw new Error(`all sources failed for ${asset.name}: ${lastError?.message ?? lastError}`);
};

mkdirSync(outDir, { recursive: true });

let downloaded = 0;
let reused = 0;

/**
 * 扩展包默认不进构建目录：线上由编辑器按需从 R2 拉取。
 * 浏览器 E2E 需要真实编译 Std / Batteries 课程，CI 里用 LEAN_FETCH_EXTENSIONS=1 临时放进
 * public/wasm-lean4，让本地网关能像生产 /cdn 一样提供分片；这些文件只进 CI 工件，不参与部署。
 */
const extensionAssets =
  process.env.LEAN_FETCH_EXTENSIONS === '1'
    ? (manifest.extensions ?? []).flatMap((extension) => extension.assets)
    : [];
const assetsToPrepare = [...manifest.assets, ...extensionAssets];

for (const asset of assetsToPrepare) {
  const target = path.join(outDir, asset.name);
  if (isValid(target, asset)) {
    reused += 1;
    console.log(`reuse  ${asset.name}`);
    continue;
  }

  let data;
  let label = 'local';
  if (asset.local && existsSync(path.join(root, asset.local))) {
    data = readFileSync(path.join(root, asset.local));
    verify(asset, data);
  } else if (asset.encoding === 'zstd') {
    data = toZstd(asset, await fetchUpstream(asset));
    label = 'upstream gzip -> zstd';
  } else {
    ({ data, label } = await fetchFromSources(asset));
  }

  writeFileSync(target, data);
  downloaded += 1;
  console.log(`ok     ${asset.name} <- ${label}`);
}

const primary = primaryOverride ?? manifest.primary.baseUrl;
console.log(
  `\nLean Init runtime ready: ${downloaded} downloaded, ${reused} reused, ${assetsToPrepare.length} total.` +
    `\nprimary: ${manifest.primary.label} (${primary}); fallback: ${manifest.fallback.label}`,
);
