import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = 'scripts/package-runtime-extension.mjs';
let work;
let oleanDir;
let outDir;

const run = () =>
  execFileSync(
    process.execPath,
    [
      script,
      `--oleans=${oleanDir}`,
      '--prefix=Std',
      '--name=lean-std',
      `--out=${outDir}`,
      '--chunk-bytes=16',
    ],
    { cwd: process.cwd(), stdio: 'pipe' },
  );

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'lean-extension-pack-'));
  oleanDir = join(work, 'oleans');
  outDir = join(work, 'out');
  mkdirSync(join(oleanDir, 'Std'), { recursive: true });
  mkdirSync(join(oleanDir, 'Init'), { recursive: true });
  writeFileSync(join(oleanDir, 'Std', 'A.olean'), 'A-olean');
  writeFileSync(join(oleanDir, 'Std', 'A.ir'), 'A-ir');
  writeFileSync(join(oleanDir, 'Std', 'B.olean'), 'B-olean');
  writeFileSync(join(oleanDir, 'Std', 'B.ir'), 'B-ir');
  writeFileSync(join(oleanDir, 'Std', 'B.olean.server'), 'B-server');
  writeFileSync(join(oleanDir, 'Std', 'B.olean.private'), 'B-private');
  // 根模块本身也要进包，否则运行时 import Std 找不到 Std.olean。
  writeFileSync(join(oleanDir, 'Std.olean'), 'root-olean');
  writeFileSync(join(oleanDir, 'Std.ir'), 'root-ir');
  writeFileSync(join(oleanDir, 'Std.ir.sig'), 'root-ir-sig');
  writeFileSync(join(oleanDir, 'Std.olean.server'), 'root-server');
  writeFileSync(join(oleanDir, 'Std.olean.private'), 'root-private');
  // 仅前缀相同但不是同一模块的目录不能被打进来。
  mkdirSync(join(oleanDir, 'StdX'), { recursive: true });
  writeFileSync(join(oleanDir, 'StdX', 'D.olean'), 'D-olean');
  writeFileSync(join(oleanDir, 'StdX', 'D.ir'), 'D-ir');
  writeFileSync(join(oleanDir, 'StdX.olean'), 'X-olean');
  writeFileSync(join(oleanDir, 'StdX.ir'), 'X-ir');
  writeFileSync(join(oleanDir, 'Init', 'C.olean'), 'C-olean');
  writeFileSync(join(oleanDir, 'Init', 'C.ir'), 'C-ir');
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true, maxRetries: 3 });
});

describe('package-runtime-extension', () => {
  it('只打包指定前缀，并写出可切片的 chunks 与 index', () => {
    run();

    const index = JSON.parse(readFileSync(join(outDir, 'lean-std.index.json'), 'utf8'));
    expect(index.schemaVersion).toBe(1);
    expect(index.root).toBe('/lean/lib/lean');
    expect(index.modules).toBe(3);
    expect(index.files.map((file) => file.path)).toEqual([
      'Std.ir',
      'Std.ir.sig',
      'Std.olean',
      'Std.olean.private',
      'Std.olean.server',
      'Std/A.ir',
      'Std/A.olean',
      'Std/B.ir',
      'Std/B.olean',
      'Std/B.olean.private',
      'Std/B.olean.server',
    ]);
    expect(index.chunks.length).toBeGreaterThan(1);

    const pack = Buffer.concat(
      index.chunks.map((chunk) => zstdDecompressSync(readFileSync(join(outDir, chunk.path)))),
    );
    expect(pack.length).toBe(index.totalBytes);
    for (const file of index.files) {
      const actual = pack.subarray(file.offset, file.offset + file.bytes).toString();
      const expected = readFileSync(join(oleanDir, file.path)).toString();
      expect(actual).toBe(expected);
    }

    const sums = readFileSync(join(outDir, 'SHA256SUMS'), 'utf8').trim().split('\n');
    expect(sums).toHaveLength(index.chunks.length + 1);
    const indexHash = createHash('sha256')
      .update(readFileSync(join(outDir, 'lean-std.index.json')))
      .digest('hex');
    expect(sums[0]).toBe(`${indexHash}  lean-std.index.json`);
  });
});
