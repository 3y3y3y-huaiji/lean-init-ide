import { describe, expect, it } from 'vitest';
import { parseRangeHeader } from './cdn-range';

describe('parseRangeHeader', () => {
  it('returns null when there is no Range header', () => {
    expect(parseRangeHeader(null, 100)).toBeNull();
  });

  it('parses a closed byte range', () => {
    expect(parseRangeHeader('bytes=0-15', 100)).toEqual({ start: 0, end: 15 });
  });

  it('parses an open-ended range and clamps it to the last byte', () => {
    expect(parseRangeHeader('bytes=100-', 200)).toEqual({ start: 100, end: 199 });
  });

  it('clamps an over-long end to the object size', () => {
    expect(parseRangeHeader('bytes=0-999999', 20)).toEqual({ start: 0, end: 19 });
  });

  it('rejects multi-range, malformed and impossible ranges', () => {
    expect(parseRangeHeader('bytes=0-1,3-4', 100)).toBeNull();
    expect(parseRangeHeader('items=0-1', 100)).toBeNull();
    expect(parseRangeHeader('bytes=20-10', 100)).toBeNull();
    expect(parseRangeHeader('bytes=100-120', 100)).toBeNull();
    expect(parseRangeHeader('bytes=0-1', 0)).toBeNull();
  });

  it('matches the 4 MB chunks produced by buildRanges', () => {
    const total = 20239874;
    const chunk = 4 * 1024 * 1024;
    for (let start = 0; start < total; start += chunk) {
      const end = Math.min(start + chunk - 1, total - 1);
      expect(parseRangeHeader(`bytes=${start}-${end}`, total)).toEqual({ start, end });
    }
  });
});
