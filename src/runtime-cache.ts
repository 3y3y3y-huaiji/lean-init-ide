/**
 * 清理 Lean 运行时资产缓存。
 *
 * 运行时字节由 @wasm-idle/core 的持久缓存放在 CacheStorage 的
 * `wasm-idle-assets-v1:<namespace>` 里；这里只删这些命名空间，避免把
 * 站点自己的 `lean-source` 等偏好设置一起清掉。IndexedDB 里只是元数据，
 * 下次读取发现 body 缺失会自动移除并重新下载，不需要在这里阻塞等待删库。
 */
const RUNTIME_CACHE_PREFIX = 'wasm-idle-assets-v1:';

export const clearRuntimeCache = async (): Promise<void> => {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(RUNTIME_CACHE_PREFIX))
      .map((name) => caches.delete(name)),
  );
};
