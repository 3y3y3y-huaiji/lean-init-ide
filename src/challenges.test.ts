import { describe, expect, it } from 'vitest';
import e2eLessonsSource from '../scripts/e2e-lessons.mjs?raw';
import {
  challengeBySlug,
  challengePath,
  challengesPath,
  CHALLENGES,
  resolveChallengeParam,
} from './challenges';

describe('挑战数据源', () => {
  it('slug 唯一且是可直接进 URL 的小写短横线格式', () => {
    const slugs = CHALLENGES.map((challenge) => challenge.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('首批提供 5–6 道题，且每道的双语文案都齐全', () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(5);
    expect(CHALLENGES.length).toBeLessThanOrEqual(6);
    for (const challenge of CHALLENGES) {
      for (const locale of ['zh', 'en'] as const) {
        expect(
          challenge.title[locale].trim().length,
          `${challenge.slug}.title.${locale}`,
        ).toBeGreaterThan(0);
        expect(
          challenge.summary[locale].trim().length,
          `${challenge.slug}.summary.${locale}`,
        ).toBeGreaterThan(0);
        expect(
          challenge.body[locale].trim().length,
          `${challenge.slug}.body.${locale}`,
        ).toBeGreaterThan(0);
        expect(
          challenge.hint[locale].trim().length,
          `${challenge.slug}.hint.${locale}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('骨架留有 sorry，参考解法不含 sorry 且不引入 Mathlib / Lake', () => {
    for (const challenge of CHALLENGES) {
      for (const locale of ['zh', 'en'] as const) {
        expect(challenge.starter[locale], `${challenge.slug}.starter.${locale}`).toContain('sorry');
        expect(challenge.solution[locale], `${challenge.slug}.solution.${locale}`).not.toMatch(
          /\bsorry\b/,
        );
        expect(challenge.starter[locale], `${challenge.slug}.starter.${locale}`).not.toMatch(
          /Mathlib|Lake/,
        );
        expect(challenge.solution[locale], `${challenge.slug}.solution.${locale}`).not.toMatch(
          /Mathlib|Lake/,
        );
      }
    }
  });

  it('骨架与解法都带讲解注释，零基础用户能跟着注释读代码', () => {
    for (const challenge of CHALLENGES) {
      for (const locale of ['zh', 'en'] as const) {
        const starterComments = challenge.starter[locale]
          .split('\n')
          .filter((line) => line.trimStart().startsWith('--'));
        const solutionComments = challenge.solution[locale]
          .split('\n')
          .filter((line) => line.trimStart().startsWith('--'));
        expect(
          starterComments.length,
          `${challenge.slug}.starter.${locale}`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          solutionComments.length,
          `${challenge.slug}.solution.${locale}`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('中英文骨架与解法只有注释不同，证明代码保持一致', () => {
    const codeOnly = (code: string) =>
      code
        .split('\n')
        .map((line) => line.replace(/--.*$/, '').trim())
        .filter((line) => line.length > 0)
        .join('\n');
    for (const challenge of CHALLENGES) {
      expect(codeOnly(challenge.starter.zh), `${challenge.slug}.starter`).toBe(
        codeOnly(challenge.starter.en),
      );
      expect(codeOnly(challenge.solution.zh), `${challenge.slug}.solution`).toBe(
        codeOnly(challenge.solution.en),
      );
    }
  });

  it('每道题都提供可插入编辑器的快捷策略，并附一句白话解释', () => {
    for (const challenge of CHALLENGES) {
      expect(challenge.tactics.length, challenge.slug).toBeGreaterThanOrEqual(3);
      for (const tactic of challenge.tactics) {
        expect(tactic.label.trim().length).toBeGreaterThan(0);
        expect(tactic.insert.length).toBeGreaterThan(0);
        for (const locale of ['zh', 'en'] as const) {
          expect(
            tactic.description[locale].trim().length,
            `${challenge.slug}.${tactic.label}.${locale}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('E2E 脚本里的挑战 slug 清单与数据源保持一致', () => {
    const match = e2eLessonsSource.match(/const CHALLENGE_SLUGS = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    const slugs = Array.from(
      match![1]!.matchAll(/'([^']+)'/g),
      (item: RegExpMatchArray) => item[1]!,
    );
    expect(slugs).toEqual(CHALLENGES.map((challenge) => challenge.slug));
  });
});

describe('挑战路径与参数', () => {
  it('按语言生成列表页与单题直达路径', () => {
    expect(challengesPath('zh')).toBe('/zh/challenges');
    expect(challengesPath('en')).toBe('/en/challenges');
    expect(challengePath('zh', 'even-plus-even')).toBe('/zh/challenges/even-plus-even');
  });

  it('按 slug 查找题目，未知 slug 返回 undefined', () => {
    expect(challengeBySlug('add-comm')?.slug).toBe('add-comm');
    expect(challengeBySlug('unknown')).toBeUndefined();
    expect(challengeBySlug(undefined)).toBeUndefined();
  });

  it('解析 playground 的 ?challenge= 参数', () => {
    expect(resolveChallengeParam('?challenge=add-comm')?.slug).toBe('add-comm');
    expect(resolveChallengeParam('challenge=add-comm&x=1')?.slug).toBe('add-comm');
    expect(resolveChallengeParam('?challenge=unknown')).toBeUndefined();
    expect(resolveChallengeParam('?lesson=induction')).toBeUndefined();
    expect(resolveChallengeParam('')).toBeUndefined();
  });
});
