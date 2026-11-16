#!/usr/bin/env node
/**
 * 从构建产物目录生成 config/lean4-runtime.json 的 extensions 段。
 *
 * 用法：
 *   node scripts/write-extension-manifest.mjs --std work/extensions/std --batteries work/extensions/batteries
 *
 * 每个目录里应包含 <name>.index.json 与若干 <name>-NN.pack.gz.bin。脚本按文件
 * 实际字节计算 SHA-256，写回清单的 extensions，供上传脚本与客户端共用。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'config/lean4-runtime.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

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
const dirOf = (name) => args.get(name) ?? process.env[`LEAN_${name.toUpperCase()}_DIR`] ?? '';

const version = /(\d+\.\d+\.\d+)/.exec(manifest.mirror?.prefix ?? manifest.runtime ?? '')?.[1];
if (!version) throw new Error('无法从 mirror.prefix / runtime 推导 Lean 版本');
const keyPrefix = `wasm-lean4/${version}/extensions`;
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const buildExtension = ({ id, label, prefix, requires, dir }) => {
  if (!dir) throw new Error(`缺少 --${id} 目录`);
  if (!existsSync(dir)) throw new Error(`${dir} 不存在`);
  const names = readdirSync(dir).filter(
    (name) => name.endsWith('.index.json') || name.endsWith('.pack.gz.bin'),
  );
  if (!names.some((name) => name.endsWith('.index.json'))) {
    throw new Error(`${dir} 里没有 .index.json`);
  }
  const assets = names.sort().map((name) => ({
    name,
    key: `${keyPrefix}/${id}/${name}`,
    bytes: readFileSync(path.join(dir, name)).length,
    sha256: sha256(path.join(dir, name)),
    contentType: name.endsWith('.json') ? 'application/json' : 'application/octet-stream',
  }));
  return { id, label, prefix, requires, assets };
};

manifest.extensions = [
  buildExtension({
    id: 'std',
    label: 'Std',
    prefix: 'Std',
    requires: [],
    dir: dirOf('std'),
  }),
  buildExtension({
    id: 'batteries',
    label: 'Batteries',
    prefix: 'Batteries',
    requires: ['std'],
    dir: dirOf('batteries'),
  }),
];

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
for (const extension of manifest.extensions) {
  console.log(
    `${extension.id}: ${extension.assets.length} assets, ` +
      `${(extension.assets.reduce((sum, asset) => sum + asset.bytes, 0) / 1024 ** 2).toFixed(2)} MiB`,
  );
  for (const asset of extension.assets) {
    console.log(`  ${asset.key} ${asset.bytes} ${asset.sha256.slice(0, 12)}`);
  }
}
