/**
 * 展开 Chrome pthread / Worker 抛出的嵌套 ErrorEvent，避免最终日志退化成 `[object ErrorEvent]`。
 * 保留底层 `RangeError: Maximum call stack size exceeded` 等堆栈或 message，供崩溃恢复识别。
 */
export const formatWorkerError = (
  error: unknown,
  fallbackMessage = 'Lean wasm64 worker error.',
): string => {
  let current: unknown = error;
  let bestMessage: string | undefined;
  for (let depth = 0; depth < 6 && current !== null && current !== undefined; depth += 1) {
    if (typeof current === 'string') {
      if (current.trim() !== '') bestMessage ??= current;
      break;
    }
    if (typeof current !== 'object') break;
    const candidate = current as { stack?: unknown; message?: unknown; error?: unknown };
    if (typeof candidate.stack === 'string' && candidate.stack.trim() !== '') {
      return candidate.stack;
    }
    if (typeof candidate.message === 'string' && candidate.message.trim() !== '') {
      bestMessage = candidate.message;
    }
    if (!('error' in candidate) || candidate.error === current) break;
    current = candidate.error;
  }
  if (bestMessage) return bestMessage;
  if (fallbackMessage.trim() !== '') return fallbackMessage;
  return 'Lean wasm64 worker error.';
};
