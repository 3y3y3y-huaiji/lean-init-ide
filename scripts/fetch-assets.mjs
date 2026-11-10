import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fetches the pinned Lean 4.34.1 Init runtime used by @wasm-idle/lsp.
 * The upstream artifacts use `.gz` names; the runtime expects `.gz.bin`.
 * Every file is verified against the receipt-pinned size and SHA-256.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'wasm-lean4');
const localWorker = path.join(root, 'scripts', 'assets', 'runner-worker.js');
const BASE =
  'https://raw.githubusercontent.com/seo-rii/wasm-llvm/14ea5ecbc514b0c87338aebf8f2b567020be5750/artifacts/lean-browser';

const assets = [
  {
    name: 'producer-receipt.json',
    source: 'producer-receipt.json',
    bytes: 9768,
    sha256: '335bd6e1720371fc161859cb7c2858600ec12314c30da1f0e5e503e324a96d42',
  },
  {
    name: 'lean.mjs',
    source: 'lean.mjs',
    bytes: 108528,
    sha256: '16d6d6cb07c844bedf745f856a364ec61e86c13c4fe13a2e57c0c698a5c5f727',
  },
  {
    name: 'lean.wasm.gz.bin',
    source: 'lean.wasm.gz',
    bytes: 20239874,
    sha256: '89dc3cb841d487f9e29c1dc3069e7aeb1a63e5ec0267b8250552e3fe90f855bf',
  },
  {
    name: 'lean-init.index.json',
    source: 'lean-init.index.json',
    bytes: 321866,
    sha256: '030b375cee435f12f7163c58c16d128340f9e20fa27a77ab646198be61906555',
  },
  ...[
    ['00', 22626621, 'c2cea0798b8b3e910188eb79d3d0101452c874f693294d2cf8c360fde125c08e'],
    ['01', 22633878, '6e65383d8de425a0c0f5b48430aa5be7c9f2066138080bf213a0435b0fd1d874'],
    ['02', 23039094, '57cc57d61067fc77d8b72008299e25956a121cd3fdf628941420966de1f762e5'],
    ['03', 22382973, 'e310ddf310d6d89dc7cc583f01213a1eab2684c1ada9e77368ca16637009d72a'],
    ['04', 21886461, 'f1345c223483bbb8e3c25e73042c5526efbd24301df95c74d30b4799493e6697'],
    ['05', 9812693, '9f8deb32469cbe66669381c8f0fb5d379d506f7935beb29393b19d2c52ac8a52'],
  ].map(([id, bytes, sha256]) => ({
    name: `lean-init-${id}.pack.gz.bin`,
    source: `lean-init-${id}.pack.gz`,
    bytes,
    sha256,
  })),
  {
    name: 'runner-worker.js',
    local: localWorker,
    bytes: 16049,
    sha256: '3611a263c4304246c9ee2967c07be2a1c70764a39d642db87ba0b86bfbe9d519',
  },
];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const isValid = (file, asset) => {
  if (!existsSync(file)) return false;
  if (statSync(file).size !== asset.bytes) return false;
  return sha256(readFileSync(file)) === asset.sha256;
};

mkdirSync(outDir, { recursive: true });

let downloaded = 0;
let reused = 0;

for (const asset of assets) {
  const target = path.join(outDir, asset.name);
  if (isValid(target, asset)) {
    reused += 1;
    console.log(`reuse  ${asset.name}`);
    continue;
  }

  let data;
  if (asset.local) {
    if (!existsSync(asset.local)) throw new Error(`missing local asset ${asset.local}`);
    data = readFileSync(asset.local);
  } else {
    const url = `${BASE}/${asset.source}`;
    console.log(`fetch  ${asset.name} <- ${asset.source}`);
    const response = await fetch(url, {
      headers: { 'Accept-Encoding': 'identity' },
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
  }

  const actualSha = sha256(data);
  if (data.length !== asset.bytes || actualSha !== asset.sha256) {
    throw new Error(
      `${asset.name} verification failed: ${data.length} bytes / ${actualSha}; ` +
        `expected ${asset.bytes} / ${asset.sha256}`,
    );
  }

  writeFileSync(target, data);
  downloaded += 1;
  console.log(`ok     ${asset.name}`);
}

console.log(`\nLean Init runtime ready: ${downloaded} downloaded, ${reused} reused, ${assets.length} total.`);
