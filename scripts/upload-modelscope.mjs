#!/usr/bin/env node
/**
 * 把 Lean 运行时资产上传到魔搭（ModelScope）公开仓库，作为国内镜像源。
 *
 * 用法：
 *   MODELSCOPE_TOKEN=xxx MODELSCOPE_REPO=user/lean4-assets \
 *     node scripts/upload-modelscope.mjs
 *
 *   --repo=<ns/name>      覆盖 MODELSCOPE_REPO
 *   --type=dataset|model  仓库类型，默认 dataset
 *   --root=<dir>          仓库内目录，默认用 manifest.mirror.prefix，否则用 cacheKey
 *   --dry-run             只校验本地文件并打印目标 URL
 *   --verify-only         跳过上传，只校验远端 Range/CORS
 *   --prune               上传前删掉仓库根目录下旧版本目录（如 14ea5ec/）
 *   --metadata            同步数据集卡片、LICENSE、.gitattributes 与 SHA256SUMS
 *   --keep                保留下载的临时仓库目录
 *
 * 仓库需先在 modelscope.cn 创建为公开仓库；token 在「个人中心 → 访问令牌」生成。
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 本地凭证文件放在仓库外，避免把 token 写进 git；已存在的环境变量优先。
const assetsEnvFile =
  process.env.ASSETS_ENV_FILE ?? join(homedir(), '.config', 'lean-init', 'assets.env');
if (existsSync(assetsEnvFile)) {
  for (const line of readFileSync(assetsEnvFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, '');
    if (value && process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

const manifest = JSON.parse(readFileSync(join(root, 'config/lean4-runtime.json'), 'utf8'));
const args = new Map();
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (!arg.startsWith('--')) continue;
  const [key, value] = arg.slice(2).split('=');
  if (value !== undefined) args.set(key, value);
  else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
    args.set(key, argv[index + 1]);
    index += 1;
  } else {
    args.set(key, 'true');
  }
}

const repo = args.get('repo') ?? process.env.MODELSCOPE_REPO ?? '';
const repoType = args.get('type') ?? process.env.MODELSCOPE_REPO_TYPE ?? 'dataset';
const rootDir = args.get('root') ?? manifest.mirror?.prefix ?? manifest.cacheKey;
const token = process.env.MODELSCOPE_TOKEN ?? '';
// ModelScope 的 Git 认证用户名固定是 oauth2，不是账号名。
const gitUsername = 'oauth2';
const dryRun = args.has('dry-run');
const verifyOnly = args.has('verify-only');
const prune = args.has('prune');
const metadata = args.has('metadata');
const keep = args.has('keep');

const assetDir = join(root, 'public', 'wasm-lean4');
// 扩展包按需发布，不进入构建期下载目录；用 --extensions 指向解压后的扩展产物目录。
const extensionDir =
  args.get('extensions') ?? process.env.LEAN_EXTENSION_DIR ?? join(root, 'work', 'extensions');
const extensionAssets = (manifest.extensions ?? []).flatMap((extension) => extension.assets);
const allAssets = [...manifest.assets, ...extensionAssets];
const selectedAssets = args.has('extensions-only') ? extensionAssets : allAssets;
const extensionNames = new Set(extensionAssets.map((asset) => asset.name));
const localFileOf = (asset) =>
  join(extensionNames.has(asset.name) ? extensionDir : assetDir, asset.name);
const repoPrefix = repoType === 'model' ? 'models' : 'datasets';
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const remoteUrl = (name) =>
  `https://modelscope.cn/${repoPrefix}/${repo}/resolve/master/${rootDir}/${name}`;
const repoUrl = `https://www.modelscope.cn/${repoPrefix}/${repo}.git`;

// token 只通过环境变量交给 git 的临时 credential helper，不拼进 URL，
// 避免写进 .git/config 或出现在进程参数里。
const credentialHelper = `!f() { test "$1" = get && printf "username=%s\\npassword=%s\\n" "${gitUsername}" "$MODELSCOPE_TOKEN"; }; f`;
const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

const configureCredentials = (cwd) => {
  execFileSync('git', ['config', 'credential.helper', ''], { cwd, stdio: 'pipe', env: gitEnv });
  execFileSync('git', ['config', '--add', 'credential.helper', credentialHelper], {
    cwd,
    stdio: 'pipe',
    env: gitEnv,
  });
};

const fail = (message) => {
  console.error(`modelscope: ${message}`);
  process.exit(1);
};

// Windows 上 git 对象文件是只读的，rmSync 会报 EPERM；先清掉只读位再删。
const removeTree = (dir) => {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    return;
  } catch {
    const stack = [dir];
    while (stack.length > 0) {
      const current = stack.pop();
      let entries;
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      try {
        chmodSync(current, 0o777);
      } catch {
        // 目录可能已消失或没有权限，继续清理其余文件。
      }
      for (const entry of entries) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else {
          try {
            chmodSync(full, 0o666);
          } catch {
            // 文件可能已消失，忽略。
          }
        }
      }
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
};

if (!repo) fail('缺少仓库地址，传 --repo=<namespace/name> 或设置 MODELSCOPE_REPO');

const verifyLocal = () => {
  for (const asset of selectedAssets) {
    const file = localFileOf(asset);
    if (!existsSync(file)) fail(`本地缺少 ${asset.name}，先执行 npm run fetch:assets`);
    const bytes = readFileSync(file).length;
    if (bytes !== asset.bytes) fail(`${asset.name} 字节数 ${bytes}，清单要求 ${asset.bytes}`);
    const digest = sha256(file);
    if (digest !== asset.sha256) fail(`${asset.name} sha256 与清单不一致`);
  }
  console.log(`modelscope: 本地 ${selectedAssets.length} 个资产校验通过`);
};

const verifyRemoteAsset = async (asset) => {
  const url = remoteUrl(asset.name);
  const ranged = asset.ranged === true;
  const response = await fetch(url, {
    headers: {
      ...(ranged ? { Range: 'bytes=0-15' } : {}),
      Origin: 'https://criticalthinking.de5.net',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });

  // 大文件走 LFS CDN 并支持 Range；小文件是普通对象，直接 200 全量返回。
  if (ranged) {
    if (response.status !== 206) {
      throw new Error(`${asset.name} 远端期望 206，实际 ${response.status}`);
    }
    const range = response.headers.get('content-range');
    const expected = `bytes 0-15/${asset.bytes}`;
    if (range !== expected) {
      throw new Error(`${asset.name} Content-Range=${range ?? '(缺失)'}，期望 ${expected}`);
    }
    const body = await response.arrayBuffer();
    if (body.byteLength !== 16) {
      throw new Error(`${asset.name} 分片长度 ${body.byteLength}，期望 16`);
    }
  } else {
    if (response.status !== 200) {
      throw new Error(`${asset.name} 远端期望 200，实际 ${response.status}`);
    }
    const body = await response.arrayBuffer();
    if (body.byteLength !== asset.bytes) {
      throw new Error(`${asset.name} 远端 ${body.byteLength} 字节，清单要求 ${asset.bytes}`);
    }
  }

  if (!response.headers.get('access-control-allow-origin')) {
    const host = new URL(response.url).host;
    throw new Error(
      `${asset.name} 缺少 Access-Control-Allow-Origin（HTTP ${response.status}, ${host}）`,
    );
  }
};

const verifyRemote = async () => {
  // push 后 ModelScope 的 LFS/CDN 有几秒到几分钟的传播窗口（大对象首次挂 CORS 更慢），
  // 立即校验会看到 404 / 缺 CORS，这里给每个资产留约 2.5 分钟重试时间。
  const attempts = 30;
  const failures = [];
  for (const asset of selectedAssets) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await verifyRemoteAsset(asset);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          console.log(
            `modelscope: ${asset.name} 尚未就绪（${attempt}/${attempts}）：${error.message}，5 秒后重试`,
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }
    if (lastError) {
      failures.push(lastError);
      console.warn(`modelscope: ${asset.name} 校验未通过：${lastError.message}`);
    } else {
      console.log(`modelscope: ${asset.name} 远端 ${asset.ranged ? '206' : '200'} / CORS 正常`);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} 个资产远端校验未通过`);
  }
};

const describeAsset = (asset) => {
  if (asset.name === 'lean.wasm.gz.bin') {
    const size = asset.uncompressedBytes?.toLocaleString('en-US') ?? '?';
    return `zstd 压缩的 Lean wasm（解压后 ${size} 字节）`;
  }
  if (asset.name === 'lean.mjs') return 'Emscripten glue';
  if (asset.name === 'lean-init.index.json') return 'Init olean 分片索引';
  if (asset.name.startsWith('lean-init-') && asset.name.endsWith('.pack.gz.bin')) {
    return 'Init olean pack';
  }
  if (asset.name === 'producer-receipt.json') return '构建回执';
  if (asset.name === 'runner-worker.js') return 'Worker 入口';
  return '';
};

const writeMetadata = async (work) => {
  if (!metadata) return;
  const assetRows = manifest.assets
    .map(
      (asset) =>
        `| \`${asset.name}\` | ${asset.bytes.toLocaleString('en-US')} | ${describeAsset(asset)} |`,
    )
    .join('\n');
  const extensionRows = extensionAssets
    .map((asset) => `| \`${asset.name}\` | ${asset.bytes.toLocaleString('en-US')} | 扩展库 |`)
    .join('\n');
  const card = `---
license: Apache-2.0
language:
  - en
tags:
  - lean4
  - wasm
  - webassembly
  - runtime
  - education
pretty_name: Lean Init IDE runtime assets
size_categories:
  - "100M<n<1B"
---

# Lean Init IDE runtime assets

浏览器端 Lean Init IDE 的 WebAssembly 运行时资产。基础运行时包含 ${manifest.runtime}；
Std 与 Batteries 作为独立扩展包按需下载（同样 zstd + SHA-256），不包含 Lean 编译器 / Lake / Mathlib；
语言服务器在 Web Worker 中运行。

- 项目：https://github.com/3y3y3y-huaiji/lean-init-ide
- 在线使用：https://criticalthinking.de5.net
- 上游构建：seo-rii/wasm-llvm（producer/lean-browser） + Lean v4.35.0

## 目录

| 目录 | 运行时 | 状态 |
| --- | --- | --- |
| \`${rootDir}/\` | ${manifest.runtime} | 当前生产版本 |

## 当前版本资产

| 文件 | 字节 | 说明 |
| --- | ---: | --- |
${assetRows}

完整性校验见 \`${rootDir}/SHA256SUMS\`。应用侧清单是主仓库的 \`config/lean4-runtime.json\`。
${
  extensionRows
    ? `
## 扩展库（按需）

| 文件 | 字节 | 说明 |
| --- | ---: | --- |
${extensionRows}
`
    : ''
}

## 使用

\`\`\`text
https://modelscope.cn/${repoPrefix}/${repo}/resolve/master/${rootDir}/<name>
\`\`\`

## 完整性

- 所有交付字节都是 zstd；上游 gzip 在 GitHub Release，不在此镜像重复存放
- 每个文件在 \`SHA256SUMS\` 中固定 SHA-256
- 资产只追加新版本目录；已有版本的字节不原地替换

## 许可证

- Lean 4.35.0：Apache-2.0
- wasm-llvm / producer：Apache-2.0 AND MIT
- 本数据集中的构建产物按 Apache-2.0 分发，见 \`LICENSE\`

## 维护

- 新运行时版本使用新的 \`wasm-lean4/<version>/\` 目录
- 旧版本目录保留用于回滚；重复 revision 目录（如 \`14ea5ec/\`）由 \`--prune\` 清理
- 删除目录不会回收 Git LFS 历史对象；如需彻底回收存储，需要重建数据集或改写历史
`;
  writeFileSync(join(work, 'README.md'), card);

  const licenseResponse = await fetch('https://www.apache.org/licenses/LICENSE-2.0.txt', {
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!licenseResponse.ok) throw new Error(`LICENSE HTTP ${licenseResponse.status}`);
  writeFileSync(join(work, 'LICENSE'), await licenseResponse.text());

  mkdirSync(join(work, rootDir), { recursive: true });
  const sums = `${allAssets.map((asset) => `${asset.sha256}  ${asset.name}`).join('\n')}\n`;
  writeFileSync(join(work, rootDir, 'SHA256SUMS'), sums);
};

const upload = async () => {
  if (!token) fail('上传需要 MODELSCOPE_TOKEN');
  const work = mkdtempSync(join(tmpdir(), 'modelscope-upload-'));
  try {
    console.log(`modelscope: 克隆 ${repoPrefix}/${repo} 到临时目录`);
    try {
      execFileSync(
        'git',
        [
          '-c',
          'credential.helper=',
          '-c',
          `credential.helper=${credentialHelper}`,
          'clone',
          '--depth',
          '1',
          repoUrl,
          work,
        ],
        {
          stdio: 'pipe',
          // 仓库里的 LFS 文件不会被改写，跳过 smudge 以免每次上传都重新下载 100MB。
          env: { ...gitEnv, GIT_LFS_SKIP_SMUDGE: '1' },
        },
      );
    } catch {
      // 空仓库 clone 可能失败，退化为 init + remote。
      mkdirSync(work, { recursive: true });
      execFileSync('git', ['init'], { cwd: work, stdio: 'pipe', env: gitEnv });
      execFileSync('git', ['remote', 'add', 'origin', repoUrl], {
        cwd: work,
        stdio: 'pipe',
        env: gitEnv,
      });
      execFileSync('git', ['checkout', '-b', 'master'], { cwd: work, stdio: 'pipe', env: gitEnv });
    }
    // push 与 git-lfs 子进程共用仓库内的 helper 配置；helper 只读环境变量，不含密钥。
    configureCredentials(work);
    execFileSync('git', ['lfs', 'install', '--local'], { cwd: work, stdio: 'pipe' });

    if (prune) {
      let removed = 0;
      for (const entry of readdirSync(work, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === '.git' || entry.name === rootDir) continue;
        // 只清理旧 revision / cacheKey 目录（十六进制名），不碰 README 等仓库内容。
        if (!/^[0-9a-f]{7,40}$/i.test(entry.name)) continue;
        rmSync(join(work, entry.name), { recursive: true, force: true });
        removed += 1;
        console.log(`modelscope: 清理旧目录 ${entry.name}/`);
      }
      if (removed === 0) console.log('modelscope: 没有需要清理的旧目录');
    }

    const attributes = join(work, '.gitattributes');
    const existing = existsSync(attributes) ? readFileSync(attributes, 'utf8') : '';
    const lfsRules = [
      '*.bin filter=lfs diff=lfs merge=lfs -text',
      '*.gz filter=lfs diff=lfs merge=lfs -text',
      '*.zst filter=lfs diff=lfs merge=lfs -text',
      '*.json filter=lfs diff=lfs merge=lfs -text',
      '*.wasm filter=lfs diff=lfs merge=lfs -text',
      '*.pack filter=lfs diff=lfs merge=lfs -text',
    ];
    let attributesText = existing;
    for (const rule of lfsRules) {
      if (!attributesText.includes(rule)) {
        attributesText = `${attributesText}${attributesText.endsWith('\n') || !attributesText ? '' : '\n'}${rule}\n`;
      }
    }
    if (attributesText !== existing) writeFileSync(attributes, attributesText);

    await writeMetadata(work);

    const target = join(work, rootDir);
    mkdirSync(target, { recursive: true });
    for (const asset of selectedAssets) {
      copyFileSync(localFileOf(asset), join(target, asset.name));
    }

    execFileSync('git', ['add', '-A'], { cwd: work, stdio: 'pipe' });
    try {
      execFileSync(
        'git',
        ['commit', '-m', `assets: ${rootDir}${metadata ? ' + dataset card' : ''}`],
        {
          cwd: work,
          stdio: 'pipe',
        },
      );
    } catch {
      console.log('modelscope: 没有新变更需要提交');
    }
    execFileSync('git', ['push', 'origin', 'master'], {
      cwd: work,
      stdio: 'inherit',
      env: gitEnv,
    });
  } finally {
    if (keep) {
      console.log(`modelscope: 临时目录保留在 ${work}`);
    } else {
      try {
        removeTree(work);
      } catch {
        console.warn(`modelscope: 临时目录清理失败，可手动删除 ${work}`);
      }
    }
  }
};

const main = async () => {
  verifyLocal();
  if (dryRun) {
    for (const asset of selectedAssets) console.log(`  ${remoteUrl(asset.name)}`);
    return;
  }
  if (!verifyOnly) await upload();
  try {
    await verifyRemote();
  } catch (error) {
    // 上传已经成功，镜像校验失败不该阻塞 R2 / GitHub Release 的发布；
    // --verify-only 仍然保持严格模式，用来单独检查镜像健康度。
    if (verifyOnly) throw error;
    console.warn(`modelscope: 远端校验未通过，但资产已 push：${error.message}`);
    console.warn('modelscope: 可用 --verify-only 单独复查；不影响 R2 / GitHub Release');
  }
  console.log(
    'modelscope: 完成；把 config/lean4-runtime.json 的 mirror.baseUrl 指向上面的目录即可',
  );
};

main().catch((error) => {
  console.error(`modelscope: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
