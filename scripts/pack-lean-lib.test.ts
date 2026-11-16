import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CliError } from './lib/cli.ts';
import { packLibrary } from './pack-lean-lib.ts';

describe('packLibrary', () => {
  it('按分片大小切分并通过 zstd 往返无损还原跨片文件', () => {
    const root = mkdtempSync(join(tmpdir(), 'pack-lean-lib-'));
    const libDir = join(root, 'lib');
    const outDir = join(root, 'out');
    mkdirSync(join(libDir, 'Mathlib', 'Order'), { recursive: true });
    writeFileSync(join(libDir, 'Init.olean'), Buffer.from('0123456789'));
    writeFileSync(join(libDir, 'Mathlib', 'Order', 'Basic.olean'), Buffer.from('abcdefghijkl'));

    const result = packLibrary({
      libDir,
      files: ['Init.olean', 'Mathlib/Order/Basic.olean'],
      outDir,
      prefix: 'lean-test',
      chunkBytes: 12,
    });

    expect(result.files).toBe(2);
    expect(result.rawBytes).toBe(22);
    expect(result.chunks).toHaveLength(2);

    const index = JSON.parse(readFileSync(join(outDir, 'lean-test.index.json'), 'utf8')) as {
      chunks: Array<{ path: string; offset: number; uncompressedBytes: number }>;
      files: Array<{ path: string; offset: number; bytes: number }>;
    };
    expect(index.chunks.map((c) => c.uncompressedBytes)).toEqual([12, 10]);

    const restoredChunks = result.receipts.map((receipt) => {
      const zst = readFileSync(join(outDir, receipt.name));
      expect(createHash('sha256').update(zst).digest('hex')).toBe(receipt.sha256);
      const raw = zstdDecompressSync(zst);
      expect(raw.byteLength).toBe(receipt.uncompressedBytes);
      expect(createHash('sha256').update(raw).digest('hex')).toBe(receipt.uncompressedSha256);
      return raw;
    });
    const full = Buffer.concat(restoredChunks);
    const basicEntry = index.files[1]!;
    expect(
      full.subarray(basicEntry.offset, basicEntry.offset + basicEntry.bytes).toString('utf8'),
    ).toBe('abcdefghijkl');
  });

  it('拒绝空清单或非法 chunkBytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'pack-lean-invalid-'));
    const libDir = join(root, 'lib');
    mkdirSync(libDir);
    expect(() => packLibrary({ libDir, files: [], outDir: join(root, 'out') })).toThrowError(
      CliError,
    );
    expect(() =>
      packLibrary({ libDir, files: ['Init.olean'], outDir: join(root, 'out'), chunkBytes: 0 }),
    ).toThrowError(CliError);
  });
});
