// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  classifyFiles,
  listFromArray,
  listMismatch,
  parseHunkRanges,
  slugRanges,
  slugsForHunks,
} from './detect-changes.mjs';

const flags = (paths) => {
  const result = classifyFiles(paths);
  return {
    docsOnly: result.docsOnly,
    workflowsOnly: result.workflowsOnly,
    static: result.static,
    test: result.test,
    build: result.build,
    smoke: result.smoke,
    fullLessons: result.fullLessons,
    content: result.content,
    runtime: result.runtime,
    lessons: result.lessons,
    challenges: result.challenges,
    app: result.app,
  };
};

describe('CI 变更分类', () => {
  it('纯文档改动不进 install / build / e2e', () => {
    const result = flags(['docs/ARCHITECTURE.md', 'README.en.md', 'AGENTS.md']);
    expect(result.docsOnly).toBe(true);
    expect(result.static).toBe(false);
    expect(result.test).toBe(false);
    expect(result.build).toBe(false);
    expect(result.smoke).toBe(false);
    expect(result.fullLessons).toBe(false);
  });

  it('纯工作流改动只跑 actionlint', () => {
    const result = flags(['.github/workflows/ci.yml']);
    expect(result.workflowsOnly).toBe(true);
    expect(result.static).toBe(false);
    expect(result.test).toBe(false);
    expect(result.build).toBe(false);
  });

  it('测试文件改动只跑静态检查与单测', () => {
    const result = flags(['src/cdn-range.test.ts']);
    expect(result.static).toBe(true);
    expect(result.test).toBe(true);
    expect(result.build).toBe(false);
    expect(result.smoke).toBe(false);
  });

  it('课程内容改动触发增量课程 E2E，不触发启动冒烟', () => {
    const result = flags(['src/i18n/lessons-zh.ts']);
    expect(result.content).toBe(true);
    expect(result.lessons).toBe(true);
    expect(result.build).toBe(true);
    expect(result.smoke).toBe(false);
    expect(result.fullLessons).toBe(false);
  });

  it('挑战内容改动同样走增量 E2E', () => {
    const result = flags(['src/challenges.ts']);
    expect(result.content).toBe(true);
    expect(result.challenges).toBe(true);
    expect(result.fullLessons).toBe(false);
  });

  it('运行时 / 资产 / LSP 改动才触发全量 E2E 与冒烟', () => {
    for (const path of [
      'src/sw.ts',
      'src/lsp-completion.ts',
      'src/asset-sources.mjs',
      'config/lean4-runtime.json',
      'functions/cdn/[[path]].ts',
      'public/_headers',
    ]) {
      const result = flags([path]);
      expect(result.runtime, path).toBe(true);
      expect(result.smoke, path).toBe(true);
      expect(result.fullLessons, path).toBe(true);
    }
  });

  it('其它应用代码只触发冒烟，不跑课程', () => {
    const result = flags(['src/views/lesson.ts']);
    expect(result.app).toBe(true);
    expect(result.smoke).toBe(true);
    expect(result.fullLessons).toBe(false);
  });

  it('课程目录或加载器变化时回退到全量', () => {
    expect(flags(['src/i18n/lesson-catalog.ts']).fullLessons).toBe(true);
  });

  it('文档混入代码时不再算纯文档', () => {
    expect(flags(['docs/CI.md', 'src/sw.ts']).docsOnly).toBe(false);
  });

  it('空改动按全量处理，宁可多跑不漏跑', () => {
    const result = flags([]);
    expect(result.runtime).toBe(true);
    expect(result.fullLessons).toBe(true);
  });
});

describe('diff 行区间与课程归属', () => {
  it('解析 unified=0 的新文件侧区间', () => {
    expect(parseHunkRanges('@@ -1 +1 @@')).toEqual([{ start: 1, end: 1 }]);
    expect(parseHunkRanges('@@ -10,0 +11,0 @@')).toEqual([{ start: 11, end: 11 }]);
    expect(parseHunkRanges('@@ -5,3 +5,4 @@')).toEqual([{ start: 5, end: 8 }]);
  });

  const source = [
    'export const lessons = [',
    '  {',
    "    slug: 'a',",
    '    code: 1,',
    '  },',
    '  {',
    "    slug: 'b',",
    '    code: 2,',
    '  },',
    '];',
  ].join('\n');

  it('把每个 slug 扩展到所属对象区间', () => {
    expect(slugRanges(source)).toEqual([
      { slug: 'a', start: 2, end: 6 },
      { slug: 'b', start: 6, end: 10 },
    ]);
  });

  it('只命中改动所在的课程', () => {
    expect(slugsForHunks(source, [{ start: 4, end: 4 }])).toEqual({
      slugs: ['a'],
      outside: false,
    });
    expect(slugsForHunks(source, [{ start: 8, end: 8 }])).toEqual({
      slugs: ['b'],
      outside: false,
    });
  });

  it('改动落在对象之外时标记为无法细分', () => {
    expect(slugsForHunks(source, [{ start: 1, end: 1 }])).toEqual({ slugs: [], outside: true });
  });
});

describe('E2E 清单与内容源同步检查', () => {
  const script = [
    'const SLUGS = [',
    "  'a',",
    "  'b',",
    '];',
    'const CHALLENGE_SLUGS = [',
    "  'c',",
    '];',
  ].join('\n');

  it('从数组字面量里取出 slug', () => {
    expect(listFromArray(script, 'SLUGS')).toEqual(['a', 'b']);
    expect(listFromArray(script, 'CHALLENGE_SLUGS')).toEqual(['c']);
    expect(listFromArray(script, 'MISSING')).toBeNull();
  });

  it('两个方向的不一致都要报出来', () => {
    expect(listMismatch(['a', 'b'], ['a', 'b'])).toEqual({
      unknown: false,
      missing: [],
      extra: [],
    });
    expect(listMismatch(['a', 'b', 'd'], ['a', 'b', 'x'])).toEqual({
      unknown: false,
      missing: ['d'],
      extra: ['x'],
    });
    expect(listMismatch(['a'], null)).toEqual({ unknown: true, missing: [], extra: [] });
  });
});
