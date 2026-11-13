import { describe, expect, it } from 'vitest';
import {
  firstUncompletedLesson,
  firstUnvisitedLesson,
  markLessonCompleted,
  markLessonVisited,
  readCompleted,
  readProgress,
} from './progress';

describe('progress', () => {
  it('初始没有进度', () => {
    expect([...readProgress()]).toEqual([]);
    expect([...readCompleted()]).toEqual([]);
  });

  it('记录已读课时且不重复写入', () => {
    markLessonVisited('first-proof');
    markLessonVisited('first-proof');
    markLessonVisited('implication');
    expect([...readProgress()].sort()).toEqual(['first-proof', 'implication']);
  });

  it('记录完成课时，并同时记为已读', () => {
    markLessonCompleted('first-proof');
    markLessonCompleted('first-proof');
    expect([...readCompleted()]).toEqual(['first-proof']);
    expect(readProgress().has('first-proof')).toBe(true);
  });

  it('遇到破损数据时当作没有进度', () => {
    localStorage.setItem('lean:progress', '{not json');
    localStorage.setItem('lean:progress:completed', '{not json');
    expect([...readProgress()]).toEqual([]);
    expect([...readCompleted()]).toEqual([]);
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

  it('返回第一节未完成课，全部完成时回到第一节', () => {
    const slugs = ['a', 'b', 'c'];
    expect(firstUncompletedLesson(slugs, new Set())).toBe('a');
    expect(firstUncompletedLesson(slugs, new Set(['a']))).toBe('b');
    expect(firstUncompletedLesson(slugs, new Set(['a', 'b', 'c']))).toBe('a');
    expect(firstUncompletedLesson([], new Set())).toBeUndefined();
  });
});
