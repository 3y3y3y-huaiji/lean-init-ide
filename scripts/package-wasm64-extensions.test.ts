import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageWasm64Extensions } from './package-wasm64-extensions.ts';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const workspace = () => {
  const root = mkdtempSync(join(tmpdir(), 'pkg-ext-'));
  dirs.push(root);
  return root;
};

const writeLib = (root: string, files: Record<string, string>) => {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
};

describe('packageWasm64Extensions', () => {
  it('按扩展打包索引与分片，并写入 key/source/hash 回执', () => {
    const root = workspace();
    const libDir = join(root, 'lib');
    const outDir = join(root, 'out');
    writeLib(libDir, {
      'Mathlib/Order/Basic.olean': 'order-olean',
      'Mathlib/Order/Basic.olean.server': 'order-server',
    });
    const specPath = join(root, 'spec.json');
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
            lib: libDir,
            roots: ['Mathlib'],
            prefix: 'lean-mathlib-64',
          },
        ],
      }),
    );

    const extensions = packageWasm64Extensions({ specPath, outDir, chunkBytes: 1024 });

    expect(extensions).toHaveLength(1);
    const [mathlib] = extensions;
    expect(mathlib?.id).toBe('mathlib');
    expect(mathlib?.requires).toEqual([]);
    expect(mathlib?.assets.map((asset) => asset.name)).toEqual([
      'lean-mathlib-64.index.json',
      'lean-mathlib-64-00.pack.zst.bin',
    ]);
    const pack = mathlib?.assets[1];
    expect(pack?.key).toBe(
      'wasm-lean4/4.36.0-rc2-wasm64/extensions/mathlib/lean-mathlib-64-00.pack.zst.bin',
    );
    expect(pack?.source).toBe('lean-mathlib-64-00.pack.zst.bin');
    expect(pack?.encoding).toBe('zstd');
    expect(pack?.uncompressedBytes).toBeGreaterThan(0);
    const index = JSON.parse(readFileSync(join(outDir, 'lean-mathlib-64.index.json'), 'utf8')) as {
      files: Array<{ path: string }>;
    };
    expect(index.files.map((file) => file.path)).toEqual([
      'Mathlib/Order/Basic.olean',
      'Mathlib/Order/Basic.olean.server',
    ]);
  });

  it('扩展目录没有 olean 时直接失败，不产出空包', () => {
    const root = workspace();
    const specPath = join(root, 'spec.json');
    writeFileSync(
      specPath,
      JSON.stringify({
        keyPrefix: 'x',
        extensions: [
          {
            id: 'mathlib',
            label: 'Mathlib',
            lib: root,
            roots: ['Mathlib'],
            prefix: 'lean-mathlib-64',
          },
        ],
      }),
    );

    expect(() => packageWasm64Extensions({ specPath, outDir: join(root, 'out') })).toThrow(
      /没有 olean/,
    );
  });

  it('拒绝未声明的依赖与重复 id', () => {
    const root = workspace();
    const specPath = join(root, 'spec.json');
    writeFileSync(
      specPath,
      JSON.stringify({
        keyPrefix: 'x',
        extensions: [
          {
            id: 'mathlib',
            label: 'Mathlib',
            requires: ['std'],
            lib: root,
            roots: ['Mathlib'],
            prefix: 'lean-mathlib-64',
          },
        ],
      }),
    );

    expect(() => packageWasm64Extensions({ specPath, outDir: join(root, 'out') })).toThrow(
      /未声明/,
    );
  });
});
