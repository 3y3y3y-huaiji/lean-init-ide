#!/usr/bin/env node
/**
 * 把 wasm-llvm package.mjs 的发布目录加工成 App 可直接分发的 zstd 资产与候选清单。
 *
 * - 所有 upstream *.gz 先解压，再以 zstd level 19 重压成 *.gz.bin，
 *   与 scripts/fetch-assets.mjs 的生成参数保持一致。
 * - 生成 runtime-manifest.json，可作为 config/lean4-runtime.json 的候选版本。
 * - 生成 SHA256SUMS，覆盖目录内全部交付文件。
 *
 * 用法：
 *   node scripts/package-runtime-assets.mjs \
 *     --artifact=work/artifact \
 *     --lean-version=4.35.0 \
 *     --revision=14ea5ecbc514b0c87338aebf8f2b567020be5750 \
 *     --key-prefix=wasm-lean4/4.35.0 \
 *     --mirror-prefix=wasm-lean4/4.35.0 \
 *     --fallback-base=https://github.com/OWNER/REPO/releases/download/runtime-v4.35.0/ \
 *     --manifest-out=work/artifact/runtime-manifest.json
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants as zlibConstants, gunzipSync, zstdCompressSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = new Map();
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (!arg.startsWith('--')) continue;
  const separator = arg.indexOf('=');
  if (separator >= 0) {
    args.set(arg.slice(2, separator), arg.slice(separator + 1));
  } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
    args.set(arg.slice(2), argv[index + 1]);
    index += 1;
  } else {
    args.set(arg.slice(2), 'true');
  }
}

const artifactDir = path.resolve(root, args.get('artifact') ?? 'work/artifact');
const runnerPath = path.resolve(root, args.get('runner') ?? 'scripts/assets/runner-worker.js');
const manifestOut = path.resolve(
  root,
  args.get('manifest-out') ?? path.join(artifactDir, 'runtime-manifest.json'),
);

const leanVersion = args.get('lean-version') ?? '4.35.0';
const revision = args.get('revision') ?? '14ea5ecbc514b0c87338aebf8f2b567020be5750';
const bucket = args.get('bucket') ?? 'lean4-ide-releases';
const keyPrefix = (args.get('key-prefix') ?? `wasm-lean4/${leanVersion}`).replace(/^\/+|\/+$/g, '');
const mirrorPrefix = (args.get('mirror-prefix') ?? `wasm-lean4/${leanVersion}`).replace(
  /^\/+|\/+$/g,
  '',
);
const mirrorBase =
  args.get('mirror-base') ?? 'https://modelscope.cn/datasets/HQZMSu/lean4-assets/resolve/master/';
const fallbackBase =
  args.get('fallback-base') ??
  `https://github.com/OWNER/REPO/releases/download/runtime-v${leanVersion}/`;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const keyOf = (name) => (keyPrefix ? `${keyPrefix}/${name}` : name);
const contentTypeOf = (name) => {
  if (name.endsWith('.mjs') || name.endsWith('.js')) return 'text/javascript';
  if (name.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
};

if (!existsSync(artifactDir)) {
  throw new Error(`artifact 目录不存在: ${artifactDir}`);
}

const entries = readdirSync(artifactDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

const required = ['lean.mjs', 'lean.wasm.gz', 'lean-init.index.json', 'producer-receipt.json'];
for (const name of required) {
  if (!entries.includes(name)) throw new Error(`artifact 缺少 ${name}`);
}
if (!existsSync(runnerPath)) throw new Error(`缺少 runner-worker.js: ${runnerPath}`);

const gzFiles = entries
  .filter((name) => name === 'lean.wasm.gz' || /^lean-init-\d+\.pack\.gz$/.test(name))
  .sort();
const packs = gzFiles.filter((name) => /^lean-init-\d+\.pack\.gz$/.test(name));
if (packs.length === 0) throw new Error('artifact 缺少 lean-init-*.pack.gz');

const zstdAssets = gzFiles.map((upstreamName) => {
  const upstream = readFileSync(path.join(artifactDir, upstreamName));
  const raw = gunzipSync(upstream);
  const packed = zstdCompressSync(raw, {
    params: { [zlibConstants.ZSTD_c_compressionLevel]: 19 },
  });
  const name = `${upstreamName}.bin`;
  writeFileSync(path.join(artifactDir, name), packed);
  return {
    name,
    key: keyOf(name),
    source: upstreamName,
    bytes: packed.length,
    sha256: sha256(packed),
    contentType: 'application/octet-stream',
    ranged: true,
    encoding: 'zstd',
    upstream: upstreamName,
    upstreamBytes: upstream.length,
    upstreamSha256: sha256(upstream),
    uncompressedBytes: raw.length,
    uncompressedSha256: sha256(raw),
  };
});

const plainAssets = ['lean.mjs', 'lean-init.index.json', 'producer-receipt.json'].map((name) => {
  const data = readFileSync(path.join(artifactDir, name));
  return {
    name,
    key: keyOf(name),
    source: name,
    bytes: data.length,
    sha256: sha256(data),
    contentType: contentTypeOf(name),
  };
});

const runnerData = readFileSync(runnerPath);
copyFileSync(runnerPath, path.join(artifactDir, 'runner-worker.js'));
const runnerAsset = {
  name: 'runner-worker.js',
  key: keyOf('runner-worker.js'),
  local: path.relative(root, runnerPath).split(path.sep).join('/'),
  source: 'runner-worker.js',
  bytes: runnerData.length,
  sha256: sha256(runnerData),
  contentType: 'text/javascript',
};

const orderOf = (name) => {
  if (name === 'producer-receipt.json') return 0;
  if (name === 'lean.mjs') return 1;
  if (name === 'lean.wasm.gz.bin') return 2;
  if (name === 'lean-init.index.json') return 3;
  const pack = name.match(/^lean-init-(\d+)\.pack\.gz\.bin$/);
  if (pack) return 10 + Number(pack[1]);
  if (name === 'runner-worker.js') return 100;
  return 50;
};

const assets = [...zstdAssets, ...plainAssets, runnerAsset].sort(
  (left, right) => orderOf(left.name) - orderOf(right.name) || left.name.localeCompare(right.name),
);

const fingerprint = assets.map((asset) => `${asset.name}:${asset.sha256}`).join('\n');
const cacheKey = args.get('cache-key') ?? `z${sha256(fingerprint).slice(0, 8)}`;

const manifest = {
  revision,
  cacheKey,
  runtime: `Lean ${leanVersion} Init`,
  bucket,
  primary: { label: 'Pages Functions (R2)', baseUrl: '/cdn/' },
  fallback: {
    label: fallbackBase.includes('/releases/download/') ? 'GitHub release' : 'GitHub raw',
    baseUrl: fallbackBase,
  },
  mirror: { label: 'ModelScope', baseUrl: mirrorBase, prefix: mirrorPrefix },
  assets,
};

writeFileSync(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
  path.join(artifactDir, 'asset-manifest.json'),
  `${JSON.stringify({ revision, cacheKey, assets }, null, 2)}\n`,
);
writeFileSync(
  path.join(artifactDir, 'SHA256SUMS'),
  `${assets.map((asset) => `${asset.sha256}  ${asset.name}`).join('\n')}\n`,
);

console.log(`runtime assets: ${assets.length} files (${packs.length} Init packs)`);
for (const asset of assets) {
  console.log(
    `  ${asset.name.padEnd(28)} ${String(asset.bytes).padStart(10)} bytes  ` +
      `${asset.sha256.slice(0, 12)}  ${asset.encoding ?? 'raw'}`,
  );
}
console.log(`cacheKey: ${cacheKey}`);
console.log(`manifest: ${path.relative(root, manifestOut)}`);
