import { describe, expect, it } from 'vitest';
import { buildRanges } from './sw-ranges';

describe('buildRanges', () => {
  it('splits a file into contiguous closed ranges', () => {
    expect(buildRanges(10, 4)).toEqual([
      [0, 3],
      [4, 7],
      [8, 9],
    ]);
  });

  it('keeps the last range aligned to the file size', () => {
    expect(buildRanges(8, 4)).toEqual([
      [0, 3],
      [4, 7],
    ]);
  });

  it('returns a single range for files smaller than the chunk', () => {
    expect(buildRanges(3, 4)).toEqual([[0, 2]]);
  });

  it('returns no ranges for empty input', () => {
    expect(buildRanges(0, 4)).toEqual([]);
    expect(buildRanges(-10, 4)).toEqual([]);
  });

  it('rejects invalid chunk sizes', () => {
    expect(() => buildRanges(10, 0)).toThrow();
    expect(() => buildRanges(10, -1)).toThrow();
  });

  it('covers every byte exactly once', () => {
    const total = 22_633_878;
    const ranges = buildRanges(total, 4 * 1024 * 1024);
    const covered = ranges.reduce((sum, [start, end]) => sum + (end - start + 1), 0);
    expect(covered).toBe(total);
    expect(ranges[0]?.[0]).toBe(0);
    expect(ranges[ranges.length - 1]?.[1]).toBe(total - 1);
  });
});
