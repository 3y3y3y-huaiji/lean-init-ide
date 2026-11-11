/**
 * Service Worker 的资产组装与多源回退。
 *
 * 从 sw.ts 抽出来，目的是让「主源 → 回退源 → 同源兜底」和响应合成逻辑
 * 可以被 Vitest 直接覆盖；sw.ts 只保留 fetch 事件接线。
 */
import type { AssetSource } from './asset-sources.mjs';

export type RangeDownloader = (
  url: string,
  total: number,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
) => Promise<ArrayBuffer[]>;

export type AssembleOptions = {
  request: Request;
  name: string;
  bytes: number;
  sources: AssetSource[];
  origin: string;
  download: RangeDownloader;
  onProgress?: (loaded: number, total: number, source: AssetSource) => void;
  onFallback: (name: string, message: string) => void;
  fallbackFetch: (request: Request) => Promise<Response>;
};

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** @wasm-idle/lsp 会校验 response.url === request.url，合成响应需要固定回同源地址。 */
export const assembleResponse = async (
  request: Request,
  body: Blob,
  fallbackFetch: (request: Request) => Promise<Response>,
): Promise<Response> => {
  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.size),
      'Accept-Ranges': 'bytes',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });

  try {
    Object.defineProperty(response, 'url', { value: request.url });
    Object.defineProperty(response, 'redirected', { value: false });
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  } catch {
    return fallbackFetch(request);
  }
};

export const loadRangedAsset = async (options: AssembleOptions): Promise<Response> => {
  let lastError: unknown;

  for (const source of options.sources) {
    try {
      // 主源是同源相对路径；显式补上 origin，避免 SW 里相对 URL 的解析差异。
      const remoteUrl = source.url.startsWith('/')
        ? new URL(source.url, options.origin).href
        : source.url;
      const parts = await options.download(
        remoteUrl,
        options.bytes,
        options.request.signal,
        (loaded, total) => options.onProgress?.(loaded, total, source),
      );
      const body = new Blob(parts, { type: 'application/octet-stream' });
      if (body.size !== options.bytes) {
        throw new Error(`assembled ${body.size} bytes, expected ${options.bytes}`);
      }
      return await assembleResponse(options.request, body, options.fallbackFetch);
    } catch (error) {
      if (options.request.signal.aborted) throw error;
      lastError = error;
      options.onFallback(options.name, `${source.label} 不可用：${errorMessage(error)}`);
    }
  }

  options.onFallback(options.name, `远端源均失败，回退同源：${errorMessage(lastError)}`);
  return options.fallbackFetch(options.request);
};
