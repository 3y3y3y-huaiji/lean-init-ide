/**
 * 把文件总字节数切成 Range 请求需要的闭区间。
 * 单独放一个模块，方便测试边界（整除、余数、空文件）。
 */
export type ByteRange = [start: number, end: number];

export const buildRanges = (total: number, chunkBytes: number): ByteRange[] => {
  if (!Number.isSafeInteger(total) || total <= 0) return [];
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error('chunkBytes must be a positive safe integer');
  }

  const ranges: ByteRange[] = [];
  for (let start = 0; start < total; start += chunkBytes) {
    ranges.push([start, Math.min(start + chunkBytes - 1, total - 1)]);
  }
  return ranges;
};
