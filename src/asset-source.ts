/**
 * `?source=` 是给国内网络排查用的临时开关：把首选资产源强制成魔搭 / 同源网关 / GitHub。
 *
 * Service Worker 看不到页面 URL，而 CacheStorage 在同一 origin 的页面与 SW 两侧都可读写，
 * 也能跨 SW 重启保留；再补一次 postMessage，让已经运行的 SW 立刻切换而不必重载。
 */
import { isSourceMode, SOURCE_PREFERENCE_CACHE, SOURCE_PREFERENCE_KEY } from './asset-sources.mjs';

export type AssetSourcePreference = 'cdn' | 'mirror' | 'github' | null;

/** 写入（或清除）强制资产源，并通知已经运行的 Service Worker。 */
export const setSourcePreference = async (mode: AssetSourcePreference): Promise<void> => {
  const valid = mode !== null && isSourceMode(mode);
  try {
    const cache = await caches.open(SOURCE_PREFERENCE_CACHE);
    if (valid) {
      await cache.put(SOURCE_PREFERENCE_KEY, new Response(mode));
    } else {
      await cache.delete(SOURCE_PREFERENCE_KEY);
    }
    navigator.serviceWorker?.controller?.postMessage({
      type: 'lean-source-mode',
      mode: valid ? mode : null,
    });
  } catch {
    // 隐私模式或非安全上下文没有 CacheStorage：诊断开关失效，但不影响正常使用。
  }
};

export const applySourcePreference = async (search: string): Promise<void> => {
  const raw = new URLSearchParams(search).get('source');
  if (raw === null) return;
  await setSourcePreference(isSourceMode(raw) ? (raw as AssetSourcePreference) : null);
};
