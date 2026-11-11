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
  assets: RuntimeAsset[];
}

export declare function withCacheKey(rawUrl: string, cacheKey: string): string;
export declare function assetSources(
  manifest: RuntimeManifest,
  asset: RuntimeAsset,
  primaryBaseUrl?: string,
): AssetSource[];
export declare function rangedAssets(manifest: RuntimeManifest): RuntimeAsset[];
