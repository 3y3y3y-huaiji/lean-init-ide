// 打包实验性 wasm64 运行时交付目录（lean-lsp-adapted.mjs + lean-lsp.wasm.zst +
// 分片 zstd 64 位 Init 资产 + wasm64-runtime-manifest.json + SHA256SUMS），
// 供 Cloudflare R2（经主站 Pages Function /cdn/ 同源网关，浏览器唯一数据源）发布；
// GitHub Release 只做归档与构建期回退：Release 下载没有 CORS 头，浏览器不会使用它。
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { collectOleanManifest } from './ci/gen-olean-manifest.ts';
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
import { packLibrary } from './pack-lean-lib.ts';
import type { Wasm64ExtensionEntry } from './package-wasm64-extensions.ts';

export interface Wasm64AssetEntry {
  readonly name: string;
  readonly key: string;
  readonly source: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly contentType: string;
  readonly ranged?: true;
  readonly encoding?: 'zstd';
  readonly uncompressedBytes?: number;
  readonly uncompressedSha256?: string;
}

export interface Wasm64RuntimeManifest {
  readonly schemaVersion: 1;
  readonly experimental: true;
  readonly arch: 'wasm64';
  readonly leanVersion: string;
  readonly cacheKey: string;
  readonly runtime: string;
  readonly bucket: string;
  readonly primary: { readonly label: string; readonly baseUrl: string };
  readonly fallback: { readonly label: string; readonly baseUrl: string };
  readonly mirror?: {
    readonly label: string;
    readonly baseUrl: string;
    readonly prefix?: string;
  };
  readonly assets: readonly Wasm64AssetEntry[];
  readonly extensions?: readonly Wasm64ExtensionEntry[];
}

export interface PackageWasm64Options {
  readonly gluePath: string;
  readonly wasmPath: string;
  readonly wasmZstPath: string;
  readonly libDir: string;
  readonly outDir: string;
  readonly leanVersion?: string;
  readonly keyPrefix?: string;
  readonly fallbackBaseUrl?: string;
  readonly mirrorBaseUrl?: string;
  readonly mirrorLabel?: string;
  readonly mirrorPrefix?: string;
  readonly bucket?: string;
  readonly level?: number;
  readonly chunkBytes?: number;
  /** package-wasm64-extensions.ts 产出的 extensions.json；存在时合并进清单。 */
  readonly extensionsPath?: string;
  /** 扩展包所在目录，默认取 extensionsPath 的目录。 */
  readonly extensionsDir?: string;
}

const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

