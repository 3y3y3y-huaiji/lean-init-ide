/**
 * Lean 运行时资产下载器（Service Worker）。
 *
 * Cloudflare Pages 的静态资源不处理 Range，所以 102MB 的 Lean 运行时按
 * Accept-Language 选择首选源：中文环境先走魔搭（ModelScope）镜像，其他环境
 * 先走站点同源的 /cdn/ 网关（Pages Function → R2 binding）；任一源失败都按
 * 顺序回退到另一个源，最后回退到同源全量请求。
 * 每个大文件切成 4MB 分片，按预期字节数校验后合成一个同源响应交还给 Lean 加载器。
 *
 * 资产清单与分发源来自 config/lean4-runtime.json + src/asset-sources.mjs，
 * 与 Pages Functions、构建脚本 scripts/fetch-assets.mjs 共用同一份定义。
 *
 * 构建期由 `npm run build:sw` 编译为 public/sw.js，仓库里不保留手写 JS。
 */
import manifestJson from '../config/lean4-runtime.json';
import wasm64ManifestJson from '../config/lean4-wasm64-runtime.json';
import {
  assetSources,
  isSourceMode,
  pickClientLanguages,
  rangedAssets,
  resolveSourceGroup,
  SOURCE_PREFERENCE_CACHE,
  SOURCE_PREFERENCE_KEY,
  type AssetSource,
  type RuntimeManifest,
  type SourceMode,
} from './asset-sources.mjs';
import { downloadRanges, downloadStream } from './sw-download';
import { loadRangedAsset } from './sw-assemble';
import { createAssetNotifyGate, createProgressTracker } from './sw-progress';

const manifest = manifestJson as unknown as RuntimeManifest;
const wasm64Manifest = wasm64ManifestJson as unknown as RuntimeManifest;

type RangeAsset = {
  bytes: number;
  /** 中文环境：魔搭优先，R2 → 同源兜底。 */
  domestic: AssetSource[];
  /** 其他环境：R2 优先，魔搭 → 同源兜底。 */
  overseas: AssetSource[];
  /** 诊断（?source=github）：GitHub 回退排最前；zstd 资产会跳过，顺序不变。 */
  github: AssetSource[];
};

const buildRangeAssets = (source: RuntimeManifest): Map<string, RangeAsset> =>
  new Map<string, RangeAsset>(
    rangedAssets(source).map((asset) => [
      asset.name,
      {
        bytes: asset.bytes,
        domestic: assetSources(source, asset, undefined, { mirrorFirst: true }),
        overseas: assetSources(source, asset, undefined, { includeMirror: true }),
        github: assetSources(source, asset, undefined, { githubFirst: true }),
      },
    ]),
  );

const RANGE_ASSETS = buildRangeAssets(manifest);

/**
 * 实验性 wasm64 运行时：独立清单、独立路径前缀 /wasm-lean4-64/，
 * 与稳定的 wasm32 资产互不影响（清单为空时这张表也是空的，行为不变）。
 */
const WASM64_PREFIX = '/wasm-lean4-64/';
const RANGE_ASSETS_64 = buildRangeAssets(wasm64Manifest);

const sumBytes = (assets: Map<string, RangeAsset>): number =>
  [...assets.values()].reduce((sum, asset) => sum + asset.bytes, 0);

const RANGE_TOTAL_BYTES = sumBytes(RANGE_ASSETS);

// 浏览器按资产发请求；这里累计已下载字节，给页面一个不会回跳的总进度。
const progressTracker = createProgressTracker(RANGE_TOTAL_BYTES);
const progressTracker64 = createProgressTracker(sumBytes(RANGE_ASSETS_64));

// 运行时预取同时下载 6 个资产，每个资产再并发分片，所以这里的并发是全局并发的乘数。
// 4MiB 对齐魔搭 CDN 的缓存块；实测 12–24 条流就到吞吐平台（约 400–500Mbps 链路），
// 36 条不再更快。取 4 → 最多 24 条流，兼顾冷启动和内存占用。单分片 120s 预算
//（4MiB 只需 35KB/s），预算耗尽后自动二分重试，慢片不会让整个资产重下。
const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_PARALLEL = 4;
const RETRIES = 3;
const CHUNK_TIMEOUT_MS = 120_000;
const MIN_SPLIT_BYTES = 1 * 1024 * 1024;
const MAX_SPLIT_DEPTH = 2;

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => {
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});

