import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHALLENGE_PROGRESS_KEY,
  ChallengeProgressStore,
  emptyChallengeRecord,
  exportChallengeProgressJson,
  importChallengeProgressJson,
  parseChallengeProgress,
  type ChallengeProgressBackend,
} from './challenge-progress';

const memoryBackend = (
  initial: string | null = null,
): ChallengeProgressBackend & { value: () => string | null } => {
  let value = initial;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
    value: () => value,
  };
};

const payload = (challenges: Record<string, unknown>) => JSON.stringify({ version: 1, challenges });

describe('ChallengeProgressStore', () => {
  it('未通关时返回空记录', () => {
    const store = new ChallengeProgressStore(memoryBackend());
    expect(store.get('add-comm')).toEqual(emptyChallengeRecord());
    expect(store.isSolved('add-comm')).toBe(false);
    expect(store.badges('add-comm')).toEqual([]);
    expect(store.tiers('add-comm')).toEqual([]);
    expect(store.bestChars('add-comm')).toBeNull();
  });

  it('通关后累计勋章、悬赏层数并保留最短字符数', () => {
    const backend = memoryBackend();
    const store = new ChallengeProgressStore(backend);

    expect(
      store.recordRun('collatz-bounty', {
        badges: ['automation'],
        tiers: ['bronze'],
        codeChars: 120,
      }),
    ).toEqual({
      solved: true,
      badges: ['automation'],
      tiers: ['bronze'],
      bestChars: 120,
    });

    const merged = store.recordRun('collatz-bounty', {
      badges: ['automation', 'handcrafted'],
      tiers: ['bronze', 'silver'],
      codeChars: 90,
    });
    expect(merged.badges).toEqual(['automation', 'handcrafted']);
    expect(merged.tiers).toEqual(['bronze', 'silver']);
    expect(merged.bestChars).toBe(90);

    const longer = store.recordRun('collatz-bounty', {
      badges: ['term-mode'],
      codeChars: 200,
    });
    expect(longer.bestChars).toBe(90);
    expect(longer.tiers).toEqual(['bronze', 'silver']);

    const reopened = new ChallengeProgressStore(backend);
    expect(reopened.get('collatz-bounty')).toEqual(longer);
  });

  it('统计已通关数量与三类勋章累计数，并忽略未知 slug', () => {
    const store = new ChallengeProgressStore(
      memoryBackend(
        payload({
          'add-comm': { solved: true, badges: ['handcrafted'], tiers: [], bestChars: 10 },
          'double-induction': {
            solved: true,
            badges: ['automation', 'term-mode'],
            tiers: [],
            bestChars: 20,
          },
          'not-solved': { solved: false, badges: ['automation'], tiers: [], bestChars: null },
          broken: 'not-an-object',
        }),
      ),
    );

    expect(store.summary(['add-comm', 'double-induction', 'not-solved', 'missing'])).toEqual({
      solved: 2,
      badges: { automation: 2, handcrafted: 1, 'term-mode': 1 },
    });
  });

  it('快照、替换与清空', () => {
    const backend = memoryBackend();
    const store = new ChallengeProgressStore(backend);
    store.recordRun('add-comm', { badges: ['automation'], codeChars: 8 });

    expect(store.snapshot().challenges['add-comm']?.bestChars).toBe(8);
    store.replace({
      version: 1,
      challenges: {
        'clamp-contract': { solved: true, badges: [], tiers: [], bestChars: 3 },
      },
    });
    expect(store.isSolved('clamp-contract')).toBe(true);
    expect(store.isSolved('add-comm')).toBe(false);

    store.clear();
    expect(store.snapshot()).toEqual({ version: 1, challenges: {} });
    expect(JSON.parse(backend.value() ?? '{}')).toEqual({ version: 1, challenges: {} });
  });
});

describe('parseChallengeProgress', () => {
  it('解析合法数据并净化非法字段', () => {
    const parsed = parseChallengeProgress(
      payload({
        'add-comm': {
          solved: true,
          badges: ['automation', 'automation', 'nope', 3],
          tiers: ['bronze', 'bronze', 'diamond'],
          bestChars: 12.9,
        },
        'double-induction': {
          solved: false,
          badges: 'not-an-array',
          tiers: null,
          bestChars: -1,
        },
        'term-mode': { solved: true, badges: [], tiers: [], bestChars: Number.POSITIVE_INFINITY },
        '': { solved: true },
      }),
    );

    expect(parsed).toEqual({
      version: 1,
      challenges: {
        'add-comm': { solved: true, badges: ['automation'], tiers: ['bronze'], bestChars: 12 },
        'double-induction': { solved: false, badges: [], tiers: [], bestChars: null },
        'term-mode': { solved: true, badges: [], tiers: [], bestChars: null },
      },
    });
  });

  it('结构错误时返回 null', () => {
    expect(parseChallengeProgress('not json')).toBeNull();
    expect(parseChallengeProgress('null')).toBeNull();
    expect(parseChallengeProgress('[]')).toBeNull();
    expect(parseChallengeProgress('{}')).toBeNull();
    expect(parseChallengeProgress(JSON.stringify({ challenges: [] }))).toBeNull();
    expect(parseChallengeProgress(JSON.stringify({ challenges: null }))).toBeNull();
  });
});

describe('备份导入导出', () => {
  it('导出与导入可以往返恢复全部战绩', () => {
    const backend = memoryBackend();
    const store = new ChallengeProgressStore(backend);
    store.recordRun('goldbach-bounty', {
      badges: ['automation', 'term-mode'],
      tiers: ['bronze', 'silver'],
      codeChars: 321,
    });

    const json = exportChallengeProgressJson(store);
    expect(JSON.parse(json)).toEqual(store.snapshot());

    const target = new ChallengeProgressStore(memoryBackend());
    expect(importChallengeProgressJson(json, target)).toBe(true);
    expect(target.get('goldbach-bounty')).toEqual(store.get('goldbach-bounty'));
  });

  it('导入非法 JSON 时返回 false 且不覆盖现有战绩', () => {
    const store = new ChallengeProgressStore(memoryBackend());
    store.recordRun('add-comm', { badges: ['handcrafted'], codeChars: 50 });

    expect(importChallengeProgressJson('{oops', store)).toBe(false);
    expect(store.bestChars('add-comm')).toBe(50);
  });

  it('默认使用 localStorage：正常读写与异常都安全降级', () => {
    localStorage.clear();
    expect(importChallengeProgressJson(exportChallengeProgressJson())).toBe(true);
    expect(localStorage.getItem(CHALLENGE_PROGRESS_KEY)).toContain('"version":1');

    const readSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const writeSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const store = new ChallengeProgressStore();
    expect(store.snapshot()).toEqual({ version: 1, challenges: {} });
    expect(() =>
      store.recordRun('add-comm', { badges: ['automation'], codeChars: 4 }),
    ).not.toThrow();
    expect(importChallengeProgressJson('bad')).toBe(false);
    readSpy.mockRestore();
    writeSpy.mockRestore();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
