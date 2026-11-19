// 解析引导包目录，替代 `ls -d work/lean-*-linux | head -n 1`（目录名按字典序会取错版本）。
// 用法: node scripts/ci/boot-dir.ts [repoRoot]
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs, runCli } from '../lib/cli.ts';
import { isMainModule } from '../lib/entry.ts';
import { requireFile } from '../lib/fs-guards.ts';

interface ProducerManifest {
  readonly sources?: { readonly lean4?: { readonly version?: string } };
}

export const resolveBootDir = (repoRoot: string): string => {
  const root = resolve(repoRoot);
  const manifestPath = requireFile(
    join(root, 'wasm-llvm', 'producer', 'lean-browser', 'manifest.json'),
    'producer manifest',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ProducerManifest;
  const version = manifest.sources?.lean4?.version;
  if (!version) throw new Error('manifest 缺少 sources.lean4.version');
  const bootDir = join(root, 'work', `lean-${version}-linux`);
  const stat = statSync(bootDir, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) throw new Error(`引导包目录不存在: ${bootDir}`);
  return bootDir;
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), {});
  if (parsed.positionals.length > 1) {
    throw new Error('用法: node scripts/ci/boot-dir.ts [repoRoot]');
  }
  const root = parsed.positionals[0] ?? process.cwd();
  process.stdout.write(`${resolveBootDir(root)}\n`);
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
