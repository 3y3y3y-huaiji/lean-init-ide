// 把 wasm-llvm 的 lean-browser producer 跟到 mathlib4 当前工具链（v4.36.0-rc2）。
//
// 用法: node scripts/pin-lean.ts <repoRoot>
//
// 做两件事：
// 1. 改写 manifest.json 的 Lean 版本 / commit / 引导包 URL 与 sha256
// 2. 从 producer 补丁里裁掉 4.36 已包含的 event_loop.cpp，并更新补丁的 sha256
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectPositionals, parseArgs, runCli } from './lib/cli.ts';
import { isMainModule } from './lib/entry.ts';
import { requireDir, requireFile } from './lib/fs-guards.ts';

export interface LeanPin {
  readonly version: string;
  readonly commit: string;
  readonly bootstrapUrl: string;
  readonly bootstrapSha256: string;
}

export const LEAN_PIN: LeanPin = {
  version: '4.36.0-rc2',
  commit: 'b35cb10cf2ced51a2fd1880cfdbf75c71ab7a35a',
  bootstrapUrl:
    'https://github.com/leanprover/lean4/releases/download/v4.36.0-rc2/lean-4.36.0-rc2-linux.tar.zst',
  bootstrapSha256: '0a0a3208617e9eab92f1041efa83ad94d405e69d172fb654a62dbfa9fbc5313b',
};

export interface PinResult {
  readonly cropped: boolean;
  readonly sectionsBefore: number;
  readonly sectionsAfter: number;
}

interface ProducerManifest {
  sources: { lean4: { version: string; commit: string } };
  bootstrap: { url: string; sha256: string };
  patches: Array<{ path: string; sha256: string }>;
}

export const cropEventLoopPatch = (
  source: string,
): { patch: string; before: number; after: number } => {
  const sections = source.split(/^(?=diff --git )/m);
  const kept = sections.filter(
    (section) => !section.startsWith('diff --git a/src/runtime/uv/event_loop.cpp b/'),
  );
  return { patch: kept.join(''), before: sections.length, after: kept.length };
};

export const pinLean = (root: string, pin: LeanPin = LEAN_PIN): PinResult => {
  const repoRoot = requireDir(root, 'repoRoot');
  const producer = requireDir(
    join(repoRoot, 'wasm-llvm', 'producer', 'lean-browser'),
    'wasm-llvm producer',
  );
  const manifestPath = requireFile(join(producer, 'manifest.json'), 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ProducerManifest;
  const patchEntry = manifest.patches[0];
  if (!patchEntry) throw new Error('manifest.patches 为空');
  const patchPath = requireFile(join(producer, patchEntry.path), 'producer patch');

  manifest.sources.lean4.version = pin.version;
  manifest.sources.lean4.commit = pin.commit;
  manifest.bootstrap.url = pin.bootstrapUrl;
  manifest.bootstrap.sha256 = pin.bootstrapSha256;

  const source = readFileSync(patchPath, 'utf8');
  const { patch, before, after } = cropEventLoopPatch(source);
  const cropped = after !== before;
  if (cropped) {
    writeFileSync(patchPath, patch);
    patchEntry.sha256 = createHash('sha256').update(patch).digest('hex');
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { cropped, sectionsBefore: before, sectionsAfter: after };
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), {});
  const [root] = expectPositionals(parsed, 1, 'node scripts/pin-lean.ts <repoRoot>');
  const result = pinLean(root ?? '');
  console.log(
    result.cropped
      ? `裁剪 event_loop.cpp：${result.sectionsBefore} -> ${result.sectionsAfter} 段`
      : '补丁里没有 event_loop.cpp，保持原样',
  );
  console.log(
    `pinned Lean ${LEAN_PIN.version} @ ${LEAN_PIN.commit.slice(0, 8)}, bootstrap ${LEAN_PIN.bootstrapSha256.slice(0, 12)}`,
  );
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
