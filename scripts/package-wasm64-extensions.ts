// 打包 wasm64 可选库（Std/Lean 核心、Mathlib 教学子集）：
// 每个扩展产出 <prefix>.index.json + <prefix>-XX.pack.zst.bin，并写出 extensions.json
// 供 package-wasm64-runtime.ts 合并进运行时清单。
//
// 与基础 Init 资产的区别：扩展包按 id 分目录（<keyPrefix>/<id>/），
// 浏览器加载器按 manifest.extensions[].assets 单独校验与挂载。
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectOleanManifest } from './ci/gen-olean-manifest.ts';
import {
  CliError,
  parseArgs,
  requireNumber,
  requireString,
  runCli,
  type FlagSpec,
} from './lib/cli.ts';
import { isMainModule } from './lib/entry.ts';
import { requireDir, requireFile } from './lib/fs-guards.ts';
import { packLibrary } from './pack-lean-lib.ts';

export interface Wasm64ExtensionAsset {
  readonly name: string;
  readonly key: string;
  readonly source: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly contentType: string;
  readonly encoding?: 'zstd';
  readonly uncompressedBytes?: number;
  readonly uncompressedSha256?: string;
}

export interface Wasm64ExtensionEntry {
  readonly id: string;
  readonly label: string;
  readonly requires: readonly string[];
  readonly assets: readonly Wasm64ExtensionAsset[];
}

interface SpecExtension {
  readonly id: string;
  readonly label: string;
  readonly requires?: readonly string[];
  readonly lib: string;
  readonly roots: readonly string[];
  readonly prefix: string;
}

interface SpecFile {
  readonly keyPrefix: string;
  readonly level?: number;
  readonly chunkBytes?: number;
  readonly extensions: readonly SpecExtension[];
}

export interface PackageExtensionsOptions {
  readonly specPath: string;
  readonly outDir: string;
  readonly level?: number;
  readonly chunkBytes?: number;
}

const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

const readSpec = (path: string): SpecFile => {
  const raw = JSON.parse(readFileSync(requireFile(path, 'spec'), 'utf8')) as Partial<SpecFile>;
  if (typeof raw.keyPrefix !== 'string' || raw.keyPrefix.trim() === '') {
    throw new CliError('扩展 spec 缺少 keyPrefix');
  }
  if (!Array.isArray(raw.extensions) || raw.extensions.length === 0) {
    throw new CliError('扩展 spec 的 extensions 不能为空');
  }
  const ids = new Set<string>();
  for (const extension of raw.extensions) {
    if (!extension || typeof extension !== 'object') throw new CliError('扩展条目必须是对象');
    const { id, label, lib, roots, prefix } = extension as Partial<SpecExtension>;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new CliError(`扩展 id 非法: ${String(id)}`);
    }
    if (ids.has(id)) throw new CliError(`扩展 id 重复: ${id}`);
    ids.add(id);
    if (typeof label !== 'string' || label.trim() === '')
      throw new CliError(`扩展 ${id} 缺少 label`);
    if (typeof lib !== 'string' || lib.trim() === '') throw new CliError(`扩展 ${id} 缺少 lib`);
    if (!Array.isArray(roots) || roots.length === 0) throw new CliError(`扩展 ${id} 缺少 roots`);
    if (typeof prefix !== 'string' || !/^[a-z][a-z0-9-]*$/.test(prefix)) {
      throw new CliError(`扩展 ${id} 的 prefix 非法: ${String(prefix)}`);
    }
    for (const dependency of extension.requires ?? []) {
      if (!raw.extensions.some((item) => item.id === dependency)) {
        throw new CliError(`扩展 ${id} 依赖了未声明的 ${dependency}`);
      }
    }
  }
  return raw as SpecFile;
};

export const packageWasm64Extensions = (
  options: PackageExtensionsOptions,
): Wasm64ExtensionEntry[] => {
  const spec = readSpec(options.specPath);
  const outDir = options.outDir;
  mkdirSync(outDir, { recursive: true });
  const keyPrefix = spec.keyPrefix.replace(/^\/+|\/+$/g, '');
  const level = options.level ?? spec.level ?? 19;
  const chunkBytes = options.chunkBytes ?? spec.chunkBytes;
  if (!Number.isInteger(level) || level < 1 || level > 22) {
    throw new CliError(`扩展压缩级别必须是 1..22，收到 ${level}`);
  }

  const extensions = spec.extensions.map((extension) => {
    const libDir = requireDir(extension.lib, `扩展 ${extension.id} 的 lib`);
    const files = collectOleanManifest(libDir, { roots: extension.roots });
    if (files.length === 0) {
      throw new CliError(
        `扩展 ${extension.id} 在 ${libDir} 的 roots=${extension.roots.join(',')} 下没有 olean`,
      );
    }
    const packed = packLibrary({
      libDir,
      files,
      outDir,
      prefix: extension.prefix,
      ...(chunkBytes === undefined ? {} : { chunkBytes }),
      level,
    });
    const indexName = `${extension.prefix}.index.json`;
    const indexBytes = readFileSync(join(outDir, indexName));
    const assets: Wasm64ExtensionAsset[] = [
      {
        name: indexName,
        key: `${keyPrefix}/${extension.id}/${indexName}`,
        source: indexName,
        bytes: indexBytes.byteLength,
        sha256: sha256(indexBytes),
        contentType: 'application/json',
      },
      ...packed.receipts.map((receipt): Wasm64ExtensionAsset => ({
        name: receipt.name,
        key: `${keyPrefix}/${extension.id}/${receipt.name}`,
        source: receipt.name,
        bytes: receipt.bytes,
        sha256: receipt.sha256,
        contentType: 'application/octet-stream',
        encoding: 'zstd',
        uncompressedBytes: receipt.uncompressedBytes,
        uncompressedSha256: receipt.uncompressedSha256,
      })),
    ];
    const mb = (n: number): string => (n / (1024 * 1024)).toFixed(2);
    console.log(
      `extension ${extension.id}: ${packed.files} files, ${packed.chunks.length} chunks, raw=${mb(
        packed.rawBytes,
      )} MiB, zstd=${mb(packed.compressedBytes)} MiB`,
    );
    return {
      id: extension.id,
      label: extension.label,
      requires: extension.requires ?? [],
      assets,
    };
  });
  writeFileSync(join(outDir, 'extensions.json'), `${JSON.stringify(extensions, null, 2)}\n`);
  return extensions;
};

const SPEC: Record<string, FlagSpec> = {
  spec: { kind: 'string', required: true, valueName: 'file' },
  out: { kind: 'string', required: true, valueName: 'dir' },
  level: { kind: 'number', valueName: '1..22' },
  'chunk-bytes': { kind: 'number', valueName: 'N' },
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), SPEC);
  const level = parsed.flags.level === undefined ? undefined : requireNumber(parsed, 'level');
  const chunkBytes =
    parsed.flags['chunk-bytes'] === undefined ? undefined : requireNumber(parsed, 'chunk-bytes');
  const extensions = packageWasm64Extensions({
    specPath: requireString(parsed, 'spec'),
    outDir: requireString(parsed, 'out'),
    ...(level === undefined ? {} : { level }),
    ...(chunkBytes === undefined ? {} : { chunkBytes }),
  });
  console.log(`packaged ${extensions.length} wasm64 extensions`);
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
