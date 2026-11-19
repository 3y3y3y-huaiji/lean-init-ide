/**
 * 实验性 wasm64 运行时的资产加载：经同源网关取清单里登记的资产，逐个校验字节数与
 * SHA-256，解 zstd，再编译 wasm。清单为空（尚未发布）时调用方应保持 wasm32。
 *
 * 分发路径：
 * - 大文件（ranged）：优先走 Service Worker 的 /wasm-lean4-64/<name>（按语言/时区选魔搭镜像或同源 /cdn/，4 MiB 分片 + 校验）；
 * - 小文件（glue / index）及 SW 未接管时的兜底：复用 assetSources()，国内优先魔搭镜像，海外优先同源 /cdn/ 网关。
 * GitHub Release 没有 CORS 头，浏览器侧不会请求它。
 */
import manifestJson from '../config/lean4-wasm64-runtime.json';
import {
  assetSources,
  pickClientLanguages,
  prefersDomesticMirror,
  type RuntimeAsset,
  type RuntimeManifest,
} from './asset-sources.mjs';

export type Wasm64Asset = {
  readonly name: string;
  readonly key: string;
  readonly source?: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly contentType?: string;
  readonly ranged?: boolean;
  readonly encoding?: 'zstd';
  readonly uncompressedBytes?: number;
  readonly uncompressedSha256?: string;
};

export type Wasm64Manifest = {
  readonly cacheKey: string;
  readonly leanVersion: string;
  readonly runtime: string;
  readonly primary?: { readonly label: string; readonly baseUrl: string };
  readonly fallback?: { readonly label: string; readonly baseUrl: string };
  readonly mirror?: { readonly label: string; readonly baseUrl: string; readonly prefix?: string };
  readonly assets: readonly Wasm64Asset[];
};

export const wasm64Manifest = manifestJson as unknown as Wasm64Manifest;

/** 清单里没有资产 = 还没发布；此时切到 wasm64 只会回退 wasm32，绝不伪造数据。 */
export const isWasm64Published = (manifest: Wasm64Manifest = wasm64Manifest): boolean =>
  manifest.assets.length > 0;

export const WASM64_GLUE = 'lean-lsp-adapted.mjs';
export const WASM64_WASM = 'lean-lsp.wasm.zst';
export const WASM64_INDEX = 'lean-init-64.index.json';

export type ZstdDecoder = { decode(bytes: Uint8Array, uncompressedSize: number): Uint8Array };

export type LoadedWasm64Runtime = {
  /** 适配后的 glue（Blob URL），process worker 与 pthread 都从它加载。 */
  readonly glueUrl: string;
  readonly wasmModule: WebAssembly.Module;
  /** index.json 与各 pack（SharedArrayBuffer 承载，多个进程共享不复制）。 */
  readonly library: Record<string, Uint8Array>;
  dispose(): void;
};

export type LoadWasm64Options = {
  readonly manifest?: Wasm64Manifest;
  readonly fetchImpl?: typeof fetch;
  readonly createZstd?: () => Promise<ZstdDecoder>;
  readonly onStage?: (stage: string) => void;
  readonly concurrency?: number;
  /** 单个资产单个源的下载预算；超时后中止并尝试下一个源。 */
  readonly assetTimeoutMs?: number;
};

const DEFAULT_ASSET_TIMEOUT_MS = 60 * 60_000;

const toHex = (digest: ArrayBuffer): string =>
  [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');

const sha256Of = async (bytes: Uint8Array): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));

const defaultZstd = async (): Promise<ZstdDecoder> => {
  const url = new URL('/vendor/zstddec.mjs', globalThis.location.origin).href;
  const { ZSTDDecoder } = (await import(/* @vite-ignore */ url)) as {
    ZSTDDecoder: new () => ZstdDecoder & { init(): Promise<void> };
  };
  const decoder = new ZSTDDecoder();
  await decoder.init();
  return decoder;
};

