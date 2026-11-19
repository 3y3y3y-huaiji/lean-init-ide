// 把 Lean 库目录（按清单）打包为分片 zstd 资产（<prefix>.index.json + <prefix>-XX.pack.zst.bin + <prefix>-receipt.json），
// 格式与 runner-worker.js / @wasm-idle/lsp 一致，方便后续上传 R2 / ModelScope。
//
// 用法：
//   node scripts/pack-lean-lib.ts --lib <libDir> --manifest <manifest.json> --out <outDir> [--prefix lean-mathlib] [--chunk-bytes 50331648]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { constants as zlibConstants, zstdCompressSync } from 'node:zlib';
import {
  CliError,
  optionalString,
  parseArgs,
  requireNumber,
  requireString,
  runCli,
  type FlagSpec,
} from './lib/cli.ts';
import { isMainModule } from './lib/entry.ts';
import { requireDir, requireFile } from './lib/fs-guards.ts';

export const DEFAULT_CHUNK_BYTES = 48 * 1024 * 1024;
export const DEFAULT_ZSTD_LEVEL = 6;

export interface PackChunk {
  readonly path: string;
  readonly offset: number;
  readonly uncompressedBytes: number;
}

export interface PackFileEntry {
  readonly path: string;
  readonly offset: number;
  readonly bytes: number;
}

export interface PackAssetReceipt {
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly encoding: 'zstd';
  readonly uncompressedBytes: number;
  readonly uncompressedSha256: string;
}

export interface PackLibraryResult {
  readonly files: number;
  readonly rawBytes: number;
  readonly compressedBytes: number;
  readonly chunks: readonly PackChunk[];
  readonly receipts: readonly PackAssetReceipt[];
}

const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

export const packLibrary = (options: {
  libDir: string;
  files: readonly string[];
  outDir: string;
  prefix?: string;
  chunkBytes?: number;
  level?: number;
}): PackLibraryResult => {
  const libDir = requireDir(options.libDir, 'lib');
  const prefix = options.prefix ?? 'lean-init';
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const level = options.level ?? DEFAULT_ZSTD_LEVEL;
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new CliError(`chunkBytes 必须是正整数，收到 ${chunkBytes}`);
  }
  if (!Number.isInteger(level) || level < 1 || level > 22) {
    throw new CliError(`level 必须是 1..22 整数，收到 ${level}`);
  }
  if (options.files.length === 0) throw new CliError('打包清单不能为空');

  mkdirSync(options.outDir, { recursive: true });

  const buffers: Buffer[] = [];
  const entries: PackFileEntry[] = [];
  let offset = 0;
  for (const rel of options.files) {
    const clean = rel.replaceAll('\\', '/');
    const data = readFileSync(join(libDir, clean));
    entries.push({ path: clean, offset, bytes: data.byteLength });
    buffers.push(data);
    offset += data.byteLength;
  }

  const combined = Buffer.concat(buffers, offset);
  const chunks: PackChunk[] = [];
  const receipts: PackAssetReceipt[] = [];
  let compressedBytes = 0;

  for (let start = 0, index = 0; start < combined.byteLength; start += chunkBytes, index += 1) {
    const slice = combined.subarray(start, Math.min(start + chunkBytes, combined.byteLength));
    const logicalName = `${prefix}-${String(index).padStart(2, '0')}.pack`;
    const zstName = `${logicalName}.zst.bin`;
    const compressed = zstdCompressSync(slice, {
      params: { [zlibConstants.ZSTD_c_compressionLevel]: level },
    });
    writeFileSync(join(options.outDir, zstName), compressed);
    compressedBytes += compressed.byteLength;
    chunks.push({
      path: `${logicalName}.zst`,
      offset: start,
      uncompressedBytes: slice.byteLength,
    });
    receipts.push({
      name: zstName,
      bytes: compressed.byteLength,
      sha256: sha256(compressed),
      encoding: 'zstd',
      uncompressedBytes: slice.byteLength,
      uncompressedSha256: sha256(slice),
    });
  }

  const indexName = `${prefix}.index.json`;
  const indexBytes = Buffer.from(`${JSON.stringify({ chunks, files: entries })}\n`, 'utf8');
  writeFileSync(join(options.outDir, indexName), indexBytes);
  writeFileSync(
    join(options.outDir, `${prefix}-receipt.json`),
    `${JSON.stringify(
      {
        prefix,
        files: entries.length,
        rawBytes: combined.byteLength,
        compressedBytes,
        index: {
          name: indexName,
          bytes: indexBytes.byteLength,
          sha256: sha256(indexBytes),
        },
        chunks: receipts,
      },
      null,
      2,
    )}\n`,
  );

  return {
    files: entries.length,
    rawBytes: combined.byteLength,
    compressedBytes,
    chunks,
    receipts,
  };
};

const SPEC: Record<string, FlagSpec> = {
  lib: { kind: 'string', required: true, valueName: 'dir' },
  manifest: { kind: 'string', required: true, valueName: 'file' },
  out: { kind: 'string', required: true, valueName: 'dir' },
  prefix: { kind: 'string', valueName: 'name' },
  'chunk-bytes': { kind: 'number', valueName: 'N' },
  level: { kind: 'number', valueName: '1..22' },
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), SPEC);
  const manifestPath = requireFile(requireString(parsed, 'manifest'), 'manifest');
  const files = JSON.parse(readFileSync(manifestPath, 'utf8')) as string[];
  const prefix = optionalString(parsed, 'prefix');
  const chunkBytes =
    parsed.flags['chunk-bytes'] === undefined ? undefined : requireNumber(parsed, 'chunk-bytes');
  const level = parsed.flags.level === undefined ? undefined : requireNumber(parsed, 'level');
  const result = packLibrary({
    libDir: requireString(parsed, 'lib'),
    files,
    outDir: requireString(parsed, 'out'),
    ...(prefix === undefined ? {} : { prefix }),
    ...(chunkBytes === undefined ? {} : { chunkBytes }),
    ...(level === undefined ? {} : { level }),
  });
  const mb = (n: number): string => (n / (1024 * 1024)).toFixed(2);
  console.log(
    `packed ${result.files} files into ${result.chunks.length} chunks: raw=${mb(result.rawBytes)} MiB, zstd=${mb(result.compressedBytes)} MiB`,
  );
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
