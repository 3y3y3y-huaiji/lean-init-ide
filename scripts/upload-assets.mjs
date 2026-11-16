import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetSources } from '../src/asset-sources.mjs';
import { resolveUploadConfig } from '../src/upload-config.mjs';

/**
 * Publishes the pinned Lean runtime to the Cloudflare R2 bucket.
 *
 * Default mode uses an authenticated Wrangler session (`npx wrangler login`).
 * `--s3` uses the R2 S3-compatible endpoint with a bucket-scoped API token:
 *
 *   R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
 *   AWS_PROFILE=lean-r2 \
 *     node scripts/upload-assets.mjs --s3
 *
 * The AWS profile supplies AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY; the token
 * should be scoped to this bucket with Object Read & Write only.
 * Every local file is verified against the manifest's byte count and SHA-256
 * before upload; objects that are already identical are skipped unless
 * --force-upload is given.
 *
 *   npm run upload:assets                 # production, skip unchanged objects
 *   npm run upload:assets -- --dry-run    # print what would happen
 *   npm run upload:assets -- --verify-only
 *   npm run upload:assets -- --local      # local miniflare bucket instead
 *   npm run upload:assets -- --only lean.mjs --force-upload
 *   npm run upload:assets -- --s3         # bucket-scoped R2 S3 credentials
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 本地凭证文件放在仓库外，避免把 token 写进 git；已存在的环境变量优先。
const assetsEnvFile =
  process.env.ASSETS_ENV_FILE ?? path.join(homedir(), '.config', 'lean-init', 'assets.env');
if (existsSync(assetsEnvFile)) {
  for (const line of readFileSync(assetsEnvFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, '');
    if (value && process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

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
const s3 = has('--s3') || process.env.R2_S3 === '1';
// 扩展包不进入构建期下载目录；默认读 work/extensions，可用 --extensions 覆盖。
const extensionDir =
  option('--extensions') ?? process.env.LEAN_EXTENSION_DIR ?? path.join(root, 'work', 'extensions');
// 空字符串同样视为未设置：GitHub Actions 里缺失的 secret 会变成空串。
const { profile, endpoint, bucket } = resolveUploadConfig({
  s3,
  local,
  cli: {
    profile: option('--profile'),
    endpoint: option('--endpoint'),
    bucket: option('--bucket'),
  },
  env: process.env,
  manifest,
});
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

const awsArgs = (argv) => [
  ...(profile ? ['--profile', profile] : []),
  ...(endpoint ? ['--endpoint-url', endpoint] : []),
  '--region',
  process.env.AWS_REGION ?? 'auto',
  ...argv,
];

const aws = (argv, options = {}) => run('aws', awsArgs(argv), options);

/** HEAD an object through the S3 API; returns null when it does not exist. */
const headS3 = (asset) => {
  try {
    const output = aws([
      's3api',
      'head-object',
      '--bucket',
      bucket,
      '--key',
      asset.key,
      '--output',
      'json',
    ]);
    const meta = JSON.parse(output);
    return {
      etag: String(meta.ETag ?? '')
        .replace(/^"|"$/g, '')
        .replace(/-\d+$/, ''),
      total: Number(meta.ContentLength ?? 0),
      sha256: String(meta.Metadata?.sha256 ?? ''),
    };
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/404|NoSuchKey|Not Found/i.test(message)) return { etag: '', total: 0, notFound: true };
    return { etag: '', total: 0, error: message };
  }
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

const assets = [
  ...manifest.assets,
  ...(manifest.extensions ?? []).flatMap((extension) =>
    extension.assets.map((asset) => ({
      ...asset,
      extension: true,
    })),
  ),
]
  .filter((asset) => only.length === 0 || only.includes(asset.name) || only.includes(asset.key))
  .filter((asset) => !has('--extensions-only') || asset.extension === true);
if (assets.length === 0) throw new Error(`no manifest asset matches --only ${only.join(', ')}`);

