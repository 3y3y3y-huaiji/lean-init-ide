// 生成浏览器用的 olean 清单（默认 Init，可通过 --roots 扩展到 Std/Lean/Mathlib 等包）。
// 用法: node scripts/ci/gen-olean-manifest.ts --lib <libDir> --out <manifest.json> [--roots Init,Mathlib] [--ir]
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { optionalString, parseArgs, requireString, runCli, type FlagSpec } from '../lib/cli.ts';
import { isMainModule } from '../lib/entry.ts';
import { requireDir } from '../lib/fs-guards.ts';
import { LIBRARY_ASSET } from '../lib/lean-assets.ts';

const SHIPPED = /[.](olean|olean[.]server|olean[.]private|ilean)$/;
const SUFFIXES = ['.olean', '.olean.server', '.olean.private', '.ilean'] as const;
const IR_SUFFIXES = ['.ir', '.ir.sig'] as const;

export interface ManifestOptions {
  readonly roots?: readonly string[];
  readonly includeIr?: boolean;
  readonly irRoots?: readonly string[];
}

/** 递归指定模块根目录（默认 Init/），并补上根目录下的 `<Root>.olean` 及其附属文件。 */
export const collectOleanManifest = (libRoot: string, options: ManifestOptions = {}): string[] => {
  const roots = options.roots && options.roots.length > 0 ? options.roots : ['Init'];
  const irRootSet = new Set(options.irRoots ?? []);
  const out = new Set<string>();
  const walk = (dir: string, withIr: boolean): void => {
    const pattern = withIr ? LIBRARY_ASSET : SHIPPED;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, withIr);
      else if (pattern.test(entry.name)) out.add(relative(libRoot, path).split('\\').join('/'));
    }
  };
  for (const root of roots) {
    const withIr = options.includeIr === true || irRootSet.has(root);
    const suffixes = withIr ? [...SUFFIXES, ...IR_SUFFIXES] : SUFFIXES;
    const dir = join(libRoot, root);
    if (existsSync(dir)) walk(dir, withIr);
    for (const suffix of suffixes) {
      const name = `${root}${suffix}`;
      if (existsSync(join(libRoot, name))) out.add(name);
    }
  }
  return [...out].sort();
};

const MANIFEST_SPEC: Record<string, FlagSpec> = {
  lib: { kind: 'string', required: true, valueName: 'dir' },
  out: { kind: 'string', required: true, valueName: 'file' },
  roots: { kind: 'string', valueName: 'Init,Mathlib' },
  'ir-roots': { kind: 'string', valueName: 'Batteries,Mathlib' },
  ir: { kind: 'boolean' },
};

const splitCsv = (raw: string | undefined): string[] | undefined =>
  raw === undefined
    ? undefined
    : raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), MANIFEST_SPEC);
  const libRoot = requireDir(requireString(parsed, 'lib'), 'lib');
  const roots = splitCsv(optionalString(parsed, 'roots'));
  const irRoots = splitCsv(optionalString(parsed, 'ir-roots'));
  const manifest = collectOleanManifest(libRoot, {
    ...(roots === undefined ? {} : { roots }),
    ...(irRoots === undefined ? {} : { irRoots }),
    includeIr: parsed.flags.ir === true,
  });
  if (manifest.length === 0) throw new Error(`没有找到任何 olean: ${libRoot}`);
  writeFileSync(requireString(parsed, 'out'), `${JSON.stringify(manifest)}\n`);
  console.log(`olean files: ${manifest.length}`);
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
