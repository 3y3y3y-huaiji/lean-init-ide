import { describe, expect, it } from 'vitest';
import e2eLessonsSource from '../../scripts/e2e-lessons.mjs?raw';
import { en } from './en';
import { LESSON_CATALOG } from './lesson-catalog';
import { lessonsEn } from './lessons-en';
import { lessonsZh } from './lessons-zh';
import { zh } from './zh';

type Shape = string | Shape[] | { [key: string]: Shape };

/**
 * 把字典压成「键 + 值类型」的形状。
 * 函数只保留参数个数，这样译文不同也不会误报，但漏翻或改签名会立刻暴露。
 */
const shapeOf = (value: unknown): Shape => {
  if (typeof value === 'function') return `fn/${(value as (...args: unknown[]) => unknown).length}`;
  if (Array.isArray(value)) return value.map(shapeOf);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, shapeOf(record[key])]),
    );
  }
  return typeof value;
};

const emptyPaths = (value: unknown, path = ''): string[] => {
  if (typeof value === 'string') return value.trim() === '' ? [path] : [];
  if (Array.isArray(value))
    return value.flatMap((item, index) => emptyPaths(item, `${path}[${index}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      emptyPaths(child, path ? `${path}.${key}` : key),
    );
  }
  return [];
};

describe('i18n 字典结构对齐', () => {
  it('en 与 zh 的键集合、数组长度与函数签名完全一致', () => {
    expect(shapeOf(en)).toEqual(shapeOf(zh));
    expect(shapeOf(lessonsEn)).toEqual(shapeOf(lessonsZh));
  });

  it('两种语言都没有空文案', () => {
    expect(emptyPaths(zh, 'zh')).toEqual([]);
    expect(emptyPaths(en, 'en')).toEqual([]);
    expect(emptyPaths(lessonsZh, 'lessonsZh')).toEqual([]);
    expect(emptyPaths(lessonsEn, 'lessonsEn')).toEqual([]);
  });

  it('每节课都有 slug、标题和内容块', () => {
    for (const [name, lessons] of [
      ['zh', lessonsZh],
      ['en', lessonsEn],
    ] as const) {
      expect(lessons.length, name).toBeGreaterThan(0);
      for (const lesson of lessons) {
        expect(lesson.slug.trim(), name).not.toBe('');
        expect(lesson.title.trim(), name).not.toBe('');
        expect(lesson.blocks.length, name).toBeGreaterThan(0);
      }
    }
  });

  it('两种语言的课时 slug 顺序与 LESSON_CATALOG 一致，切换语言不会掉到别的课', () => {
    expect(lessonsZh.map((lesson) => lesson.slug)).toEqual(lessonsEn.map((lesson) => lesson.slug));
    expect(LESSON_CATALOG).toEqual(
      lessonsZh.map((lesson) => ({ slug: lesson.slug, track: lesson.track ?? 'intro' })),
    );
  });

  it('slug 全站唯一', () => {
    for (const [name, lessons] of [
      ['zh', lessonsZh],
      ['en', lessonsEn],
    ] as const) {
      const slugs = lessons.map((lesson) => lesson.slug);
      expect(new Set(slugs).size, name).toBe(slugs.length);
    }
  });

  it('e2e-lessons 脚本包含全部课程 slug', () => {
    const expectedSlugs = lessonsZh.map((lesson) => lesson.slug);

    const match = /const SLUGS = \[([\s\S]*?)\];/.exec(e2eLessonsSource);
    expect(match).not.toBeNull();
    const e2eSlugs = Array.from(match![1]!.matchAll(/'([^']+)'/g), (m) => m[1]!);
    expect(e2eSlugs).toEqual(expectedSlugs);
  });
});
