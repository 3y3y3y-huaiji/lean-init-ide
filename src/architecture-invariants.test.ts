// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import manifest from '../config/lean4-runtime.json';
import wasm64Manifest from '../config/lean4-wasm64-runtime.json';
import { collectManifestAssets, onRequest } from '../functions/cdn/[[path]]';
import headersSource from '../public/_headers?raw';
import routesConfig from '../public/_routes.json';
import * as e2eLessons from '../scripts/e2e-lessons.mjs';
import e2eLessonsSource from '../scripts/e2e-lessons.mjs?raw';
import vitestConfigSource from '../vitest.config.ts?raw';
import { assetSources, type RuntimeAsset, type RuntimeManifest } from './asset-sources.mjs';
import { CHALLENGES } from './challenges';
import { LESSON_CATALOG } from './i18n/lesson-catalog';
import { lessonsEn } from './i18n/lessons-en';
import { lessonsZh } from './i18n/lessons-zh';

const EXPECTED_COVERAGE_EXCLUDE = [
  'src/**/*.test.ts',
  'functions/**/*.test.ts',
  'src/**/*.d.ts',
  'src/**/*.d.mts',
  'src/test-setup.ts',
  'src/i18n/types.ts',
  'src/monaco-contrib.ts',
  'src/components/lean-panel.ts',
  'src/components/lean-panel/editor-bindings.ts',
  'src/runtime-extensions.ts',
  'src/main.ts',
  'src/sw.ts',
];

const PHANTOM_MATHLIB_TACTICS = /\b(?:ring|linarith|nlinarith|norm_num)\b/;

