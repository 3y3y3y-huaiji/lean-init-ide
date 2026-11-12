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
}

export interface RuntimeManifest {
  revision: string;
  cacheKey: string;
  runtime: string;
  bucket: string;
  primary: { label: string; baseUrl: string };
  fallback: { label: string; baseUrl: string };
  /** 国内镜像（魔搭）。文件按 <cacheKey>/<name> 存放，URL 不带 ?r= 版本键。 */
  mirror?: { label: string; baseUrl: string };
  assets: RuntimeAsset[];
}

export interface AssetSourceOptions {
  /** 浏览器侧优先走国内镜像。 */
  mirrorFirst?: boolean;
  /** 在 primary 之后插入镜像（Node 构建一般不需要）。 */
  includeMirror?: boolean;
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
