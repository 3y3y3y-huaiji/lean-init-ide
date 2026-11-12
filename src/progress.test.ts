import { describe, expect, it } from 'vitest';
import { firstUnvisitedLesson, markLessonVisited, readProgress } from './progress';

describe('progress', () => {
  it('初始没有进度', () => {
    expect([...readProgress()]).toEqual([]);
  });

  it('记录已读课时且不重复写入', () => {
    markLessonVisited('first-proof');
    markLessonVisited('first-proof');
    markLessonVisited('implication');
    expect([...readProgress()].sort()).toEqual(['first-proof', 'implication']);
  });

  it('遇到破损数据时当作没有进度', () => {
    localStorage.setItem('lean:progress', '{not json');
    expect([...readProgress()]).toEqual([]);
    localStorage.setItem('lean:progress', JSON.stringify(['ok', 42, null]));
    expect([...readProgress()]).toEqual(['ok']);
  });

  it('返回第一节未读课，全部读完时回到第一节', () => {
    const slugs = ['a', 'b', 'c'];
    expect(firstUnvisitedLesson(slugs, new Set())).toBe('a');
    expect(firstUnvisitedLesson(slugs, new Set(['a']))).toBe('b');
    expect(firstUnvisitedLesson(slugs, new Set(['a', 'b', 'c']))).toBe('a');
    expect(firstUnvisitedLesson([], new Set())).toBeUndefined();
  });
});
