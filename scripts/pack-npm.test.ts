import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from './lib/cli.ts';
import { buildPackageManifest, packNpm } from './pack-npm.ts';
import { LEAN_PIN } from './pin-lean.ts';

describe('buildPackageManifest', () => {
  it('发布字段与 Lean 版本保持同步', () => {
    const manifest = buildPackageManifest({ name: 'lean4-wasm64', version: '1.2.3' });
    expect(manifest.name).toBe('lean4-wasm64');
    expect(manifest.version).toBe('1.2.3');
    expect(manifest.description).toContain(LEAN_PIN.version);
    expect(manifest.description).not.toContain('4.34.1');
    expect(manifest.engines.node).toBe('>=22.15');
    expect(manifest.files).toContain('lean.wasm.zst');
    expect(manifest.publishConfig).toEqual({ access: 'public' });
  });
});

describe('packNpm', () => {
  const makeDist = (): string => {
    const dist = mkdtempSync(join(tmpdir(), 'pack-npm-dist-'));
    writeFileSync(join(dist, 'lean.mjs'), 'export default 1');
    writeFileSync(join(dist, 'lean.wasm'), Buffer.alloc(2048));
    writeFileSync(join(dist, 'lean.wasm.zst'), Buffer.alloc(256));
    return dist;
  };

  it('复制产物并写 package.json', () => {
    const dist = makeDist();
    const out = join(mkdtempSync(join(tmpdir(), 'pack-npm-out-')), 'pkg');
    const sizes = packNpm({ dist, out, version: '0.0.0-test', name: 'lean4-wasm64' });
    expect(sizes).toEqual({ rawBytes: 2048, zstdBytes: 256 });
    const manifest = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
    expect(manifest.version).toBe('0.0.0-test');
    for (const file of ['lean.mjs', 'lean.wasm.zst', 'index.mjs', 'README.md', 'package.json']) {
      expect(existsSync(join(out, file)), file).toBe(true);
    }
  });

  it('dist 缺文件时报错，不生成半成品', () => {
    const dist = mkdtempSync(join(tmpdir(), 'pack-npm-missing-'));
    mkdirSync(dist, { recursive: true });
    expect(() => packNpm({ dist, out: join(dist, 'out'), version: '1', name: 'x' })).toThrowError(
      CliError,
    );
  });
});
