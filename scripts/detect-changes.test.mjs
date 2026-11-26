// @vitest-environment node
import { readFileSync } from 'node:fs';
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
    deps: result.deps,
    build: result.build,
    ui: result.ui,
    smoke: result.smoke,
    fullLessons: result.fullLessons,
    content: result.content,
    runtime: result.runtime,
    lessons: result.lessons,
    challenges: result.challenges,
    app: result.app,
    deployable: result.deployable,
    canaryLesson: result.canaryLesson,
    canaryChallenge: result.canaryChallenge,
  };
};

describe('CI 变更分类', () => {
  it('纯文档改动不进 install / build / e2e，也不触发部署', () => {
    const result = flags([
      'docs/ARCHITECTURE.md',
      'README.en.md',
      'AGENTS.md',
      'src/i18n/AGENTS.md',
      'scripts/AGENTS.md',
    ]);
    expect(result.docsOnly).toBe(true);
    expect(result.static).toBe(false);
    expect(result.test).toBe(false);
    expect(result.deps).toBe(false);
    expect(result.build).toBe(false);
    expect(result.ui).toBe(false);
    expect(result.smoke).toBe(false);
    expect(result.fullLessons).toBe(false);
    expect(result.deployable).toBe(false);
  });

  it('改动 docs 校验或分类脚本会触发静态检查与单测，但不触发构建和部署', () => {
    const result = flags(['scripts/verify-docs.mjs']);
    expect(result.docsOnly).toBe(false);
    expect(result.static).toBe(true);
    expect(result.test).toBe(true);
    expect(result.build).toBe(false);
    expect(result.deployable).toBe(false);
  });

  it('纯工作流改动只跑 actionlint，不触发部署', () => {
    const result = flags(['.github/workflows/ci.yml']);
    expect(result.workflowsOnly).toBe(true);
    expect(result.static).toBe(false);
    expect(result.test).toBe(false);
    expect(result.build).toBe(false);
    expect(result.ui).toBe(false);
    expect(result.deployable).toBe(false);
  });

  it('测试文件改动只跑静态检查与单测，不触发部署', () => {
    const result = flags(['src/cdn-range.test.ts']);
    expect(result.static).toBe(true);
    expect(result.test).toBe(true);
    expect(result.build).toBe(false);
    expect(result.ui).toBe(false);
    expect(result.smoke).toBe(false);
    expect(result.deployable).toBe(false);
  });

  it('纯 UI / 样式 / 文案改动走轻量多视口 UI E2E，不启动 102MB WASM 冒烟', () => {
    for (const path of [
      'src/index.css',
      'src/views/home.ts',
      'src/views/layout.ts',
      'src/i18n/zh.ts',
      'src/i18n/en.ts',
      'src/i18n/lessons-en.ts',
      'scripts/generate-seo.mjs',
    ]) {
      const result = flags([path]);
      expect(result.build, path).toBe(true);
      expect(result.ui, path).toBe(true);
      expect(result.smoke, path).toBe(false);
      expect(result.fullLessons, path).toBe(false);
      expect(result.deps, path).toBe(false);
      expect(result.deployable, path).toBe(true);
    }
  });

  it('课程内容改动触发增量课程 E2E 与 UI E2E，不触发启动冒烟', () => {
    const result = flags(['src/i18n/lessons-zh.ts']);
    expect(result.content).toBe(true);
    expect(result.lessons).toBe(true);
    expect(result.build).toBe(true);
    expect(result.ui).toBe(true);
    expect(result.smoke).toBe(false);
    expect(result.fullLessons).toBe(false);
    expect(result.deployable).toBe(true);
  });

  it('挑战内容改动同样走增量 E2E 与 UI E2E', () => {
    const result = flags(['src/challenges.ts']);
    expect(result.content).toBe(true);
    expect(result.challenges).toBe(true);
    expect(result.ui).toBe(true);
    expect(result.smoke).toBe(false);
    expect(result.fullLessons).toBe(false);
    expect(result.deployable).toBe(true);
  });

  it('运行时 / 资产 / LSP 改动才触发全量 E2E、UI E2E 与冒烟', () => {
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
      expect(result.ui, path).toBe(true);
      expect(result.smoke, path).toBe(true);
      expect(result.fullLessons, path).toBe(true);
      expect(result.deployable, path).toBe(true);
    }
  });

  it('改动课程视图触发金丝雀课程 E2E + UI E2E，不触发 102MB 冒烟和全量课程', () => {
    const result = flags(['src/views/lesson.ts']);
    expect(result.app).toBe(true);
    expect(result.ui).toBe(true);
    expect(result.content).toBe(true);
    expect(result.canaryLesson).toBe(true);
    expect(result.canaryChallenge).toBe(false);
    expect(result.smoke).toBe(false);
    expect(result.fullLessons).toBe(false);
    expect(result.deployable).toBe(true);
  });

  it('改动挑战视图触发金丝雀挑战 E2E + UI E2E，不触发 102MB 冒烟和全量课程', () => {
    const result = flags(['src/views/challenge.ts']);
    expect(result.app).toBe(true);
    expect(result.ui).toBe(true);
    expect(result.content).toBe(true);
    expect(result.canaryChallenge).toBe(true);
    expect(result.canaryLesson).toBe(false);
    expect(result.smoke).toBe(false);
    expect(result.fullLessons).toBe(false);
  });

  it('改动 lean-panel 同时触发启动冒烟及课程/挑战金丝雀', () => {
    const result = flags(['src/components/lean-panel.ts']);
    expect(result.app).toBe(true);
    expect(result.ui).toBe(true);
    expect(result.smoke).toBe(true);
    expect(result.canaryLesson).toBe(true);
    expect(result.canaryChallenge).toBe(true);
    expect(result.fullLessons).toBe(false);
  });

  it('改动依赖文件触发 deps 审计与启动冒烟，不触发全量课程', () => {
    const result = flags(['package.json', 'pnpm-lock.yaml']);
    expect(result.deps).toBe(true);
    expect(result.build).toBe(true);
    expect(result.ui).toBe(true);
    expect(result.smoke).toBe(true);
    expect(result.fullLessons).toBe(false);
    expect(result.deployable).toBe(true);
  });

  it('改动 e2e-ui 脚本只触发构建与 UI E2E，不触发部署', () => {
    const result = flags(['scripts/e2e-ui.mjs']);
    expect(result.build).toBe(true);
    expect(result.ui).toBe(true);
    expect(result.smoke).toBe(false);
    expect(result.deployable).toBe(false);
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
    expect(result.ui).toBe(true);
    expect(result.smoke).toBe(true);
    expect(result.fullLessons).toBe(true);
    expect(result.deps).toBe(true);
    expect(result.deployable).toBe(true);
  });

  it('未知构建脚本 fails closed，LSP 补丁脚本触发全量运行时与部署', () => {
    for (const file of [
      'scripts/patch-lsp.mjs',
      'scripts/generate-lsp-patch.mjs',
      'scripts/new-build-hook.mjs',
    ]) {
      const result = flags([file]);
      expect(result.runtime, file).toBe(true);
      expect(result.build, file).toBe(true);
      expect(result.smoke, file).toBe(true);
      expect(result.fullLessons, file).toBe(true);
      expect(result.deployable, file).toBe(true);
    }
  });

  it('package.json 构建与补丁链路引用的所有脚本必须触发 build 且被视为可部署影响范围', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const referenced = new Set();
    for (const key of ['predev', 'prebuild', 'build', 'build:web', 'build:sw', 'patch:lsp']) {
      const cmd = String(pkg.scripts?.[key] ?? '');
      for (const match of cmd.matchAll(/\bscripts\/[A-Za-z0-9_.-]+\.mjs\b/g)) {
        referenced.add(match[0]);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    for (const file of referenced) {
      const result = flags([file]);
      expect(result.build, file).toBe(true);
      expect(result.deployable, file).toBe(true);
    }
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
