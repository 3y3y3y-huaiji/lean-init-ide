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