export const packageWasm64Runtime = (options: PackageWasm64Options): Wasm64RuntimeManifest => {
  const glueFile = requireFile(options.gluePath, 'lean-lsp-adapted.mjs');
  const wasmFile = requireFile(options.wasmPath, 'lean-lsp.wasm');
  const wasmZstFile = requireFile(options.wasmZstPath, 'lean-lsp.wasm.zst');
  const libDir = requireDir(options.libDir, 'lib');
  const outDir = options.outDir;

  const leanVersion = options.leanVersion ?? '4.36.0-rc2';
  const keyPrefix = (options.keyPrefix ?? `wasm-lean4/${leanVersion}-wasm64`).replace(
    /^\/+|\/+$/g,
    '',
  );
  const bucket = options.bucket ?? 'lean4-ide-releases';
  const fallbackBaseUrl =
    options.fallbackBaseUrl ??
    `https://github.com/3y3y3y-huaiji/lean-init-ide/releases/download/runtime-v${leanVersion}-wasm64/`;

  mkdirSync(outDir, { recursive: true });

  const glueName = 'lean-lsp-adapted.mjs';
  const wasmZstName = 'lean-lsp.wasm.zst';
  copyFileSync(glueFile, join(outDir, glueName));
  copyFileSync(wasmZstFile, join(outDir, wasmZstName));

  const glueBytes = readFileSync(glueFile);
  const wasmRawBytes = readFileSync(wasmFile);
  const wasmZstBytes = readFileSync(wasmZstFile);

  const initFiles = collectOleanManifest(libDir, { roots: ['Init'] });
  if (initFiles.length === 0) {
    throw new CliError(`lib 目录缺少 Init olean: ${libDir}`);
  }

  const packResult = packLibrary({
    libDir,
    files: initFiles,
    outDir,
    prefix: 'lean-init-64',
    chunkBytes: options.chunkBytes,
    level: options.level ?? 19,
  });

  const indexName = 'lean-init-64.index.json';
  const indexBytes = readFileSync(join(outDir, indexName));

  const assets: Wasm64AssetEntry[] = [
    {
      name: glueName,
      key: `${keyPrefix}/${glueName}`,
      source: glueName,
      bytes: glueBytes.byteLength,
      sha256: sha256(glueBytes),
      contentType: 'text/javascript',
    },
    {
      name: wasmZstName,
      key: `${keyPrefix}/${wasmZstName}`,
      source: wasmZstName,
      bytes: wasmZstBytes.byteLength,
      sha256: sha256(wasmZstBytes),
      contentType: 'application/octet-stream',
      ranged: true,
      encoding: 'zstd',
      uncompressedBytes: wasmRawBytes.byteLength,
      uncompressedSha256: sha256(wasmRawBytes),
    },
    {
      name: indexName,
      key: `${keyPrefix}/${indexName}`,
      source: indexName,
      bytes: indexBytes.byteLength,
      sha256: sha256(indexBytes),
      contentType: 'application/json',
    },
    ...packResult.receipts.map((receipt): Wasm64AssetEntry => ({
      name: receipt.name,
      key: `${keyPrefix}/${receipt.name}`,
      source: receipt.name,
      bytes: receipt.bytes,
      sha256: receipt.sha256,
      contentType: 'application/octet-stream',
      ranged: true,
      encoding: 'zstd',
      uncompressedBytes: receipt.uncompressedBytes,
      uncompressedSha256: receipt.uncompressedSha256,
    })),
  ];

  // 扩展包不参与 cacheKey：否则新增 Mathlib 会让用户把 100MB 基础包全部重下。
  // 扩展资产 URL 自带 `h=<sha256前12位>`，内容变化自然失效。
  const cacheSeed = assets.map((asset) => `${asset.name}:${asset.sha256}`).join('\n');
  const cacheKey = `w64-${sha256(Buffer.from(cacheSeed)).slice(0, 8)}`;

  let extensions: Wasm64ExtensionEntry[] | undefined;
  if (options.extensionsPath) {
    const specPath = requireFile(options.extensionsPath, 'extensions');
    const extDir = requireDir(options.extensionsDir ?? dirname(specPath), 'extensions dir');
    extensions = JSON.parse(readFileSync(specPath, 'utf8')) as Wasm64ExtensionEntry[];
    if (!Array.isArray(extensions) || extensions.length === 0) {
      throw new CliError(`扩展清单为空: ${specPath}`);
    }
    for (const extension of extensions) {
      if (!/^[a-z][a-z0-9-]*$/.test(extension.id)) {
        throw new CliError(`扩展 id 非法: ${extension.id}`);
      }
      for (const asset of extension.assets) {
        const source = requireFile(join(extDir, asset.source), `${extension.id}/${asset.name}`);
        const bytes = readFileSync(source);
        if (bytes.byteLength !== asset.bytes) {
          throw new CliError(
            `${extension.id}/${asset.name} 长度 ${bytes.byteLength} != 清单 ${asset.bytes}`,
          );
        }
        if (sha256(bytes) !== asset.sha256) {
          throw new CliError(`${extension.id}/${asset.name} SHA-256 与清单不一致`);
        }
        if (join(outDir, asset.name) !== source) copyFileSync(source, join(outDir, asset.name));
      }
    }
  }

  const mirrorBaseUrl =
    options.mirrorBaseUrl ?? 'https://modelscope.cn/datasets/HQZMSu/lean4-assets/resolve/master/';
  const mirrorLabel = options.mirrorLabel ?? '魔搭镜像（国内）';
  const mirrorPrefix = (options.mirrorPrefix ?? keyPrefix).replace(/^\/+|\/+$/g, '');

  const manifest: Wasm64RuntimeManifest = {
    schemaVersion: 1,
    experimental: true,
    arch: 'wasm64',
    leanVersion,
    cacheKey,
    runtime: `Lean ${leanVersion} Init (wasm64 experimental)`,
    bucket,
    primary: { label: 'Pages Functions (R2)', baseUrl: '/cdn/' },
    fallback: { label: 'GitHub release', baseUrl: fallbackBaseUrl },
    ...(mirrorBaseUrl
      ? { mirror: { label: mirrorLabel, baseUrl: mirrorBaseUrl, prefix: mirrorPrefix } }
      : {}),
    assets,
    ...(extensions ? { extensions } : {}),
  };

  writeFileSync(
    join(outDir, 'wasm64-runtime-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const allAssets = [...assets, ...(extensions?.flatMap((extension) => extension.assets) ?? [])];
  const checksumLines = allAssets.map((asset) => `${asset.sha256}  ${asset.name}`).join('\n');
  writeFileSync(join(outDir, 'SHA256SUMS'), `${checksumLines}\n`);

  return manifest;
};

const SPEC: Record<string, FlagSpec> = {
  glue: { kind: 'string', required: true, valueName: 'file' },
  wasm: { kind: 'string', required: true, valueName: 'file' },
  'wasm-zst': { kind: 'string', required: true, valueName: 'file' },
  lib: { kind: 'string', required: true, valueName: 'dir' },
  out: { kind: 'string', required: true, valueName: 'dir' },
  'lean-version': { kind: 'string', valueName: 'ver' },
  'key-prefix': { kind: 'string', valueName: 'prefix' },
  'fallback-base': { kind: 'string', valueName: 'url' },
  'mirror-base': { kind: 'string', valueName: 'url' },
  'mirror-label': { kind: 'string', valueName: 'label' },
  'mirror-prefix': { kind: 'string', valueName: 'prefix' },
  bucket: { kind: 'string', valueName: 'name' },
  level: { kind: 'number', valueName: 'n' },
  extensions: { kind: 'string', valueName: 'file' },
  'extensions-dir': { kind: 'string', valueName: 'dir' },
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), SPEC);
  if (parsed.positionals.length > 0) {
    throw new CliError(`多余位置参数: ${parsed.positionals.join(' ')}`);
  }
  const level = 'level' in parsed.flags ? requireNumber(parsed, 'level') : undefined;
  if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 22)) {
    throw new CliError(`--level 必须是 1..22 的整数，收到 ${level}`);
  }
  const manifest = packageWasm64Runtime({
    gluePath: requireString(parsed, 'glue'),
    wasmPath: requireString(parsed, 'wasm'),
    wasmZstPath: requireString(parsed, 'wasm-zst'),
    libDir: requireString(parsed, 'lib'),
    outDir: requireString(parsed, 'out'),
    leanVersion: optionalString(parsed, 'lean-version'),
    keyPrefix: optionalString(parsed, 'key-prefix'),
    fallbackBaseUrl: optionalString(parsed, 'fallback-base'),
    mirrorBaseUrl: optionalString(parsed, 'mirror-base'),
    mirrorLabel: optionalString(parsed, 'mirror-label'),
    mirrorPrefix: optionalString(parsed, 'mirror-prefix'),
    bucket: optionalString(parsed, 'bucket'),
    level,
    extensionsPath: optionalString(parsed, 'extensions'),
    extensionsDir: optionalString(parsed, 'extensions-dir'),
  });
  console.log(
    `packaged ${manifest.assets.length} wasm64 assets (cacheKey=${manifest.cacheKey}) -> ${requireString(parsed, 'out')}`,
  );
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
