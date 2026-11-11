import { describe, expect, it } from 'vitest';
import { en } from './en';
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
  });

  it('两种语言都没有空文案', () => {
    expect(emptyPaths(zh, 'zh')).toEqual([]);
    expect(emptyPaths(en, 'en')).toEqual([]);
  });

  it('每节课都有 slug、标题和内容块', () => {
    for (const [name, messages] of [
      ['zh', zh],
      ['en', en],
    ] as const) {
      expect(messages.lesson.lessons.length, name).toBeGreaterThan(0);
      for (const lesson of messages.lesson.lessons) {
        expect(lesson.slug.trim(), name).not.toBe('');
        expect(lesson.title.trim(), name).not.toBe('');
        expect(lesson.blocks.length, name).toBeGreaterThan(0);
      }
    }
  });

  it('两种语言的课时 slug 顺序一致，切换语言不会掉到别的课', () => {
    expect(zh.lesson.lessons.map((lesson) => lesson.slug)).toEqual(
      en.lesson.lessons.map((lesson) => lesson.slug),
    );
  });

  it('slug 全站唯一', () => {
    for (const [name, messages] of [
      ['zh', zh],
      ['en', en],
    ] as const) {
      const slugs = messages.lesson.lessons.map((lesson) => lesson.slug);
      expect(new Set(slugs).size, name).toBe(slugs.length);
    }
  });
});
