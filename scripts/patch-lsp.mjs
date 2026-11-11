import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @wasm-idle/lsp 1.3.0 hard-codes Lean asset downloads to 3 concurrent requests.
 * The 143 MB Init payload is dominated by six ~22 MB packs; raising the limit to 6
 * gives the browser more parallel connections without unbounded memory pressure.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'node_modules', '@wasm-idle', 'lsp', 'dist', 'lean4', 'assets.js');
const from = 'maxConcurrentDownloads: 3';
const to = 'maxConcurrentDownloads: 6';

const source = readFileSync(target, 'utf8');
if (source.includes(to)) {
  console.log('lsp patch: already applied');
} else if (!source.includes(from)) {
  throw new Error(
    `lsp patch: expected "${from}" in ${target}. The package version changed; update the patch.`,
  );
} else {
  writeFileSync(target, source.replace(from, to));
  console.log('lsp patch: maxConcurrentDownloads 3 -> 6');
}

/**
 * The package hard-codes the runner worker's byte count and SHA-256, and uses that
 * hash as the worker URL's ?v= cache key. We ship a memory-optimised worker, so
 * recompute the receipt from our source on every install. Keeping this in sync is
 * what makes the new worker URL differ from the old one without touching the
 * global cacheKey (which would force a 143 MB re-download for every visitor).
 */
const workerPath = path.join(root, 'scripts', 'assets', 'runner-worker.js');
const workerBytes = readFileSync(workerPath);
const workerSha = createHash('sha256').update(workerBytes).digest('hex');
const runtimePath = path.join(root, 'node_modules', '@wasm-idle', 'lsp', 'dist', 'bundledLean4Runtime.js');
const runtimeSource = readFileSync(runtimePath, 'utf8');
const receipt = /(workerReceipt:\s*\{\s*bytes:\s*)\d+(,\s*sha256:\s*')[a-f0-9]+(')/;
if (!receipt.test(runtimeSource)) {
  throw new Error('lsp patch: workerReceipt shape changed; update the patch.');
}
const nextRuntime = runtimeSource.replace(
  receipt,
  (_match, prefix, middle, suffix) => `${prefix}${workerBytes.length}${middle}${workerSha}${suffix}`,
);
if (nextRuntime !== runtimeSource) {
  writeFileSync(runtimePath, nextRuntime);
  console.log(`lsp patch: workerReceipt -> ${workerBytes.length} bytes / ${workerSha.slice(0, 12)}…`);
} else {
  console.log('lsp patch: workerReceipt already synced');
}