export const wasm64AssetUrl = (manifest: Wasm64Manifest, asset: Wasm64Asset): string =>
  asset.ranged
    ? `/wasm-lean4-64/${asset.name}?v=${asset.sha256}`
    : `/cdn/${asset.key}?r=${manifest.cacheKey}`;

export const wasm64CdnUrl = (manifest: Wasm64Manifest, asset: Wasm64Asset): string =>
  `/cdn/${asset.key}?r=${manifest.cacheKey}`;

const isDomesticClient = (): boolean => {
  const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } })
    .navigator;
  const languages = pickClientLanguages(undefined, nav?.languages, nav?.language);
  let timeZone: string | null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timeZone = null;
  }
  return prefersDomesticMirror(languages, timeZone);
};

export const wasm64CandidateUrls = (
  manifest: Wasm64Manifest,
  asset: Wasm64Asset,
  domestic: boolean = isDomesticClient(),
): string[] => {
  const urls: string[] = [];
  if (asset.ranged) urls.push(wasm64AssetUrl(manifest, asset));

  const fallbackBase = manifest.fallback?.baseUrl;
  const normalized: RuntimeManifest = {
    revision: manifest.cacheKey,
    cacheKey: manifest.cacheKey,
    runtime: manifest.runtime,
    bucket: '',
    primary: manifest.primary ?? { label: 'Pages Functions (R2)', baseUrl: '/cdn/' },
    fallback: manifest.fallback ?? { label: 'GitHub release', baseUrl: '' },
    ...(manifest.mirror ? { mirror: manifest.mirror } : {}),
    assets: [],
  };
  const resolved = assetSources(
    normalized,
    asset as unknown as RuntimeAsset,
    undefined,
    domestic ? { mirrorFirst: true } : { includeMirror: true },
  );
  for (const source of resolved) {
    // GitHub Release 没有 CORS 响应头，浏览器侧绝不请求。
    if (fallbackBase && source.url.startsWith(fallbackBase)) continue;
    if (!urls.includes(source.url)) urls.push(source.url);
  }
  const cdn = wasm64CdnUrl(manifest, asset);
  if (!urls.includes(cdn)) urls.push(cdn);
  return urls;
};

const openRuntimeCache = async (cacheKey: string): Promise<Cache | null> => {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(`wasm-idle-assets-v1:wasm64:${cacheKey}`);
  } catch {
    return null;
  }
};

const requireAsset = (manifest: Wasm64Manifest, name: string): Wasm64Asset => {
  const asset = manifest.assets.find((candidate) => candidate.name === name);
  if (!asset) throw new Error(`wasm64 清单缺少资产 ${name}`);
  return asset;
};

