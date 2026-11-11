/**
 * Lean 运行时资产的分发源解析。
 *
 * 这个模块同时被浏览器 Service Worker（由 esbuild 打包）和 Node 构建脚本引用，
 * 因此保持为不依赖任何宿主 API 的纯 .mjs。资产的字节数、SHA-256 与键名统一
 * 来自 config/lean4-runtime.json，避免 SW 与构建脚本各自维护一份清单而漂移。
 */

/** 给 URL 附加 revision 参数：换 revision 即换缓存键，也能绕开旧的 CORS 缓存变体。 */
export const withCacheKey = (rawUrl, cacheKey) => {
  if (!cacheKey) return rawUrl;
  const url = new URL(rawUrl);
  url.searchParams.set('r', cacheKey);
  return url.href;
};

/** 主源 Cloudflare R2 优先，GitHub raw 兜底；两个源相同则去重。 */
export const assetSources = (manifest, asset, primaryBaseUrl) => {
  const sources = [];
  const seen = new Set();

  const add = (label, baseUrl, path) => {
    if (!label || !baseUrl || !path) return;
    const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = withCacheKey(new URL(path, normalized).href, manifest.cacheKey);
    if (seen.has(url)) return;
    seen.add(url);
    sources.push({ label, url });
  };

  add(manifest.primary.label, primaryBaseUrl || manifest.primary.baseUrl, asset.key);
  add(manifest.fallback.label, manifest.fallback.baseUrl, asset.source);
  return sources;
};

/** 只有大文件走 Range 分片；小文件由构建脚本直接下载/复制。 */
export const rangedAssets = (manifest) => manifest.assets.filter((asset) => asset.ranged === true);
