import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetSources } from '../src/asset-sources.mjs';

/**
 * Publishes the pinned Lean runtime to the Cloudflare R2 bucket.
 *
 * Requires an authenticated Wrangler session (`npx wrangler login`). Every local
 * file is verified against the manifest's byte count and SHA-256 before upload;
 * remote objects are re-checked by ETag (MD5) and Content-Range afterwards.
 * Objects that are already identical are skipped unless --force-upload is given.
 *
 *   npm run upload:assets                 # production, skip unchanged objects
 *   npm run upload:assets -- --dry-run    # print what would happen
 *   npm run upload:assets -- --verify-only
 *   npm run upload:assets -- --local      # local miniflare bucket instead
 *   npm run upload:assets -- --only lean.mjs --force-upload
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'wasm-lean4');
const manifest = JSON.parse(readFileSync(path.join(root, 'config', 'lean4-runtime.json'), 'utf8'));

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const only = args.reduce((list, arg, index) => {
  if (arg === '--only' && args[index + 1]) list.push(args[index + 1]);
  return list;
}, []);

const local = has('--local');
const dryRun = has('--dry-run');
const verifyOnly = has('--verify-only');
const forceUpload = has('--force-upload');
const bucket = option('--bucket') ?? manifest.bucket;
// 主源是站点同源 /cdn/ 网关；探测时补一个可达的站点域名。
const probeOrigin = process.env.LEAN_ASSET_ORIGIN?.trim() || 'https://criticalthinking.de5.net';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const md5 = (data) => createHash('md5').update(data).digest('hex');

const run = (command, argv, options = {}) => {
  const result = spawnSync(command, argv, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with ${result.status}: ${String(result.stderr ?? '').trim()}`,
    );
  }
  return String(result.stdout ?? '');
};

const wrangler = (argv) => {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  run(command, ['-y', 'wrangler', ...argv], { stdio: 'inherit', encoding: undefined });
};

/** Read object metadata through the deployed same-origin /cdn/ gateway. */
const probeRemote = async (asset, attempts = 1) => {
  const [primary] = assetSources(manifest, asset);
  if (!primary) throw new Error(`no primary source for ${asset.name}`);
  const absolute = primary.url.startsWith('/')
    ? new URL(primary.url, probeOrigin).href
    : primary.url;

  const probeOnce = async () => {
    // 每次探测换一个查询参数：避免 Cloudflare 边缘缓存住上传前的 404 或旧 ETag。
    const url = new URL(absolute);
    url.searchParams.set('_', String(Date.now()));
    const target = url.href;

    const readHeaders = async () => {
      const response = await fetch(target, { headers: { Range: 'bytes=0-0' } });
      if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`);
      return {
        etag: response.headers.get('etag') ?? '',
        contentRange: response.headers.get('content-range') ?? '',
      };
    };

    try {
      return await readHeaders();
    } catch (error) {
      // Node fetch does not honor HTTP(S)_PROXY; curl does.
      const output = run('curl', [
        '-sS',
        '-D',
        '-',
        '-o',
        '/dev/null',
        '-H',
        'Range: bytes=0-0',
        target,
      ]);
      const lines = output.split(/\r?\n/);
      const headers = {
        etag:
          lines
            .find((line) => /^etag:/i.test(line))
            ?.slice(5)
            .trim() ?? '',
        contentRange:
          lines
            .find((line) => /^content-range:/i.test(line))
            ?.slice(14)
            .trim() ?? '',
      };
      if (!headers.contentRange) throw error;
      return headers;
    }
  };

  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const headers = await probeOnce();
      const total = Number(headers.contentRange.split('/')[1]);
      const etag = headers.etag.replace(/^"|"$/g, '').replace(/-\d+$/, '');
      return { etag, total };
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }
  // 404 = 对象确实缺失；其它错误说明网关还没上线或网络不通，不该据此重传。
  if (/HTTP 404/.test(String(lastError?.message ?? lastError))) {
    return { etag: '', total: 0, notFound: true };
  }
  throw lastError;
};

const assets = manifest.assets.filter(
  (asset) => only.length === 0 || only.includes(asset.name) || only.includes(asset.key),
);
if (assets.length === 0) throw new Error(`no manifest asset matches --only ${only.join(', ')}`);

let uploaded = 0;
let skipped = 0;
let verified = 0;

for (const asset of assets) {
  const sourcePath = asset.local ? path.join(root, asset.local) : path.join(outDir, asset.name);
  if (!existsSync(sourcePath)) {
    throw new Error(`missing ${sourcePath}; run "npm run fetch:assets" first`);
  }
  const data = readFileSync(sourcePath);
  const size = statSync(sourcePath).size;
  const digest = sha256(data);
  if (size !== asset.bytes || digest !== asset.sha256) {
    throw new Error(`${asset.name} failed local verification (${size} bytes / ${digest})`);
  }
  const localMd5 = md5(data);
  const relativePath = path.relative(root, sourcePath).split(path.sep).join('/');

  let remote = null;
  if (!local) {
    try {
      remote = await probeRemote(asset);
    } catch (error) {
      remote = { etag: '', total: 0, error: error.message ?? String(error) };
    }
  }
  const matches = remote?.etag === localMd5 && remote?.total === asset.bytes;

  if (verifyOnly) {
    if (matches) {
      skipped += 1;
      console.log(`ok     ${asset.key} (R2 已一致, ${size} bytes, ETag ${remote.etag})`);
    } else if (remote?.notFound) {
      console.log(`absent ${asset.key} (网关返回 404)`);
    } else {
      console.log(`warn   ${asset.key} (探测不可用：${remote?.error ?? 'ETag/长度不一致'})`);
    }
    continue;
  }

  if (remote?.error) {
    console.log(
      `skip   ${asset.key} (网关探测不可用：${remote.error}；可用 LEAN_ASSET_ORIGIN 指定站点域名)`,
    );
    continue;
  }

  if (matches && !forceUpload) {
    skipped += 1;
    console.log(`skip   ${asset.key} (R2 已一致, ${size} bytes)`);
    continue;
  }

  const putArgs = [
    'r2',
    'object',
    'put',
    `${bucket}/${asset.key}`,
    '--file',
    relativePath,
    '--content-type',
    asset.contentType,
    '--cache-control',
    'public,max-age=31536000,immutable',
    local ? '--local' : '--remote',
    '--force',
  ];

  if (dryRun) {
    console.log(`dry    npx wrangler ${putArgs.join(' ')}`);
    continue;
  }

  console.log(`upload ${asset.key} <- ${relativePath} (${size} bytes)`);
  wrangler(putArgs);
  uploaded += 1;

  if (!local) {
    try {
      const after = await probeRemote(asset, 4);
      if (after.notFound || after.etag !== localMd5 || after.total !== asset.bytes) {
        console.warn(`warn   ${asset.key} 上传完成，但远端校验未通过：${JSON.stringify(after)}`);
      } else {
        verified += 1;
        console.log(`ok     ${asset.key} (ETag ${after.etag})`);
      }
    } catch (error) {
      console.warn(`warn   ${asset.key} 上传完成，网关尚不可用于校验：${error.message ?? error}`);
    }
  }
}

console.log(
  `\n${local ? 'local' : 'remote'} bucket ${bucket}: ${uploaded} uploaded, ${skipped} unchanged, ` +
    `${verified} verified, ${assets.length} selected.`,
);
