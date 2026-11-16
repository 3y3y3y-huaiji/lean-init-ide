import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, zstdDecompressSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = 'scripts/package-runtime-assets.mjs';
let work;
let artifact;

const run = () =>
  execFileSync(
    process.execPath,
    [
      script,
      `--artifact=${artifact}`,
      '--lean-version=9.9.9',
      '--revision=abc123',
      '--key-prefix=wasm-lean4/9.9.9',
      '--mirror-prefix=wasm-lean4/9.9.9',
      '--fallback-base=https://example.com/releases/download/runtime-v9.9.9/',
      `--manifest-out=${join(artifact, 'runtime-manifest.json')}`,
    ],
    { cwd: process.cwd(), stdio: 'pipe' },
  );

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'lean-package-test-'));
  artifact = join(work, 'artifact');
  mkdirSync(artifact);
  writeFileSync(join(artifact, 'lean.wasm.gz'), gzipSync(Buffer.from('wasm-bytes')));
  writeFileSync(join(artifact, 'lean-init-00.pack.gz'), gzipSync(Buffer.from('pack-0')));
  writeFileSync(join(artifact, 'lean.mjs'), 'export {};');
  writeFileSync(join(artifact, 'lean-init.index.json'), '{"modules":[]}');
  writeFileSync(join(artifact, 'producer-receipt.json'), '{"schemaVersion":1}');
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true, maxRetries: 3 });
});

describe('package-runtime-assets', () => {
  it('creates zstd assets, a candidate manifest and checksums', () => {
    run();

    const manifest = JSON.parse(readFileSync(join(artifact, 'runtime-manifest.json'), 'utf8'));
    expect(manifest.runtime).toBe('Lean 9.9.9 Init');
    expect(manifest.cacheKey).toMatch(/^z[0-9a-f]{8}$/);
    expect(manifest.assets).toHaveLength(6);

    const byName = (name) => manifest.assets.find((asset) => asset.name === name);
    const wasm = byName('lean.wasm.gz.bin');
    const runner = byName('runner-worker.js');
    if (!wasm || !runner) throw new Error('manifest missing expected asset');

    expect(wasm).toMatchObject({
      key: 'wasm-lean4/9.9.9/lean.wasm.gz.bin',
      source: 'lean.wasm.gz',
      encoding: 'zstd',
      ranged: true,
      contentType: 'application/octet-stream',
    });
    expect(zstdDecompressSync(readFileSync(join(artifact, 'lean.wasm.gz.bin'))).toString()).toBe(
      'wasm-bytes',
    );
    expect(runner.local).toBe('scripts/assets/runner-worker.js');

    const sums = readFileSync(join(artifact, 'SHA256SUMS'), 'utf8').trim().split('\n');
    expect(sums).toHaveLength(6);
    for (const asset of manifest.assets) {
      expect(sums.some((line) => line.endsWith(`  ${asset.name}`))).toBe(true);
    }
  });

  it('fails when a required asset is missing', () => {
    rmSync(join(artifact, 'lean.mjs'));

    let error;
    try {
      run();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeTruthy();
    expect(String(error?.stderr ?? error?.message ?? '')).toContain('lean.mjs');
  });
});
