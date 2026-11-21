import runtimeManifest from '../config/lean4-runtime.json';
import wasm64RuntimeManifest from '../config/lean4-wasm64-runtime.json';
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

export type RuntimeArch = 'wasm32' | 'wasm64';

export type RuntimeExtensionId = 'std' | 'batteries' | 'mathlib';

export type RuntimeExtension = {
  id: RuntimeExtensionId;
  label: string;
  requires: RuntimeExtensionId[];
  /** 扩展包只对指定架构有效；wasm32 的 Std 是 32 位 olean，wasm64 不能复用。 */
  arch: RuntimeArch;
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

const wasm32Manifest = runtimeManifest as unknown as Manifest;
const wasm64Manifest = wasm64RuntimeManifest as unknown as Manifest;

/**
 * 两个运行时的可选库合并成一份目录：按钮按架构过滤，同一个 id 在不同架构下
 * 指向不同的 olean 包（wasm32 flags=0，wasm64 官方 GMP flags=1）。
 */
export const runtimeExtensions: RuntimeExtension[] = [
  ...(wasm32Manifest.extensions ?? []).map((extension) => ({
    ...extension,
    arch: 'wasm32' as const,
  })),
  ...(wasm64Manifest.extensions ?? []).map((extension) => ({
    ...extension,
    arch: 'wasm64' as const,
  })),
];

export const runtimeExtensionsFor = (arch: RuntimeArch): RuntimeExtension[] =>
  runtimeExtensions.filter((extension) => extension.arch === arch);

export const extensionById = (id: RuntimeExtensionId, arch: RuntimeArch = 'wasm32') =>
  runtimeExtensions.find((extension) => extension.id === id && extension.arch === arch) ??
  runtimeExtensions.find((extension) => extension.id === id);

/** 把依赖闭包展开，例如 Batteries 需要先挂 Std、Mathlib 需要先挂 Lean 核心。 */
export const resolveExtensionIds = (
  ids: Iterable<RuntimeExtensionId>,
  arch: RuntimeArch = 'wasm32',
): RuntimeExtensionId[] => {
  const resolved = new Set<RuntimeExtensionId>();
  const visit = (id: RuntimeExtensionId) => {
    if (resolved.has(id)) return;
    const extension = extensionById(id, arch);
    if (!extension || extension.arch !== arch) return;
    resolved.add(id);
    for (const dependency of extension.requires) visit(dependency);
  };
  for (const id of ids) visit(id);
  return [...resolved];
};

const sha256Hex = async (bytes: ArrayBuffer) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

type ZstdDecoder = {
  init: () => Promise<void>;
  decode: (data: Uint8Array, size: number) => Uint8Array;
};

/**
 * 每次 loadExtensionPacks 独立创建解码器：zstddec 解压时内部 Wasm 线性内存会
 * 撑到几十 MB，解压结束即可随引用消失被 GC 回收，不再作为模块级单例永久驻留。
 */
const createDecoder = async (): Promise<ZstdDecoder> => {
  const url = new URL('/vendor/zstddec.mjs', self.location.origin).href;
  const { ZSTDDecoder } = (await import(/* @vite-ignore */ url)) as {
    ZSTDDecoder: new () => ZstdDecoder;
  };
  const decoder = new ZSTDDecoder();
  await decoder.init();
  return decoder;
};

const fetchAsset = async (asset: ExtensionAsset, manifest: Manifest = wasm32Manifest) => {
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
  arch: RuntimeArch = 'wasm32',
): Promise<ExtensionPacks> => {
  const selected = [...ids]
    .map((id) => extensionById(id, arch))
    .filter(
      (extension): extension is RuntimeExtension =>
        extension !== undefined && extension.arch === arch,
    );
  const total = selected.reduce(
    (sum, extension) => sum + extension.assets.reduce((bytes, asset) => bytes + asset.bytes, 0),
    0,
  );

  const packs: ExtensionPacks = {};
  let loaded = 0;
  const state: { decoder?: ZstdDecoder } = {};
  try {
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

      const decoder = state.decoder ?? (state.decoder = await createDecoder());
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
  } finally {
    // 解压结束（无论成功或抛错）立刻放掉解码器引用，让主线程 zstddec 的 Wasm 堆可被回收。
    state.decoder = undefined;
  }
  onProgress?.(1, '');
  return packs;
};
