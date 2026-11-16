// 生成浏览器用的 Init olean 清单（原来是一段内联 `node -e`）。
// 用法: node scripts/ci/gen-olean-manifest.ts --lib <libDir> --out <manifest.json>
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs, requireString, runCli, type FlagSpec } from '../lib/cli.ts';
import { isMainModule } from '../lib/entry.ts';
import { requireDir } from '../lib/fs-guards.ts';

const SHIPPED = /[.](olean|olean[.]server|olean[.]private|ilean)$/;

/** 递归 Init/ 子目录，并补上根目录下的 Init.olean 及其附属文件。 */
export const collectOleanManifest = (libRoot: string): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (SHIPPED.test(entry.name)) out.push(relative(libRoot, path).split('\\').join('/'));
    }
  };
  const initDir = join(libRoot, 'Init');
  if (existsSync(initDir)) walk(initDir);
  for (const name of ['Init.olean', 'Init.olean.server', 'Init.olean.private', 'Init.ilean']) {
    if (existsSync(join(libRoot, name))) out.push(name);
  }
  return out.sort();
};

const MANIFEST_SPEC: Record<string, FlagSpec> = {
  lib: { kind: 'string', required: true, valueName: 'dir' },
  out: { kind: 'string', required: true, valueName: 'file' },
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), MANIFEST_SPEC);
  const libRoot = requireDir(requireString(parsed, 'lib'), 'lib');
  const manifest = collectOleanManifest(libRoot);
  if (manifest.length === 0) throw new Error(`没有找到任何 olean: ${libRoot}`);
  writeFileSync(requireString(parsed, 'out'), `${JSON.stringify(manifest)}\n`);
  console.log(`olean files: ${manifest.length}`);
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
