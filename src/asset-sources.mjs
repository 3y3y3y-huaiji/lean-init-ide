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

/**
 * 同源 Pages Function 优先，配置了 mirror 时按需插入魔搭镜像；非 zstd 资产再追加
 * GitHub Release 回退（该地址只供构建期使用，浏览器侧会被 CORS 拦掉）。
 * 镜像文件按 <cacheKey>/<name> 存放，避免在 resolve 地址上再带 ?r= 查询参数。
 */
export const assetSources = (manifest, asset, primaryBaseUrl, options = {}) => {
  const sources = [];
  const seen = new Set();

  const add = (label, baseUrl, path, { cacheKey = true } = {}) => {
    if (!label || !baseUrl || !path) return;
    const composed = composeUrl(baseUrl, path);
    const url = cacheKey ? withCacheKey(composed, manifest.cacheKey) : composed;
    if (seen.has(url)) return;
    seen.add(url);
    sources.push({ label, url });
  };

  const addMirror = () => {
    if (!manifest.mirror) return;
    // 魔搭目录可用 prefix 固定（如 wasm-lean4），否则按 cacheKey 分目录。
    const prefix = manifest.mirror.prefix ?? manifest.cacheKey;
    add(manifest.mirror.label, manifest.mirror.baseUrl, `${prefix}/${asset.name}`, {
      cacheKey: false,
    });
  };

  const addFallback = () => {
    // zstd 资产的 GitHub Release 上游仍是 gzip；字节格式不同，不能当回退源。
    // 这类资产由 Service Worker 直接落到同源静态副本 / 已上传的镜像。
    if (asset.encoding === 'zstd') return;
    add(manifest.fallback.label, manifest.fallback.baseUrl, asset.source);
  };

  if (options.mirrorFirst) addMirror();
  // 诊断用的强制源：GitHub 回退排最前；zstd 资产没有回退源时顺序不变。
  if (options.githubFirst) addFallback();
  add(manifest.primary.label, primaryBaseUrl || manifest.primary.baseUrl, asset.key);
  if (options.includeMirror) addMirror();
  if (!options.githubFirst) addFallback();
  return sources;
};

/** 只有大文件走 Range 分片；小文件由构建脚本直接下载/复制。 */
export const rangedAssets = (manifest) => manifest.assets.filter((asset) => asset.ranged === true);

const MAINLAND_CHINA_TIMEZONES = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Harbin',
  'Asia/Urumqi',
  'Asia/Kashgar',
]);

/**
 * 合并 HTTP Accept-Language 头（若存在）与 Service Worker 侧的 navigator.languages / language。
 * 浏览器发起的子资源 fetch() 在进入 SW 时通常不带 Accept-Language 头，只读头会恒为 null。
 */
export const pickClientLanguages = (headerValue, navigatorLanguages, navigatorLanguage) => {
  const fromHeader = typeof headerValue === 'string' ? headerValue.trim() : '';
  if (fromHeader) return fromHeader;
  if (Array.isArray(navigatorLanguages) && navigatorLanguages.length > 0) {
    const joined = navigatorLanguages.filter(Boolean).join(',').trim();
    if (joined) return joined;
  }
  const single = typeof navigatorLanguage === 'string' ? navigatorLanguage.trim() : '';
  return single || null;
};

/**
 * 判断自动选源时是否应优先走国内镜像：
 * - 浏览器语言列表包含非禁用的中文条目（含中英双语设置），或
 * - 所在时区属于中国大陆（英文系统/英文界面下的国内用户同样走快源）。
 * 只调整源顺序，不做硬路由：两个方向都保留完整回退。
 */
export const prefersDomesticMirror = (acceptLanguage, timeZone) => {
  if (typeof timeZone === 'string' && MAINLAND_CHINA_TIMEZONES.has(timeZone.trim())) {
    return true;
  }
  const entries = (acceptLanguage ?? '').split(',');
  for (const rawEntry of entries) {
    const [rawTag, ...params] = rawEntry.split(';');
    const tag = (rawTag ?? '').trim().toLowerCase();
    if (!tag) continue;
    const disabled = params.some((part) => {
      const normalized = part.replace(/\s+/g, '').toLowerCase();
      return (
        normalized === 'q=0' ||
        normalized === 'q=0.0' ||
        normalized === 'q=0.00' ||
        normalized === 'q=0.000'
      );
    });
    if (disabled) continue;
    if (tag === 'zh' || tag.startsWith('zh-')) return true;
  }
  return false;
};

/* ---------------------------------------------------------------------------
 * 诊断用的强制源开关：页面带 ?source=mirror|cdn|github 时，把对应的源排到最前。
 * 页面写 CacheStorage、Service Worker 读同一份配置——SW 看不到页面 URL，
 * 而 CacheStorage 在同一 origin 两侧都可用，也能跨 SW 重启保留。
 * ------------------------------------------------------------------------- */

/** 可强制的资产源；与 assetSources 的选项一一对应。 */
export const SOURCE_MODES = ['mirror', 'cdn', 'github'];

export const isSourceMode = (value) => value === 'mirror' || value === 'cdn' || value === 'github';

export const SOURCE_PREFERENCE_CACHE = 'lean-source';

export const SOURCE_PREFERENCE_KEY = '/__lean/source-preference';

/**
 * 结合强制源开关、客户端语言与时区，决定本次下载使用的源顺序档位。
 * 抽成纯函数便于单测，避免把分支留给被覆盖率排除的 sw.ts。
 */
export const resolveSourceGroup = (mode, acceptLanguage, timeZone) => {
  if (mode === 'mirror') return 'domestic';
  if (mode === 'cdn') return 'overseas';
  if (mode === 'github') return 'github';
  return prefersDomesticMirror(acceptLanguage, timeZone) ? 'domestic' : 'overseas';
};
