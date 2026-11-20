import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageWasm64Extensions } from './package-wasm64-extensions.ts';
import { packageWasm64Runtime } from './package-wasm64-runtime.ts';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('packageWasm64Runtime', () => {
  it('产出实验性 wasm64 清单、SHA256SUMS 与校验后的分片资源', () => {
    const root = mkdtempSync(join(tmpdir(), 'pkg-w64-'));
    dirs.push(root);

    const gluePath = join(root, 'lean-lsp-adapted.mjs');
    const wasmPath = join(root, 'lean-lsp.wasm');
    const wasmZstPath = join(root, 'lean-lsp.wasm.zst');
    const libDir = join(root, 'lib');
    const outDir = join(root, 'out');

    mkdirSync(join(libDir, 'Init'), { recursive: true });
    writeFileSync(gluePath, 'export default function createLean() {}\n');
    writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
    writeFileSync(wasmZstPath, Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x01, 0x02]));
    writeFileSync(join(libDir, 'Init.olean'), 'init-olean');
    writeFileSync(join(libDir, 'Init', 'Core.olean'), 'core-olean');

    const manifest = packageWasm64Runtime({
      gluePath,
      wasmPath,
      wasmZstPath,
      libDir,
      outDir,
      level: 1,
      chunkBytes: 16,
    });

    expect(manifest.experimental).toBe(true);
    expect(manifest.arch).toBe('wasm64');
    expect(manifest.cacheKey).toMatch(/^w64-[0-9a-f]{8}$/);
    expect(manifest.mirror).toEqual({
      label: '魔搭镜像（国内）',
      baseUrl: 'https://modelscope.cn/datasets/HQZMSu/lean4-assets/resolve/master/',
      prefix: 'wasm-lean4/4.36.0-rc2-wasm64',
    });
    expect(manifest.assets.map((a) => a.name)).toEqual([
      'lean-lsp-adapted.mjs',
      'lean-lsp.wasm.zst',
      'lean-init-64.index.json',
      'lean-init-64-00.pack.zst.bin',
      'lean-init-64-01.pack.zst.bin',
    ]);

    const wasmEntry = manifest.assets.find((a) => a.name === 'lean-lsp.wasm.zst');
    expect(wasmEntry?.uncompressedBytes).toBe(8);
    expect(wasmEntry?.ranged).toBe(true);
    expect(wasmEntry?.encoding).toBe('zstd');

    const sums = readFileSync(join(outDir, 'SHA256SUMS'), 'utf8');
    expect(sums).toContain('lean-lsp.wasm.zst');
    expect(sums).toContain('lean-init-64.index.json');
  });
  it('合并扩展清单：复制扩展资产、校验哈希，且不改变基础包 cacheKey', () => {
    const root = mkdtempSync(join(tmpdir(), 'pkg-w64-ext-'));
    dirs.push(root);

    const gluePath = join(root, 'lean-lsp-adapted.mjs');
    const wasmPath = join(root, 'lean-lsp.wasm');
    const wasmZstPath = join(root, 'lean-lsp.wasm.zst');
    const libDir = join(root, 'lib');
    const mathlibLib = join(root, 'mathlib-lib');
    const outDir = join(root, 'out');
    const extDir = join(root, 'ext');

    mkdirSync(join(libDir, 'Init'), { recursive: true });
    mkdirSync(join(mathlibLib, 'Mathlib', 'Order'), { recursive: true });
    writeFileSync(gluePath, 'export default function createLean() {}\n');
    writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
    writeFileSync(wasmZstPath, Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x01, 0x02]));
    writeFileSync(join(libDir, 'Init.olean'), 'init-olean');
    writeFileSync(join(mathlibLib, 'Mathlib', 'Order', 'Basic.olean'), 'mathlib-olean');

    const specPath = join(extDir, 'spec.json');
    mkdirSync(extDir, { recursive: true });
    writeFileSync(
      specPath,
      JSON.stringify({
        keyPrefix: 'wasm-lean4/4.36.0-rc2-wasm64/extensions',
        level: 1,
        extensions: [
          {
            id: 'mathlib',
            label: 'Mathlib 教学子集',
            requires: [],
            lib: mathlibLib,
            roots: ['Mathlib'],
            prefix: 'lean-mathlib-64',
          },
        ],
      }),
    );
    packageWasm64Extensions({ specPath, outDir: extDir, chunkBytes: 8 });

    const base = {
      gluePath,
      wasmPath,
      wasmZstPath,
      libDir,
      outDir,
      level: 1 as const,
      chunkBytes: 16,
    };
    const plain = packageWasm64Runtime(base);
    const withExtensions = packageWasm64Runtime({
      ...base,
      extensionsPath: join(extDir, 'extensions.json'),
      extensionsDir: extDir,
    });

    expect(withExtensions.cacheKey).toBe(plain.cacheKey);
    expect(withExtensions.extensions?.[0]?.id).toBe('mathlib');
    expect(readFileSync(join(outDir, 'lean-mathlib-64.index.json'), 'utf8')).toContain('Mathlib');
    const sums = readFileSync(join(outDir, 'SHA256SUMS'), 'utf8');
    expect(sums).toContain('lean-mathlib-64-00.pack.zst.bin');
  });
});