export const loadWasm64Runtime = async (
  options: LoadWasm64Options = {},
): Promise<LoadedWasm64Runtime> => {
  const manifest = options.manifest ?? wasm64Manifest;
  if (!isWasm64Published(manifest)) {
    throw new Error('wasm64 运行时尚未发布（清单为空）');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = await openRuntimeCache(manifest.cacheKey);
  let zstdPromise: Promise<ZstdDecoder> | undefined;
  const zstd = (): Promise<ZstdDecoder> => (zstdPromise ??= (options.createZstd ?? defaultZstd)());

  const verifyDelivered = async (asset: Wasm64Asset, bytes: Uint8Array): Promise<boolean> =>
    bytes.byteLength === asset.bytes && (await sha256Of(bytes)) === asset.sha256;

  const fetchVerifiedAsset = async (asset: Wasm64Asset): Promise<Uint8Array> => {
    const cdnUrl = wasm64CdnUrl(manifest, asset);
    if (cache) {
      try {
        const hit = await cache.match(cdnUrl);
        if (hit) {
          const cached = new Uint8Array(await hit.arrayBuffer());
          if (await verifyDelivered(asset, cached)) return cached;
          await cache.delete(cdnUrl);
        }
      } catch {
        // CacheStorage 异常不阻断网络下载。
      }
    }

    const errors: string[] = [];
    const assetTimeoutMs = options.assetTimeoutMs ?? DEFAULT_ASSET_TIMEOUT_MS;
    for (const url of wasm64CandidateUrls(manifest, asset)) {
      const sameOrigin = url.startsWith('/');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), assetTimeoutMs);
      try {
        // 魔搭镜像会 302 到 cdn-lfs 域；同源路径仍禁止重定向。
        const response = await fetchImpl(url, {
          redirect: sameOrigin ? 'error' : 'follow',
          signal: controller.signal,
        });
        if (!response.ok) {
          errors.push(`${url}: HTTP ${response.status}`);
          continue;
        }
        if (sameOrigin && (response.headers.get('content-type') ?? '').includes('text/html')) {
          errors.push(`${url}: SPA HTML fallback`);
          continue;
        }
        const delivered = new Uint8Array(await response.arrayBuffer());
        if (delivered.byteLength !== asset.bytes) {
          errors.push(`${url}: length ${delivered.byteLength} != ${asset.bytes}`);
          continue;
        }
        if ((await sha256Of(delivered)) !== asset.sha256) {
          errors.push(`${url}: SHA-256 mismatch`);
          continue;
        }
        if (cache) {
          try {
            await cache.put(
              cdnUrl,
              new Response(delivered as unknown as BodyInit, {
                headers: { 'Content-Type': 'application/octet-stream' },
              }),
            );
          } catch {
            // 配额满或隐私模式写缓存失败时仍正常启动。
          }
        }
        return delivered;
      } catch (error) {
        errors.push(
          controller.signal.aborted
            ? `${url}: timeout after ${assetTimeoutMs}ms`
            : `${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`wasm64 资产 ${asset.name} 所有源均失败: ${errors.join(' | ')}`);
  };

  const download = async (asset: Wasm64Asset): Promise<Uint8Array> => {
    options.onStage?.(asset.name);
    const delivered = await fetchVerifiedAsset(asset);
    if (asset.encoding !== 'zstd') return delivered;

    const expected = asset.uncompressedBytes;
    const expectedHash = asset.uncompressedSha256;
    if (expected === undefined || expectedHash === undefined) {
      throw new Error(`wasm64 资产 ${asset.name} 缺少解压回执`);
    }
    const decoded = (await zstd()).decode(delivered, expected);
    if (decoded.byteLength !== expected || (await sha256Of(decoded)) !== expectedHash) {
      throw new Error(`wasm64 资产 ${asset.name} 解压后校验失败`);
    }
    return decoded;
  };

  // 受限并发下载；任何一个失败立即整体失败，不使用残缺资产。
  const payload = new Map<string, Uint8Array>();
  const queue = [...manifest.assets];
  const workerCount = Math.max(1, Math.min(options.concurrency ?? 4, queue.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (let asset = queue.shift(); asset; asset = queue.shift()) {
        payload.set(asset.name, await download(asset));
      }
    }),
  );

  const take = (name: string): Uint8Array => {
    const bytes = payload.get(name);
    if (!bytes) throw new Error(`wasm64 资产 ${name} 缺失`);
    payload.delete(name);
    return bytes;
  };

  options.onStage?.('compile');
  const wasmModule = await WebAssembly.compile(take(WASM64_WASM) as BufferSource);
  const glueText = new TextDecoder().decode(take(WASM64_GLUE));
  const glueUrl = URL.createObjectURL(new Blob([glueText], { type: 'text/javascript' }));

  const share = (bytes: Uint8Array): Uint8Array => {
    const shared = new Uint8Array(new SharedArrayBuffer(bytes.byteLength));
    shared.set(bytes);
    return shared;
  };

  const indexAsset = requireAsset(manifest, WASM64_INDEX);
  const indexBytes = take(indexAsset.name);
  const library: Record<string, Uint8Array> = { [WASM64_INDEX]: share(indexBytes) };
  for (const asset of manifest.assets) {
    if (!asset.name.endsWith('.pack.zst.bin')) continue;
    library[asset.name.replace(/\.zst\.bin$/, '')] = share(take(asset.name));
  }

  return {
    glueUrl,
    wasmModule,
    library,
    dispose: () => URL.revokeObjectURL(glueUrl),
  };
};
