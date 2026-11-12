/**
 * 生成 @wasm-idle/lsp 的 pnpm patch。
 *
 * 为什么不用 `pnpm patch-commit`：pnpm 12 在 Windows 上清理临时目录会报
 * os error 145，补丁本身能生成但命令失败。这里直接从 npm registry 下载
 * 官方包、应用运行时补丁、用 git diff 产出标准 patch，并更新
 * pnpm-workspace.yaml 的 patchedDependencies。
 *
 * 用法：
 *   pnpm run patch:lsp
 *   pnpm run patch:lsp -- --version 1.3.0
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageName = '@wasm-idle/lsp';
const configPath = path.join(root, 'pnpm-workspace.yaml');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const argVersion = (() => {
  const index = process.argv.indexOf('--version');
  return index === -1 ? undefined : process.argv[index + 1];
})();
const declared = packageJson.dependencies?.[packageName] ?? '';
const version = argVersion ?? declared.replace(/^[~^]/, '');
if (!/^\d+\.\d+\.\d+/.test(version)) {
  throw new Error(`无法确定 ${packageName} 版本：${version || '(空)'}`);
}

const registry = process.env.LEAN_NPM_REGISTRY ?? 'https://registry.npmjs.org';
const patchFile = `${packageName.replace('/', '__')}@${version}.patch`;
const patchPath = path.join(root, 'patches', patchFile);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失败（退出码 ${result.status}）`);
  }
  return result;
};

const updatePatchedDependencies = (config, key, value) => {
  const lines = config.split('\n');
  const entry = `  '${key}': ${value}`;
  const start = lines.findIndex((line) => line.trim() === 'patchedDependencies:');

  if (start === -1) {
    return `${config.trimEnd()}\n\npatchedDependencies:\n${entry}\n`;
  }

  let end = start + 1;
  while (end < lines.length && lines[end].startsWith('  ')) end += 1;

  const block = lines.slice(start + 1, end);
  const existing = block.findIndex(
    (line) =>
      line.trim().startsWith("'@wasm-idle/lsp@") || line.trim().startsWith('@wasm-idle/lsp@'),
  );
  if (existing === -1) block.unshift(entry);
  else block[existing] = entry;

  lines.splice(start + 1, end - start - 1, ...block);
  return lines.join('\n');
};

const work = mkdtempSync(path.join(os.tmpdir(), 'lean-lsp-patch-'));
try {
  console.log(`[patch] 获取 ${packageName}@${version} 的清单`);
  const meta = await fetch(`${registry}/${packageName}/${version}`).then((response) => {
    if (!response.ok) throw new Error(`registry 返回 ${response.status}`);
    return response.json();
  });

  const tarball = Buffer.from(
    await fetch(meta.dist.tarball).then((response) => response.arrayBuffer()),
  );
  const [algorithm, expected] = String(meta.dist.integrity).split('-');
  const actual = createHash(algorithm).update(tarball).digest('base64');
  if (actual !== expected) throw new Error('tarball 完整性校验失败');

  const cleanDir = path.join(work, 'clean');
  const tarballPath = path.join(work, 'package.tgz');
  mkdirSync(cleanDir, { recursive: true });
  writeFileSync(tarballPath, tarball);
  run('tar', ['-xzf', tarballPath, '-C', cleanDir]);

  const packageRoot = path.join(cleanDir, 'package');
  const origDist = path.join(work, 'orig', 'dist');
  cpSync(path.join(packageRoot, 'dist'), origDist, { recursive: true });

  console.log('[patch] 应用运行时补丁');
  run(process.execPath, [path.join(root, 'scripts', 'patch-lsp.mjs'), packageRoot]);

  const diff = spawnSync(
    'git',
    ['diff', '--no-index', '--src-prefix=a/', '--dst-prefix=b/', 'orig/dist', 'clean/package/dist'],
    { cwd: work, encoding: 'utf8' },
  );
  if (diff.status !== 1 || !diff.stdout) {
    throw new Error(diff.stderr || 'git diff 没有产生差异，补丁可能已失效');
  }

  const patch = diff.stdout
    .replaceAll('a/orig/dist/', 'a/dist/')
    .replaceAll('b/clean/package/dist/', 'b/dist/')
    .replace(/\r\n/g, '\n');
  mkdirSync(path.dirname(patchPath), { recursive: true });
  writeFileSync(patchPath, patch);

  const config = readFileSync(configPath, 'utf8');
  const nextConfig = updatePatchedDependencies(
    config,
    `${packageName}@${version}`,
    `patches/${patchFile}`,
  );
  if (nextConfig !== config) writeFileSync(configPath, nextConfig);

  console.log(`[patch] 已写入 ${path.relative(root, patchPath)}`);
  console.log(
    '[patch] 下一步：pnpm install --no-frozen-lockfile && pnpm exec vitest run src/lsp-patches.test.ts',
  );
} finally {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    console.warn(`[patch] 临时目录未清理：${work}`);
  }
}
