// 组装 npm 包：把 release 产物与入口文件放进一个 staging 目录，并写 package.json。
// 用法: node scripts/pack-npm.ts --dist <releaseDir> --version <v> [--out <dir>] [--name <pkg>]
import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { optionalString, parseArgs, requireString, runCli, type FlagSpec } from './lib/cli.ts';
import { isMainModule } from './lib/entry.ts';
import { requireDir, requireFile } from './lib/fs-guards.ts';
import { LEAN_PIN } from './pin-lean.ts';

const REPO = resolve(import.meta.dirname, '..');

export interface PackOptions {
  readonly dist: string;
  readonly out: string;
  readonly version: string;
  readonly name: string;
}

export const buildPackageManifest = (options: Pick<PackOptions, 'name' | 'version'>) => ({
  name: options.name,
  version: options.version,
  description: `Lean ${LEAN_PIN.version} as true 64-bit WebAssembly (MEMORY64 + pthreads + GMP)`,
  type: 'module',
  main: './index.mjs',
  exports: { '.': './index.mjs', './lean.mjs': './lean.mjs', './lean.wasm.zst': './lean.wasm.zst' },
  files: ['index.mjs', 'README.md', 'lean.mjs', 'lean.wasm.zst'],
  license: 'Apache-2.0',
  repository: { type: 'git', url: 'https://github.com/3y3y3y-huaiji/lean-init-ide.git' },
  publishConfig: { access: 'public' },
  // node:zlib 的 zstdDecompressSync 从 22.15 起可用。
  engines: { node: '>=22.15' },
});

export const packNpm = (options: PackOptions): { rawBytes: number; zstdBytes: number } => {
  const dist = requireDir(options.dist, 'dist');
  const out = resolve(options.out);
  requireFile(join(dist, 'lean.mjs'), 'lean.mjs');
  requireFile(join(dist, 'lean.wasm'), 'lean.wasm');
  requireFile(join(dist, 'lean.wasm.zst'), 'lean.wasm.zst');
  requireFile(join(REPO, 'npm', 'index.mjs'), 'npm/index.mjs');
  requireFile(join(REPO, 'npm', 'README.md'), 'npm/README.md');

  mkdirSync(out, { recursive: true });
  for (const file of ['lean.mjs', 'lean.wasm.zst']) copyFileSync(join(dist, file), join(out, file));
  for (const file of ['index.mjs', 'README.md'])
    copyFileSync(join(REPO, 'npm', file), join(out, file));
  writeFileSync(
    join(out, 'package.json'),
    `${JSON.stringify(buildPackageManifest(options), null, 2)}\n`,
  );

  return {
    rawBytes: statSync(join(dist, 'lean.wasm')).size,
    zstdBytes: statSync(join(out, 'lean.wasm.zst')).size,
  };
};

const PACK_SPEC: Record<string, FlagSpec> = {
  dist: { kind: 'string', required: true, valueName: 'dir' },
  out: { kind: 'string', valueName: 'dir' },
  version: { kind: 'string', required: true, valueName: 'v' },
  name: { kind: 'string', valueName: 'pkg' },
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), PACK_SPEC);
  const options: PackOptions = {
    dist: requireString(parsed, 'dist'),
    out: optionalString(parsed, 'out') ?? 'work/npm',
    version: requireString(parsed, 'version'),
    name: optionalString(parsed, 'name') ?? process.env.NPM_PACKAGE_NAME ?? 'lean4-wasm64',
  };
  const sizes = packNpm(options);
  console.log(`package ${options.name}@${options.version}`);
  console.log(
    `lean.wasm raw ${(sizes.rawBytes / 1048576).toFixed(1)} MB, zstd ${(sizes.zstdBytes / 1048576).toFixed(1)} MB`,
  );
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
