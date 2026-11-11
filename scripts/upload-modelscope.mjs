#!/usr/bin/env node
/**
 * 把 Lean 运行时资产上传到魔搭（ModelScope）公开仓库，作为国内镜像源。
 *
 * 用法：
 *   MODELSCOPE_USERNAME=xxx MODELSCOPE_TOKEN=xxx MODELSCOPE_REPO=user/lean4-assets \
 *     node scripts/upload-modelscope.mjs
 *
 *   --repo=<ns/name>      覆盖 MODELSCOPE_REPO
 *   --type=dataset|model  仓库类型，默认 dataset
 *   --root=<cacheKey>     仓库内目录，默认用清单 cacheKey
 *   --dry-run             只校验本地文件并打印目标 URL
 *   --verify-only         跳过上传，只校验远端 Range/CORS
 *   --keep                保留下载的临时仓库目录
 *
 * 仓库需先在 modelscope.cn 创建为公开仓库；token 在「个人中心 → 访问令牌」生成。
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'config/lean4-runtime.json'), 'utf8'));
const args = new Map(
  process.argv
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value] = arg.slice(2).split('=');
      return [key, value ?? 'true'];
    }),
);

const repo = args.get('repo') ?? process.env.MODELSCOPE_REPO ?? '';
const repoType = args.get('type') ?? process.env.MODELSCOPE_REPO_TYPE ?? 'dataset';
const rootDir = args.get('root') ?? manifest.cacheKey;
const username = process.env.MODELSCOPE_USERNAME ?? '';
const token = process.env.MODELSCOPE_TOKEN ?? '';
const dryRun = args.has('dry-run');
const verifyOnly = args.has('verify-only');
const keep = args.has('keep');

const assetDir = join(root, 'public', 'wasm-lean4');
const repoPrefix = repoType === 'model' ? 'models' : 'datasets';
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const remoteUrl = (name) =>
  `https://modelscope.cn/${repoPrefix}/${repo}/resolve/master/${rootDir}/${name}`;
const cloneUrl = (withAuth) => {
  const host = `www.modelscope.cn/${repoPrefix}/${repo}.git`;
  return withAuth
    ? `https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@${host}`
    : `https://${host}`;
};

const fail = (message) => {
  console.error(`modelscope: ${message}`);
  process.exit(1);
};

if (!repo) fail('缺少仓库地址，传 --repo=<namespace/name> 或设置 MODELSCOPE_REPO');

const verifyLocal = () => {
  for (const asset of manifest.assets) {
    const file = join(assetDir, asset.name);
    if (!existsSync(file)) fail(`本地缺少 ${asset.name}，先执行 npm run fetch:assets`);
    const bytes = readFileSync(file).length;
    if (bytes !== asset.bytes) fail(`${asset.name} 字节数 ${bytes}，清单要求 ${asset.bytes}`);
    const digest = sha256(file);
    if (digest !== asset.sha256) fail(`${asset.name} sha256 与清单不一致`);
  }
  console.log(`modelscope: 本地 ${manifest.assets.length} 个资产校验通过`);
};

const verifyRemote = async () => {
  for (const asset of manifest.assets) {
    const url = remoteUrl(asset.name);
    const response = await fetch(url, {
      headers: {
        Range: 'bytes=0-15',
        Origin: 'https://criticalthinking.de5.net',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });
    if (response.status !== 206) fail(`${asset.name} 远端期望 206，实际 ${response.status}`);
    const range = response.headers.get('content-range');
    const expected = `bytes 0-15/${asset.bytes}`;
    if (range !== expected)
      fail(`${asset.name} Content-Range=${range ?? '(缺失)'}，期望 ${expected}`);
    if (!response.headers.get('access-control-allow-origin')) {
      fail(`${asset.name} 缺少 Access-Control-Allow-Origin`);
    }
    const body = await response.arrayBuffer();
    if (body.byteLength !== 16) fail(`${asset.name} 分片长度 ${body.byteLength}，期望 16`);
    console.log(`modelscope: ${asset.name} 远端 206 / CORS 正常`);
  }
};

const upload = () => {
  if (!username || !token) fail('上传需要 MODELSCOPE_USERNAME 与 MODELSCOPE_TOKEN');
  const work = mkdtempSync(join(tmpdir(), 'modelscope-upload-'));
  try {
    console.log(`modelscope: 克隆 ${repoPrefix}/${repo} 到临时目录`);
    try {
      execFileSync('git', ['clone', '--depth', '1', cloneUrl(true), work], { stdio: 'pipe' });
    } catch {
      // 空仓库 clone 可能失败，退化为 init + remote。
      mkdirSync(work, { recursive: true });
      execFileSync('git', ['init'], { cwd: work, stdio: 'pipe' });
      execFileSync('git', ['remote', 'add', 'origin', cloneUrl(true)], {
        cwd: work,
        stdio: 'pipe',
      });
      execFileSync('git', ['checkout', '-b', 'master'], { cwd: work, stdio: 'pipe' });
    }
    execFileSync('git', ['lfs', 'install', '--local'], { cwd: work, stdio: 'pipe' });

    const attributes = join(work, '.gitattributes');
    const existing = existsSync(attributes) ? readFileSync(attributes, 'utf8') : '';
    const lfsRule = '*.bin filter=lfs diff=lfs merge=lfs -text';
    if (!existing.includes(lfsRule)) {
      writeFileSync(
        attributes,
        `${existing}${existing.endsWith('\n') || !existing ? '' : '\n'}${lfsRule}\n`,
      );
    }

    const target = join(work, rootDir);
    mkdirSync(target, { recursive: true });
    for (const asset of manifest.assets) {
      copyFileSync(join(assetDir, asset.name), join(target, asset.name));
    }

    execFileSync('git', ['add', '.'], { cwd: work, stdio: 'pipe' });
    try {
      execFileSync('git', ['commit', '-m', `assets: ${rootDir}`], { cwd: work, stdio: 'pipe' });
    } catch {
      console.log('modelscope: 没有新变更需要提交');
    }
    execFileSync('git', ['push', 'origin', 'master'], { cwd: work, stdio: 'inherit' });
  } finally {
    if (keep) console.log(`modelscope: 临时目录保留在 ${work}`);
    else rmSync(work, { recursive: true, force: true });
  }
};

const main = async () => {
  verifyLocal();
  if (dryRun) {
    for (const asset of manifest.assets) console.log(`  ${remoteUrl(asset.name)}`);
    return;
  }
  if (!verifyOnly) upload();
  await verifyRemote();
  console.log(
    'modelscope: 完成；把 config/lean4-runtime.json 的 mirror.baseUrl 指向上面的目录即可',
  );
};

main().catch((error) => {
  console.error(`modelscope: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
