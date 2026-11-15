// 把 wasm-llvm 的 lean-browser producer 从 4.34.1 切到 mathlib4 当前工具链（v4.36.0-rc2）。
//
// 用法: node scripts/pin-lean.mjs <repoRoot>
//
// 做两件事：
// 1. 改写 manifest.json 的 Lean 版本 / commit / 引导包 URL 与 sha256
// 2. 从 producer 补丁里裁掉 4.36 已包含的 event_loop.cpp（alive 已改回 uint8_t），并更新补丁的 sha256
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) throw new Error('usage: pin-lean.mjs <repoRoot>');

const VERSION = '4.36.0-rc2';
const COMMIT = 'b35cb10cf2ced51a2fd1880cfdbf75c71ab7a35a';
const BOOTSTRAP = `https://github.com/leanprover/lean4/releases/download/v${VERSION}/lean-${VERSION}-linux.tar.zst`;
const BOOTSTRAP_SHA = '0a0a3208617e9eab92f1041efa83ad94d405e69d172fb654a62dbfa9fbc5313b';

const producer = join(ROOT, 'wasm-llvm', 'producer', 'lean-browser');
const manifestPath = join(producer, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

manifest.sources.lean4.version = VERSION;
manifest.sources.lean4.commit = COMMIT;
manifest.bootstrap.url = BOOTSTRAP;
manifest.bootstrap.sha256 = BOOTSTRAP_SHA;

// 4.36 的 event_loop.cpp 已经把 alive 改成返回 uint8_t（补丁原本就在做这件事），
// 整段应用会冲突，直接裁掉。
const patchEntry = manifest.patches[0];
const patchPath = join(producer, patchEntry.path);
const source = readFileSync(patchPath, 'utf8');
const sections = source.split(/^(?=diff --git )/m);
const kept = sections.filter((section) => !section.startsWith('diff --git a/src/runtime/uv/event_loop.cpp b/'));
if (kept.length === sections.length) {
  console.log('补丁里没有 event_loop.cpp，保持原样');
} else {
  const patch = kept.join('');
  writeFileSync(patchPath, patch);
  patchEntry.sha256 = createHash('sha256').update(patch).digest('hex');
  console.log(`裁剪 event_loop.cpp：${sections.length} -> ${kept.length} 段`);
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`pinned Lean ${VERSION} @ ${COMMIT.slice(0, 8)}, bootstrap ${BOOTSTRAP_SHA.slice(0, 12)}`);
