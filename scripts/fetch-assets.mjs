import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetSources } from '../src/asset-sources.mjs';

/**
 * Downloads the pinned Lean 4.34.1 Init runtime used by @wasm-idle/lsp.
 *
 * The manifest in config/lean4-runtime.json is shared with the Service Worker:
 * Cloudflare R2 is the primary source, GitHub raw is the fallback. Upstream
 * artifacts use `.gz` names while the runtime expects `.gz.bin`. Every file is
 * verified against its pinned byte count and SHA-256 before it is written.
 *
 * Set LEAN_ASSET_BASE_URL to override the primary source (e.g. a staging bucket).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'wasm-lean4');
const manifest = JSON.parse(readFileSync(path.join(root, 'config', 'lean4-runtime.json'), 'utf8'));
const primaryOverride = process.env.LEAN_ASSET_BASE_URL?.trim() || undefined;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
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

const fetchFromSources = async (asset) => {
  let lastError;
  for (const source of assetSources(manifest, asset, primaryOverride)) {
    try {
      const response = await fetch(source.url, {
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

for (const asset of manifest.assets) {
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
  } else {
    ({ data, label } = await fetchFromSources(asset));
  }

  writeFileSync(target, data);
  downloaded += 1;
  console.log(`ok     ${asset.name} <- ${label}`);
}

const primary = primaryOverride ?? manifest.primary.baseUrl;
console.log(
  `\nLean Init runtime ready: ${downloaded} downloaded, ${reused} reused, ${manifest.assets.length} total.` +
    `\nprimary: ${manifest.primary.label} (${primary}); fallback: ${manifest.fallback.label}`,
);
