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

/**
 * 解析实际使用的 pin：默认取 `LEAN_PIN`，允许用 `LEAN_PIN_*` 环境变量整体覆盖。
 *
 * 覆盖只用于本地试验另一版 Lean；CI 的缓存键绑定 `hashFiles('scripts/pin-lean.ts')`，
 * 正式升级必须改 `LEAN_PIN` 并让缓存失效，否则会混用旧产物。
 */
export const resolveLeanPin = (env: NodeJS.ProcessEnv = process.env): LeanPin => {
  const overrides = {
    version: env.LEAN_PIN_VERSION,
    commit: env.LEAN_PIN_COMMIT,
    bootstrapUrl: env.LEAN_PIN_BOOTSTRAP_URL,
    bootstrapSha256: env.LEAN_PIN_BOOTSTRAP_SHA256,
  };
  const provided = Object.values(overrides).filter((value) => value !== undefined && value !== '');
  if (provided.length === 0) return LEAN_PIN;
  if (provided.length !== 4) {
    throw new Error(
      'LEAN_PIN_* 覆盖必须同时提供 LEAN_PIN_VERSION / LEAN_PIN_COMMIT / ' +
        'LEAN_PIN_BOOTSTRAP_URL / LEAN_PIN_BOOTSTRAP_SHA256',
    );
  }
  return {
    version: overrides.version as string,
    commit: overrides.commit as string,
    bootstrapUrl: overrides.bootstrapUrl as string,
    bootstrapSha256: overrides.bootstrapSha256 as string,
  };
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

export const pinLean = (root: string, pin: LeanPin = resolveLeanPin()): PinResult => {
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
  const pin = resolveLeanPin();
  const result = pinLean(root ?? '', pin);
  console.log(
    result.cropped
      ? `裁剪 event_loop.cpp：${result.sectionsBefore} -> ${result.sectionsAfter} 段`
      : '补丁里没有 event_loop.cpp，保持原样',
  );
  console.log(
    `pinned Lean ${pin.version} @ ${pin.commit.slice(0, 8)}, bootstrap ${pin.bootstrapSha256.slice(0, 12)}`,
  );
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
