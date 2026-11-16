import runtimeManifest from '../config/lean4-runtime.json';
import { assetSources } from './asset-sources.mjs';

/**
 * 扩展库（Std / Batteries）的按需下载。
 *
 * 扩展包与 Init 使用同一种索引格式：<name>.index.json + 若干 zstd chunk。
 * 这里只负责「下载 -> 校验 -> 解压 -> 逻辑名映射」，挂载与释放由 LSP 会话重启完成。
 * 返回的 key 与 runtime-worker 的 library 逻辑名一致：
 * - 索引：lean-std.index.json
 * - 分片：lean-std-00.pack（由 lean-std-00.pack.gz.bin 去掉压缩后缀）
 */

type ExtensionAsset = {
  name: string;
  key: string;
  bytes: number;
  sha256: string;
  contentType: string;
};

export type RuntimeExtensionId = 'std' | 'batteries';

export type RuntimeExtension = {
  id: RuntimeExtensionId;
  label: string;
  requires: RuntimeExtensionId[];
  assets: ExtensionAsset[];
};

type PackIndex = {
  chunks: Array<{
    path: string;
    uncompressedBytes: number;
    uncompressedSha256: string;
  }>;
};

export type ExtensionPacks = Record<string, ArrayBufferLike>;

type Manifest = Parameters<typeof assetSources>[0] & { extensions?: RuntimeExtension[] };

const manifest = runtimeManifest as unknown as Manifest;

export const runtimeExtensions: RuntimeExtension[] = manifest.extensions ?? [];

export const extensionById = (id: RuntimeExtensionId) =>
  runtimeExtensions.find((extension) => extension.id === id);

/** 把依赖闭包展开，例如 Batteries 需要先挂 Std。 */
export const resolveExtensionIds = (ids: Iterable<RuntimeExtensionId>): RuntimeExtensionId[] => {
  const resolved = new Set<RuntimeExtensionId>();
  const visit = (id: RuntimeExtensionId) => {
    if (resolved.has(id)) return;
    resolved.add(id);
    for (const dependency of extensionById(id)?.requires ?? []) visit(dependency);
  };
  for (const id of ids) visit(id);
  return [...resolved];
};

const sha256Hex = async (bytes: ArrayBuffer) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

let decoderPromise: Promise<{ decode: (data: Uint8Array, size: number) => Uint8Array }> | null =
  null;

const getDecoder = () => {
  decoderPromise ??= (async () => {
    const url = new URL('/vendor/zstddec.mjs', self.location.origin).href;
    const { ZSTDDecoder } = (await import(/* @vite-ignore */ url)) as {
      ZSTDDecoder: new () => {
        init: () => Promise<void>;
        decode: (d: Uint8Array, n: number) => Uint8Array;
      };
    };
    const decoder = new ZSTDDecoder();
    await decoder.init();
    return decoder;
  })();
  return decoderPromise;
};

const fetchAsset = async (asset: ExtensionAsset) => {
  // 扩展包只发布在 R2/魔搭：用 zstd 标记跳过 GitHub Release 回退。
  const sources = assetSources(manifest, { ...asset, encoding: 'zstd' }, undefined, {
    includeMirror: true,
  }).filter((source) => source.url.startsWith('/') || /^https?:/i.test(source.url));
  let lastError: unknown;
  for (const source of sources) {
    try {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== asset.bytes) throw new Error(`${bytes.byteLength} bytes`);
      if ((await sha256Hex(bytes)) !== asset.sha256) throw new Error('sha256 mismatch');
      return bytes;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `${asset.name} 下载失败：${lastError instanceof Error ? lastError.message : lastError}`,
  );
};

/**
 * 下载指定的扩展（调用方先用 resolveExtensionIds 展开依赖）。
 * 调用方负责在释放时丢弃返回值，SAB 引用消失后内存即可回收。
 * onProgress 收到 0..1 的累计进度（按压缩字节计）。
 */
export const loadExtensionPacks = async (
  ids: Iterable<RuntimeExtensionId>,
  onProgress?: (ratio: number, label: string) => void,
): Promise<ExtensionPacks> => {
  const selected = [...ids]
    .map((id) => extensionById(id))
    .filter((extension): extension is RuntimeExtension => extension !== undefined);
  const total = selected.reduce(
    (sum, extension) => sum + extension.assets.reduce((bytes, asset) => bytes + asset.bytes, 0),
    0,
  );

  const packs: ExtensionPacks = {};
  let loaded = 0;
  for (const extension of selected) {
    onProgress?.(total === 0 ? 0 : loaded / total, extension.label);
    const indexAsset = extension.assets.find((asset) => asset.name.endsWith('.index.json'));
    if (!indexAsset) throw new Error(`${extension.label} 缺少索引资产`);
    const indexBytes = await fetchAsset(indexAsset);
    const index = JSON.parse(new TextDecoder().decode(indexBytes)) as PackIndex;
    loaded += indexAsset.bytes;
    const indexShared = new Uint8Array(new SharedArrayBuffer(indexBytes.byteLength));
    indexShared.set(new Uint8Array(indexBytes));
    packs[indexAsset.name] = indexShared.buffer;

    const decoder = await getDecoder();
    for (const chunk of index.chunks) {
      const asset = extension.assets.find((item) => item.name === chunk.path);
      if (!asset) throw new Error(`${extension.label} 缺少分片 ${chunk.path}`);
      const compressed = await fetchAsset(asset);
      loaded += asset.bytes;
      onProgress?.(total === 0 ? 0 : loaded / total, extension.label);
      const raw = decoder.decode(new Uint8Array(compressed), chunk.uncompressedBytes);
      if (raw.byteLength !== chunk.uncompressedBytes) {
        throw new Error(
          `${chunk.path} 解压后 ${raw.byteLength} 字节，期望 ${chunk.uncompressedBytes}`,
        );
      }
      if ((await sha256Hex(raw.buffer as ArrayBuffer)) !== chunk.uncompressedSha256) {
        throw new Error(`${chunk.path} 解压后 SHA-256 不一致`);
      }
      const logicalName = chunk.path.replace(/\.gz(\.bin)?$/, '');
      const shared = new Uint8Array(new SharedArrayBuffer(raw.byteLength));
      shared.set(raw);
      packs[logicalName] = shared.buffer;
    }
  }
  onProgress?.(1, '');
  return packs;
};
