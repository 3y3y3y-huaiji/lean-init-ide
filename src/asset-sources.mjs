/**
 * Lean 运行时资产的分发源解析。
 *
 * 这个模块同时被浏览器 Service Worker（由 esbuild 打包）、Pages Functions 和
 * Node 构建脚本引用，因此保持为不依赖任何宿主 API 的纯 .mjs。资产的字节数、
 * SHA-256 与键名统一来自 config/lean4-runtime.json，避免多处清单漂移。
 *
 * 主源是站点同源的 /cdn/ 路径（Pages Function → R2 binding），所以 baseUrl
 * 可以是相对路径；回退源仍是绝对 URL。Node 侧可以用 LEAN_ASSET_BASE_URL 或
 * LEAN_ASSET_ORIGIN 把相对主源解析成可 fetch 的绝对地址。
 */

const isAbsoluteUrl = (value) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

/** 给 URL 附加 revision 参数：换 revision 即换缓存键，也能绕开旧缓存变体。 */
export const withCacheKey = (rawUrl, cacheKey) => {
  if (!cacheKey) return rawUrl;
  if (!isAbsoluteUrl(rawUrl)) {
    const [path, query] = rawUrl.split('?');
    const params = new URLSearchParams(query ?? '');
    params.set('r', cacheKey);
    return `${path}?${params.toString()}`;
  }
  const url = new URL(rawUrl);
  url.searchParams.set('r', cacheKey);
  return url.href;
};

const composeUrl = (baseUrl, path) => {
  if (isAbsoluteUrl(baseUrl)) {
    const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return new URL(path, normalized).href;
  }
  const normalized = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  return `${normalized.endsWith('/') ? normalized : `${normalized}/`}${path}`;
};

/** 同源 Pages Function 优先，GitHub raw 兜底；两个源相同则去重。 */
export const assetSources = (manifest, asset, primaryBaseUrl) => {
  const sources = [];
  const seen = new Set();

  const add = (label, baseUrl, path) => {
    if (!label || !baseUrl || !path) return;
    const url = withCacheKey(composeUrl(baseUrl, path), manifest.cacheKey);
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