let uploaded = 0;
let skipped = 0;
let verified = 0;

for (const asset of assets) {
  const sourcePath = asset.local
    ? path.join(root, asset.local)
    : asset.extension
      ? path.join(extensionDir, asset.name)
      : path.join(outDir, asset.name);
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
  const relative = path.relative(root, sourcePath);
  const bodyPath = relative.startsWith('..') ? sourcePath : relative.split(path.sep).join('/');

  let remote = null;
  if (s3) {
    remote = headS3(asset);
  } else if (!local) {
    try {
      remote = await probeRemote(asset);
    } catch (error) {
      remote = { etag: '', total: 0, error: error.message ?? String(error) };
    }
  }
  const matches = s3
    ? remote?.total === asset.bytes &&
      (remote?.sha256 === asset.sha256 || remote?.etag === localMd5)
    : remote?.etag === localMd5 && remote?.total === asset.bytes;

  if (verifyOnly) {
    if (matches) {
      skipped += 1;
      console.log(`ok     ${asset.key} (${s3 ? 'S3' : 'R2'} 已一致, ${size} bytes)`);
    } else if (remote?.notFound) {
      console.log(`absent ${asset.key} (${s3 ? 'S3' : '网关'}返回 404)`);
    } else {
      console.log(
        `warn   ${asset.key} (探测不可用：${remote?.error ?? 'ETag/长度/sha256 不一致'})`,
      );
    }
    continue;
  }

  if (remote?.error) {
    // S3 探测失败通常意味着凭据 / bucket / endpoint 配置错误，
    // 不能像网关探测那样降级跳过，否则会出现“0 uploaded 但退出码 0”的假成功。
    if (s3) throw new Error(`${asset.key} S3 探测失败：${remote.error}`);
    console.log(
      `skip   ${asset.key} (网关探测不可用：${remote.error}；可用 LEAN_ASSET_ORIGIN 指定站点域名)`,
    );
    continue;
  }

  if (matches && !forceUpload) {
    skipped += 1;
    console.log(`skip   ${asset.key} (${s3 ? 'S3' : 'R2'} 已一致, ${size} bytes)`);
    continue;
  }

  if (s3) {
    const putArgs = [
      's3api',
      'put-object',
      '--bucket',
      bucket,
      '--key',
      asset.key,
      '--body',
      bodyPath,
      '--content-type',
      asset.contentType,
      '--cache-control',
      'public,max-age=31536000,immutable',
      '--metadata',
      `sha256=${asset.sha256},bytes=${asset.bytes}`,
    ];

    if (dryRun) {
      console.log(`dry    aws ${awsArgs(putArgs).join(' ')}`);
      continue;
    }

    console.log(`upload ${asset.key} <- ${bodyPath} (${size} bytes)`);
    aws(putArgs, { stdio: 'inherit', encoding: undefined });
    uploaded += 1;

    const after = headS3(asset);
    if (
      after.notFound ||
      after.total !== asset.bytes ||
      (after.sha256 !== asset.sha256 && after.etag !== localMd5)
    ) {
      console.warn(`warn   ${asset.key} 上传完成，但 S3 校验未通过：${JSON.stringify(after)}`);
    } else {
      verified += 1;
      console.log(`ok     ${asset.key} (S3 ${after.sha256 ? 'sha256' : 'ETag'} 已核对)`);
    }
    continue;
  }

  const putArgs = [
    'r2',
    'object',
    'put',
    `${bucket}/${asset.key}`,
    '--file',
    bodyPath,
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

  console.log(`upload ${asset.key} <- ${bodyPath} (${size} bytes)`);
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
  `\n${s3 ? 's3' : local ? 'local' : 'remote'} bucket ${bucket}: ${uploaded} uploaded, ${skipped} unchanged, ` +
    `${verified} verified, ${assets.length} selected.`,
);
