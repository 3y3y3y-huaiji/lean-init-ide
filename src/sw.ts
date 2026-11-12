/**
 * Lean 运行时资产下载器（Service Worker）。
 *
 * Cloudflare Pages 的静态资源不处理 Range，所以 143MB 的 Lean 运行时按
 * Accept-Language 选择首选源：中文环境先走魔搭（ModelScope）镜像，其他环境
 * 先走站点同源的 /cdn/ 网关（Pages Function → R2 binding）；任一源失败都按
 * 顺序回退到另一个源，最后回退到固定 revision 的 GitHub raw 与同源全量请求。
 * 每个大文件切成 4MB 分片，按预期字节数校验后合成一个同源响应交还给 Lean 加载器。
 *
 * 资产清单与分发源来自 config/lean4-runtime.json + src/asset-sources.mjs，
 * 与 Pages Functions、构建脚本 scripts/fetch-assets.mjs 共用同一份定义。
 *
 * 构建期由 `npm run build:sw` 编译为 public/sw.js，仓库里不保留手写 JS。
 */
import manifestJson from '../config/lean4-runtime.json';
import {
  assetSources,
  prefersDomesticMirror,
  rangedAssets,
  type AssetSource,
  type RuntimeManifest,
} from './asset-sources.mjs';
import { downloadRanges } from './sw-download';
import { loadRangedAsset } from './sw-assemble';
import { createProgressTracker } from './sw-progress';

const manifest = manifestJson as unknown as RuntimeManifest;

type RangeAsset = {
  bytes: number;
  /** 中文环境：魔搭优先，R2 → GitHub 回退。 */
  domestic: AssetSource[];
  /** 其他环境：R2 优先，魔搭 → GitHub 回退。 */
  overseas: AssetSource[];
};

const RANGE_ASSETS = new Map<string, RangeAsset>(
  rangedAssets(manifest).map((asset) => [
    asset.name,
    {
      bytes: asset.bytes,
      domestic: assetSources(manifest, asset, undefined, { mirrorFirst: true }),
      overseas: assetSources(manifest, asset, undefined, { includeMirror: true }),
    },
  ]),
);

const RANGE_TOTAL_BYTES = [...RANGE_ASSETS.values()].reduce((sum, asset) => sum + asset.bytes, 0);

// 浏览器按资产发请求；这里累计已下载字节，给页面一个不会回跳的总进度。
const progressTracker = createProgressTracker(RANGE_TOTAL_BYTES);

// 运行时预取同时下载 6 个资产，每个资产再并发分片，所以这里的并发是全局并发的乘数。
// 4MiB × 6 = 最多 36 条流，是实测吞吐最好的档位；单分片 120s 预算（4MiB 只需 35KB/s），
// 预算耗尽后自动二分重试，慢片不会让整个资产重下。
const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_PARALLEL = 6;
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

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;
  if (!url.pathname.startsWith('/wasm-lean4/')) return;

  const name = url.pathname.slice('/wasm-lean4/'.length);
  const asset = RANGE_ASSETS.get(name);
  if (!asset) return;

  // 每个请求单独判断：同一 SW 可能同时服务不同语言的页面。
  const sources = prefersDomesticMirror(request.headers.get('accept-language'))
    ? asset.domestic
    : asset.overseas;

  event.respondWith(
    loadRangedAsset({
      request,
      name,
      bytes: asset.bytes,
      sources,
      origin: sw.location.origin,
      download: (url, total, signal, onProgress) =>
        downloadRanges({
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
        }),
      onProgress: (loaded, total, source) => void notify(name, loaded, total, source.label),
      onFallback: notifyFallback,
      fallbackFetch: (request) => fetch(request),
    }),
  );
});

async function notify(name: string, loaded: number, total: number, source: string): Promise<void> {
  const overall = progressTracker.record(name, loaded);

  const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    (client as WindowClient).postMessage({
      type: 'lean-asset-progress',
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
