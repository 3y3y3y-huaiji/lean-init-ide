export interface AssetSource {
  label: string;
  url: string;
}

export interface RuntimeAsset {
  name: string;
  key: string;
  source?: string;
  local?: string;
  bytes: number;
  sha256: string;
  contentType: string;
  ranged?: boolean;
  /** 交付字节的压缩格式；缺省为 identity。 */
  encoding?: 'gzip' | 'zstd';
  /** zstd 资产的构建来源（上游 gzip 文件名与校验值）。 */
  upstream?: string;
  upstreamBytes?: number;
  upstreamSha256?: string;
  uncompressedBytes?: number;
  uncompressedSha256?: string;
}

export interface RuntimeManifest {
  revision: string;
  cacheKey: string;
  runtime: string;
  bucket: string;
  primary: { label: string; baseUrl: string };
  fallback: { label: string; baseUrl: string };
  /** 国内镜像（魔搭）。文件按 <prefix 或 cacheKey>/<name> 存放，URL 不带 ?r= 版本键。 */
  mirror?: { label: string; baseUrl: string; prefix?: string };
  assets: RuntimeAsset[];
}

export interface AssetSourceOptions {
  /** 浏览器侧优先走国内镜像。 */
  mirrorFirst?: boolean;
  /** 在 primary 之后插入镜像（Node 构建一般不需要）。 */
  includeMirror?: boolean;
  /** 诊断用：GitHub raw 排在最前，其它源仍保留做回退。 */
  githubFirst?: boolean;
}

export declare function withCacheKey(rawUrl: string, cacheKey: string): string;
export declare function assetSources(
  manifest: RuntimeManifest,
  asset: RuntimeAsset,
  primaryBaseUrl?: string,
  options?: AssetSourceOptions,
): AssetSource[];
export declare function rangedAssets(manifest: RuntimeManifest): RuntimeAsset[];
/** 按 Accept-Language 首选语言判断是否优先走国内镜像（只影响源顺序）。 */
export declare function prefersDomesticMirror(acceptLanguage: string | null | undefined): boolean;

/* 诊断用的强制源开关：?source=mirror|cdn|github */
export type SourceMode = 'mirror' | 'cdn' | 'github';
export declare const SOURCE_MODES: readonly SourceMode[];
export declare function isSourceMode(value: string | null | undefined): value is SourceMode;
/** 页面与 Service Worker 共享强制源配置的 CacheStorage 名与键。 */
export declare const SOURCE_PREFERENCE_CACHE: string;
export declare const SOURCE_PREFERENCE_KEY: string;
