// 从 Lake 缓存工作区收集官方预编译 64 位库产物（.olean / .olean.server / .olean.private / .ilean / .ir / .ir.sig），
// 叠加到官方引导 olean（Init / Std / Lean）上，直接交给 wasm64 编译器与 LSP 验证兼容性。
//
// 用法：
//   node scripts/ci/collect-lake-libs.ts --base work/olean32 --lake work/mathlib/mathlib4 --out work/mathlib-official-lib
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parseArgs, requireString, runCli, type FlagSpec } from '../lib/cli.ts';
import { isMainModule } from '../lib/entry.ts';
import { requireDir } from '../lib/fs-guards.ts';
import { walkLibrary } from '../lib/lean-assets.ts';

export interface CollectLakeResult {
  readonly packageLibDirs: number;
  readonly copiedFiles: number;
}

const findLakeLibDirs = (lakeRoot: string): string[] => {
  const dirs: string[] = [];
  const mainLib = join(lakeRoot, '.lake', 'build', 'lib', 'lean');
  if (existsSync(mainLib)) dirs.push(mainLib);
  const packagesDir = join(lakeRoot, '.lake', 'packages');
  if (!existsSync(packagesDir)) return dirs;
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const pkgLib = join(packagesDir, entry.name, '.lake', 'build', 'lib', 'lean');
    if (existsSync(pkgLib)) dirs.push(pkgLib);
  }
  return dirs.sort();
};

export const collectLakeLibs = (
  baseDir: string,
  lakeDir: string,
  outDir: string,
  log: (message: string) => void = console.log,
): CollectLakeResult => {
  const resolvedBase = requireDir(baseDir, 'base');
  const resolvedLake = requireDir(lakeDir, 'lake');
  mkdirSync(outDir, { recursive: true });
  if (resolvedBase !== outDir) {
    cpSync(resolvedBase, outDir, { recursive: true, force: true });
  }
  const libDirs = findLakeLibDirs(resolvedLake);
  let copiedFiles = 0;
  for (const libDir of libDirs) {
    const files = walkLibrary(libDir);
    for (const file of files) {
      const rel = relative(libDir, file);
      const dest = join(outDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(file, dest, { force: true });
      copiedFiles += 1;
    }
    log(`lake lib ${relative(resolvedLake, libDir)}: ${files.length} files`);
  }
  return { packageLibDirs: libDirs.length, copiedFiles };
};

const SPEC: Record<string, FlagSpec> = {
  base: { kind: 'string', required: true, valueName: 'oleanDir' },
  lake: { kind: 'string', required: true, valueName: 'mathlibDir' },
  out: { kind: 'string', required: true, valueName: 'outDir' },
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), SPEC);
  const result = collectLakeLibs(
    requireString(parsed, 'base'),
    requireString(parsed, 'lake'),
    requireString(parsed, 'out'),
  );
  if (result.copiedFiles === 0) {
    throw new Error('没有从 Lake 缓存里收集到任何 .olean/.ir 文件');
  }
  console.log(`collected ${result.copiedFiles} files from ${result.packageLibDirs} lake lib dirs`);
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
