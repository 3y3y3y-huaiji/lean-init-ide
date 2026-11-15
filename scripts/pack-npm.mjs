// 组装 npm 包：把 release 产物与入口文件放进一个 staging 目录，并写 package.json。
// 用法: node scripts/pack-npm.mjs --dist <releaseDir> --out <dir> --version <v> [--name <pkg>]
import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const dist = resolve(option('dist', 'work/release'));
const out = resolve(option('out', 'work/npm'));
const version = option('version', '0.0.0-dev');
const name = option('name', process.env.NPM_PACKAGE_NAME || 'lean4-wasm64');

mkdirSync(out, { recursive: true });
for (const file of ['lean.mjs', 'lean.wasm']) {
  copyFileSync(join(dist, file), join(out, file));
}
for (const file of ['index.mjs', 'README.md']) {
  copyFileSync(join(REPO, 'npm', file), join(out, file));
}

writeFileSync(
  join(out, 'package.json'),
  `${JSON.stringify(
    {
      name,
      version,
      description: 'Lean 4.34.1 as true 64-bit WebAssembly (MEMORY64 + pthreads + GMP)',
      type: 'module',
      main: './index.mjs',
      exports: { '.': './index.mjs', './lean.mjs': './lean.mjs', './lean.wasm': './lean.wasm' },
      files: ['index.mjs', 'README.md', 'lean.mjs', 'lean.wasm'],
      license: 'Apache-2.0',
      repository: { type: 'git', url: 'https://github.com/3y3y3y-huaiji/lean-init-ide.git' },
      publishConfig: { access: 'public' },
      engines: { node: '>=20' },
    },
    null,
    2
  )}\n`
);

const wasm = statSync(join(out, 'lean.wasm')).size;
const gz = gzipSync(readFileSync(join(out, 'lean.wasm')), { level: 9 }).length;
console.log(`package ${name}@${version}`);
console.log(`lean.wasm raw ${(wasm / 1048576).toFixed(1)} MB, gzip ${(gz / 1048576).toFixed(1)} MB`);