const WORKFLOW_RAW_MODULES = import.meta.glob('../.github/workflows/*.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const VIEW_RAW_MODULES = import.meta.glob('./views/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('架构与 CI 防呆不变量', () => {
  it('锁定 vitest.config.ts 的 coverage.exclude 白名单，禁止擅自塞入逻辑文件', () => {
    const blockMatch = /exclude:\s*\[([\s\S]*?)\]/.exec(vitestConfigSource);
    expect(blockMatch).not.toBeNull();
    const actual = Array.from(blockMatch![1]!.matchAll(/'([^']+)'/g), (m) => m[1]!);
    expect(actual).toEqual(EXPECTED_COVERAGE_EXCLUDE);
  });

  it('仅依赖 Init 的课程和挑战不得出现 ring/linarith 等幽灵战术，正文代码块除第 21 课外不得留 sorry', () => {
    for (const [locale, lessons] of [
      ['zh', lessonsZh],
      ['en', lessonsEn],
    ] as const) {
      for (const lesson of lessons) {
        const isInitOnly = (lesson.requires?.length ?? 0) === 0;
        for (const block of lesson.blocks) {
          if (block.kind === 'code') {
            if (lesson.slug !== 'math-axioms') {
              expect(block.code, `${locale}:${lesson.slug} 正文代码块含 sorry`).not.toMatch(
                /\bsorry\b/,
              );
            }
            if (isInitOnly) {
              expect(block.code, `${locale}:${lesson.slug} Init 代码含幽灵战术`).not.toMatch(
                PHANTOM_MATHLIB_TACTICS,
              );
            }
          } else if (isInitOnly) {
            expect(block.text, `${locale}:${lesson.slug} 讲义含幽灵战术`).not.toMatch(
              PHANTOM_MATHLIB_TACTICS,
            );
          }
        }
        if (isInitOnly && lesson.exercise) {
          expect(lesson.exercise.body, `${locale}:${lesson.slug} 练习题干`).not.toMatch(
            PHANTOM_MATHLIB_TACTICS,
          );
          expect(lesson.exercise.hint, `${locale}:${lesson.slug} 练习提示`).not.toMatch(
            PHANTOM_MATHLIB_TACTICS,
          );
        }
      }
    }

    for (const challenge of CHALLENGES) {
      expect(challenge.starter.zh, `${challenge.slug}:starter:zh`).not.toMatch(
        PHANTOM_MATHLIB_TACTICS,
      );
      expect(challenge.starter.en, `${challenge.slug}:starter:en`).not.toMatch(
        PHANTOM_MATHLIB_TACTICS,
      );
      expect(challenge.solution.zh, `${challenge.slug}:sol:zh`).not.toMatch(
        PHANTOM_MATHLIB_TACTICS,
      );
      expect(challenge.solution.en, `${challenge.slug}:sol:en`).not.toMatch(
        PHANTOM_MATHLIB_TACTICS,
      );
      expect(challenge.hint.zh, `${challenge.slug}:hint:zh`).not.toMatch(PHANTOM_MATHLIB_TACTICS);
      expect(challenge.hint.en, `${challenge.slug}:hint:en`).not.toMatch(PHANTOM_MATHLIB_TACTICS);
    }
  });

  it('主应用、部署与刷新工作流禁止使用 continue-on-error: true 掩盖失败', () => {
    const gatedNames = new Set([
      'ci.yml',
      'ci-refresh-open-prs.yml',
      'deploy.yml',
      'smoke.yml',
      'modelscope.yml',
      'pr-cleanup.yml',
      'cpp-gate.yml',
      'codeql.yml',
      'scorecard.yml',
    ]);
    for (const [path, content] of Object.entries(WORKFLOW_RAW_MODULES)) {
      const name = path.split('/').pop() ?? '';
      if (!gatedNames.has(name)) continue;
      expect(content, name).not.toMatch(/continue-on-error:\s*true/);
    }
  });

  it('视图层不直接跨层导入 Service Worker、Range 分片、资产源清单与服务端函数模块', () => {
    const forbiddenImport =
      /(?:from\s+|import\s*\()\s*['"][^'"]*(?:\/sw(?:-[a-z-]+)?|\/cdn-range|\/asset-sources(?:\.mjs)?|\bfunctions\/)[^'"]*['"]/;
    for (const [path, content] of Object.entries(VIEW_RAW_MODULES)) {
      if (path.endsWith('.test.ts')) continue;
      expect(content, path).not.toMatch(forbiddenImport);
    }
  });

  it('安全响应头与 Pages _routes.json 满足跨源隔离、CSP 与路由白名单契约', () => {
    expect(headersSource).toContain('Cross-Origin-Opener-Policy: same-origin');
    expect(headersSource).toContain('Cross-Origin-Embedder-Policy: require-corp');
    expect(headersSource).toContain("'wasm-unsafe-eval'");
    expect(headersSource).toContain('blob:');
    expect(headersSource).toContain('data:');
    expect(headersSource).toContain('https://*.modelscope.cn');
    expect(headersSource).not.toContain('raw.githubusercontent.com');

    expect(routesConfig.include).toEqual(['/cdn/*', '/api/telemetry']);
  });

  it('wasm32 与 wasm64 的全部基础及扩展资产在 /cdn 网关均非 404，且魔搭镜像 URL 统一扁平前缀', async () => {
    const stubEnv = (bytes: number) =>
      ({
        LEAN_ASSETS: {
          get: vi.fn(async () => ({
            size: bytes,
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(Math.min(bytes, 16)));
                controller.close();
              },
            }),
          })),
        },
      }) as unknown as Parameters<typeof onRequest>[0]['env'];

    const allAssets = [
      ...collectManifestAssets(manifest as unknown as Parameters<typeof collectManifestAssets>[0]),
      ...collectManifestAssets(
        wasm64Manifest as unknown as Parameters<typeof collectManifestAssets>[0],
      ),
    ];
    expect(allAssets.length).toBeGreaterThan(10);

    for (const asset of allAssets) {
      const response = await onRequest({
        request: new Request('https://example.test/cdn/probe', { method: 'GET' }),
        env: stubEnv(asset.bytes),
        params: { path: asset.key },
      });
      expect(response.status, asset.key).toBe(200);
    }

    const syntheticW64 = collectManifestAssets({
      assets: [
        {
          key: 'wasm-lean4/test/core.bin',
          bytes: 128,
          contentType: 'application/octet-stream',
          sha256: '0'.repeat(64),
        },
      ],
      extensions: [
        {
          assets: [
            {
              key: 'wasm-lean4/test/extensions/mathlib/mathlib.index.json',
              bytes: 64,
              contentType: 'application/json',
              sha256: '0'.repeat(64),
            },
          ],
        },
      ],
    });
    expect(syntheticW64.map((a) => a.key)).toEqual([
      'wasm-lean4/test/core.bin',
      'wasm-lean4/test/extensions/mathlib/mathlib.index.json',
    ]);

    const typedManifest = manifest as unknown as RuntimeManifest;
    const firstExtAsset = manifest.extensions[0]!.assets[0]! as unknown as RuntimeAsset;
    const extSources = assetSources(typedManifest, firstExtAsset, '', { includeMirror: true });
    const mirrorUrl = extSources.find((s) => s.label === manifest.mirror.label)?.url;
    expect(mirrorUrl).toBe(
      `${manifest.mirror.baseUrl}${manifest.mirror.prefix}/${firstExtAsset.name}`,
    );
  });

  it('scripts/e2e-lessons.mjs 直接复用 LESSON_CATALOG 与 CHALLENGES 单一事实来源，无硬编码 slug 数组', () => {
    expect(e2eLessons.SLUGS).toEqual(LESSON_CATALOG.map((entry) => entry.slug));
    expect(e2eLessons.CHALLENGE_SLUGS).toEqual(CHALLENGES.map((entry) => entry.slug));

    expect(e2eLessonsSource).not.toContain("'what-is-lean'");
    expect(e2eLessonsSource).not.toContain("'even-plus-even'");
  });
});
