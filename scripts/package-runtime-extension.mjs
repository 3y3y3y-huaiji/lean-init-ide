#!/usr/bin/env node
/**
 * 把扩展库（Std / Batteries）的 wasm32 oleans 打成独立 pack。
 *
 * 格式与 wasm-llvm 的 lean-init-*.pack 一致，但只收录指定模块前缀：
 * - <name>-00.pack.gz, ...
 * - <name>.index.json（root=/lean/lib/lean、chunks、files）
 *
 * 客户端可以在 Init 启动之后按需下载、挂载和释放这些 pack。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { constants, gzipSync } from 'node:zlib';

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

const oleanDir = path.resolve(args.get('oleans') ?? 'work/olean32');
const outDir = path.resolve(args.get('out') ?? 'work/extensions');
const prefix = (args.get('prefix') ?? 'Std').replace(/^\/+|\/+$/g, '');
const name = args.get('name') ?? `lean-${prefix.toLowerCase()}`;
const chunkBytes = Number(args.get('chunk-bytes') ?? 48 * 1024 * 1024);
const extensions = ['.olean', '.olean.server', '.olean.private', '.ir', '.ir.sig'];
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

const walk = (root, relative = '') => {
  const out = [];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
};

const underPrefix = (file) => file === prefix || file.startsWith(`${prefix}/`);
const files = walk(oleanDir)
  .filter((file) => underPrefix(file) && extensions.some((ext) => file.endsWith(ext)))
  .sort();
const modules = files.filter((file) => file.endsWith('.olean'));
if (modules.length === 0) {
  throw new Error(`${oleanDir} 下没有 ${prefix} 的 .olean`);
}
for (const module of modules) {
  if (!files.includes(module.replace(/\.olean$/, '.ir'))) {
    throw new Error(`${module} 缺少对应的 .ir`);
  }
}

const entries = [];
const parts = [];
let offset = 0;
for (const file of files) {
  const bytes = readFileSync(path.join(oleanDir, file));
  entries.push({ path: file, offset, bytes: bytes.length });
  parts.push(bytes);
  offset += bytes.length;
}
const pack = Buffer.concat(parts, offset);

mkdirSync(outDir, { recursive: true });
const chunks = [];
for (let start = 0, index = 0; start < pack.length; start += chunkBytes, index += 1) {
  const raw = pack.subarray(start, Math.min(pack.length, start + chunkBytes));
  const chunkName = `${name}-${String(index).padStart(2, '0')}.pack.gz`;
  const compressed = gzipSync(raw, { level: constants.Z_BEST_COMPRESSION });
  writeFileSync(path.join(outDir, chunkName), compressed);
  chunks.push({
    path: chunkName,
    offset: start,
    uncompressedBytes: raw.length,
    uncompressedSha256: sha256(raw),
    bytes: compressed.length,
    sha256: sha256(compressed),
  });
}

const index = {
  schemaVersion: 1,
  root: '/lean/lib/lean',
  modules: modules.length,
  totalBytes: pack.length,
  sha256: sha256(pack),
  chunks,
  files: entries,
};
const indexBytes = Buffer.from(`${JSON.stringify(index, null, '\t')}\n`);
writeFileSync(path.join(outDir, `${name}.index.json`), indexBytes);

const sums = [`${sha256(indexBytes)}  ${name}.index.json`];
for (const chunk of chunks) sums.push(`${chunk.sha256}  ${chunk.path}`);
writeFileSync(path.join(outDir, 'SHA256SUMS'), `${sums.join('\n')}\n`);

console.log(
  `${name}: ${modules.length} modules, ${(pack.length / 1024 / 1024).toFixed(2)} MiB raw, ` +
    `${chunks.length} chunks, ${(indexBytes.length / 1024).toFixed(1)} KiB index`,
);
