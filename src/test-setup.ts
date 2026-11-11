/**
 * jsdom 不实现 matchMedia，而 theme 模块在加载时就会调用一次。
 * 这里补一个最小实现，让依赖 theme 的测试不必各自打桩。
 * 个别测试用 `@vitest-environment node`（例如 Response/Blob 语义更接近浏览器），
 * 没有 window 时直接跳过。
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