/**
 * 页面通过 ?source= 写的强制源。SW 读不到页面 URL，所以页面把选择放进 CacheStorage，
 * 这里启动后读一次并缓存在内存；SW 被回收重启后仍能恢复。
 */
let forcedMode: SourceMode | null | undefined;

const readForcedMode = async (): Promise<SourceMode | null> => {
  if (forcedMode !== undefined) return forcedMode;
  try {
    const cache = await caches.open(SOURCE_PREFERENCE_CACHE);
    const hit = await cache.match(SOURCE_PREFERENCE_KEY);
    const value = hit ? (await hit.text()).trim() : '';
    forcedMode = isSourceMode(value) ? value : null;
  } catch {
    forcedMode = null;
  }
  return forcedMode;
};

sw.addEventListener('message', (event) => {
  const data = event.data as { type?: string; mode?: unknown };
  if (data?.type !== 'lean-source-mode') return;
  const next = typeof data.mode === 'string' ? data.mode : null;
  forcedMode = isSourceMode(next) ? next : null;
});

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  const is64 = url.pathname.startsWith(WASM64_PREFIX);
  if (!is64 && !url.pathname.startsWith('/wasm-lean4/')) return;

  const rangeAssets = is64 ? RANGE_ASSETS_64 : RANGE_ASSETS;
  const tracker = is64 ? progressTracker64 : progressTracker;
  const name = url.pathname.slice((is64 ? WASM64_PREFIX : '/wasm-lean4/').length);
  const asset = rangeAssets.get(name);
  if (!asset) return;

  const acceptLanguage = pickClientLanguages(
    request.headers.get('accept-language'),
    sw.navigator?.languages,
    sw.navigator?.language,
  );
  let timeZone: string | null = null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timeZone = null;
  }

  // respondWith 必须在事件同步阶段调用；强制源要读 CacheStorage，放到 promise 里再解析。
  event.respondWith(
    (async () => {
      const mode = await readForcedMode();
      const sources = asset[resolveSourceGroup(mode, acceptLanguage, timeZone)];

      return loadRangedAsset({
        request,
        name,
        bytes: asset.bytes,
        sources,
        origin: sw.location.origin,
        download: (url, total, signal, onProgress) => {
          const sameOrigin = new URL(url, sw.location.origin).origin === sw.location.origin;
          if (!sameOrigin) {
            return downloadStream({
              url,
              total,
              timeoutMs: Math.max(CHUNK_TIMEOUT_MS * 4, 120_000),
              retries: RETRIES,
              signal,
              onProgress: ({ loaded }) => onProgress(loaded, total),
            });
          }
          return downloadRanges({
            url,
            total,
            chunkBytes: CHUNK_BYTES,
            parallel: MAX_PARALLEL,
            timeoutMs: CHUNK_TIMEOUT_MS,
            retries: RETRIES,
            minSplitBytes: MIN_SPLIT_BYTES,
            maxSplitDepth: MAX_SPLIT_DEPTH,
            signal,
            onProgress: ({ loaded }) => onProgress(loaded, total),
          });
        },
        onProgress: (loaded, total, source) =>
          void notify(tracker, is64, name, loaded, total, source.label),
        onFallback: notifyFallback,
        fallbackFetch: (request) => fetch(request),
      });
    })(),
  );
});

const shouldNotifyAsset = createAssetNotifyGate(100);

async function notify(
  tracker: ReturnType<typeof createProgressTracker>,
  is64: boolean,
  name: string,
  loaded: number,
  total: number,
  source: string,
): Promise<void> {
  const overall = tracker.record(name, loaded);

  // 分片内进度按资产各自节流；单资产或全局完成消息必须放行，否则进度条可能停在 99%。
  const done = loaded >= total || overall.loaded >= overall.total;
  if (!shouldNotifyAsset(`${is64 ? '64:' : ''}${name}`, Date.now(), done)) return;

  const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    (client as WindowClient).postMessage({
      type: 'lean-asset-progress',
      arch: is64 ? 'wasm64' : 'wasm32',
      name,
      loaded,
      total,
      overallLoaded: overall.loaded,
      overallTotal: overall.total,
      source,
    });
  }
}

function notifyFallback(name: string, message: string): void {
  void (async () => {
    const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      (client as WindowClient).postMessage({ type: 'lean-asset-fallback', name, message });
    }
  })();
}
