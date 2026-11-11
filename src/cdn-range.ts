/**
 * 解析 HTTP Range 头，只接受单个 bytes 区间（Service Worker 的分片格式）。
 * 单独放成纯模块，便于单测边界，也让 Pages Function 与前端共用同一套语义。
 */
export type ByteRange = { start: number; end: number };

export const parseRangeHeader = (header: string | null, size: number): ByteRange | null => {
  if (header === null) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start ||
    size <= 0
  ) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
};
