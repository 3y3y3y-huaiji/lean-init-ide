// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pickSlugs, selectShard } from './e2e-lessons.mjs';

const items = Array.from({ length: 7 }, (_, index) => index);

describe('课程 E2E 分片', () => {
  it('各分片合并后覆盖全部条目且互不重复', () => {
    const merged = [1, 2, 3].flatMap((shard) => selectShard(items, shard, 3));
    expect(merged).toHaveLength(items.length);
    expect(new Set(merged).size).toBe(items.length);
  });

  it('各分片条目数最多相差 1', () => {
    const counts = [1, 2, 3].map((shard) => selectShard(items, shard, 3).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('分片数大于条目数时多余分片为空，且不分片时保持原顺序', () => {
    expect(selectShard(items, 9, 12)).toEqual([]);
    expect(selectShard(items, 1, 1)).toEqual(items);
  });
});

describe('增量课程筛选', () => {
  const all = ['math-parity', 'eng-hashmap', 'eng-bitvec'];

  it('未设置筛选时跑全部，保持课程顺序', () => {
    expect(pickSlugs(all, undefined)).toEqual({ slugs: all, unknown: [] });
  });

  it('`-` 表示本次没有改动，跳过全部条目', () => {
    expect(pickSlugs(all, '-')).toEqual({ slugs: [], unknown: [] });
  });

  it('只保留命中的课程，并按原顺序排列', () => {
    expect(pickSlugs(all, 'eng-bitvec,math-parity')).toEqual({
      slugs: ['math-parity', 'eng-bitvec'],
      unknown: [],
    });
  });

  it('未知 slug 会报出来，避免增量门禁假通过', () => {
    expect(pickSlugs(all, 'math-parity,not-a-lesson')).toEqual({
      slugs: ['math-parity'],
      unknown: ['not-a-lesson'],
    });
  });
});
