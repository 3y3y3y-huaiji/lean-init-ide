// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyDocs } from './verify-docs.mjs';

const tempDirs = [];

const makeFixture = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'verify-docs-'));
  tempDirs.push(root);
  const base = {
    'package.json': JSON.stringify({
      scripts: { lint: 'eslint .', test: 'vitest run' },
    }),
    'config/lean4-runtime.json': JSON.stringify({ runtime: 'Lean 4.35.0 Init' }),
    'src/i18n/lesson-catalog.ts': "export const LESSON_CATALOG = [{ slug: 'what-is-lean' }];",
    '.github/workflows/ci.yml': 'name: CI\n',
    'AGENTS.md': '# AGENTS\n\n## Map\n`src/i18n/lesson-catalog.ts`\n',
    'src/i18n/AGENTS.md': '# i18n AGENTS\n',
    'README.md':
      '# 项目\n\nLean 4.35.0 · 1 节课\n\n## 快速开始\n\n```bash\npnpm run lint\n```\n\n## 文档\n',
    'README.en.md': '# Project\n\nLean 4.35.0 · 1 lesson\n\n## Quick Start\n\n## Docs\n',
    'docs/CI.md':
      '**何时读我**：CI\n**单一事实来源**：[ci.yml](../.github/workflows/ci.yml)\n**维护边界**：CI\n\n# CI\n',
    'docs/README.md':
      '**何时读我**：索引\n**单一事实来源**：清单\n**维护边界**：目录\n\nLean 4.35.0 · 1\n',
  };
  const merged = { ...base, ...files };
  for (const [relPath, content] of Object.entries(merged)) {
    if (content === null) continue;
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  return root;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('verify-docs 文档不变量门禁', () => {
  it('当前仓库全部活文档通过不变量校验', () => {
    const errors = verifyDocs(resolve('.'));
    expect(errors).toEqual([]);
  });

  it('拦截断链、幽灵仓内路径、幽灵 pnpm run 命令、工作流缺漏与过期表述', () => {
    const root = makeFixture({
      'docs/BAD.md': [
        '**何时读我**：test',
        '**单一事实来源**：test',
        '**维护边界**：test',
        '断链：[missing](does-not-exist.md)',
        '幽灵路径：`src/ghost-file.ts`',
        '幽灵命令：`pnpm run ghost:cmd`',
        '过期表述：课程内容只能落在 Init 范围内',
      ].join('\n'),
      '.github/workflows/deploy.yml': 'name: Deploy\n',
    });

    const errors = verifyDocs(root);
    expect(errors.some((e) => e.includes('does-not-exist.md'))).toBe(true);
    expect(errors.some((e) => e.includes('src/ghost-file.ts'))).toBe(true);
    expect(errors.some((e) => e.includes('pnpm run ghost:cmd'))).toBe(true);
    expect(errors.some((e) => e.includes('deploy.yml'))).toBe(true);
    expect(errors.some((e) => e.includes('课程内容只能落在 Init 范围内'))).toBe(true);
  });

  it('放宽 AGENTS 合理篇幅、定位头位置与 README 双语章节数，同时守住防失控底线与缺漏拦截', () => {
    const relaxedRoot = makeFixture({
      'AGENTS.md': Array.from({ length: 140 }, (_, i) => `line ${i}`).join('\n'),
      'src/i18n/AGENTS.md': Array.from({ length: 90 }, (_, i) => `line ${i}`).join('\n'),
      'README.md': '# 项目\n\nLean 4.35.0 · 1 节课\n\n## 快速开始\n\n## 文档\n\n## 致谢\n',
      'README.en.md': '# Project\n\nLean 4.35.0 · 1 lesson\n\n## Quick Start\n',
      'docs/LATE_HEADER.md': [
        '# Title',
        ...Array.from({ length: 14 }, () => ''),
        '**何时读我**：说明',
        '**单一事实来源**：说明',
        '**维护边界**：说明',
        '',
        '## Overview',
      ].join('\n'),
    });
    expect(verifyDocs(relaxedRoot)).toEqual([]);

    const failingRoot = makeFixture({
      'AGENTS.md': Array.from({ length: 210 }, (_, i) => `line ${i}`).join('\n'),
      'src/i18n/AGENTS.md': Array.from({ length: 130 }, (_, i) => `line ${i}`).join('\n'),
      'docs/NO_HEADER.md': '# 没写定位头\n',
    });

    const errors = verifyDocs(failingRoot);
    expect(errors.some((e) => e.includes('AGENTS.md 超出上限'))).toBe(true);
    expect(errors.some((e) => e.includes('src/i18n/AGENTS.md 超出上限'))).toBe(true);
    expect(errors.some((e) => e.includes('docs/NO_HEADER.md'))).toBe(true);
  });
});
