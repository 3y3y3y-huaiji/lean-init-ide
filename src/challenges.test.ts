// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CHALLENGE_SLUGS } from '../scripts/e2e-lessons.mjs';
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

  it('四大主题区合计至少 8 道题，且每道的双语文案都齐全', () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(8);
    expect(CHALLENGES.length).toBeLessThanOrEqual(9);
    const counts = { classic: 0, verdict: 0, bugfix: 0, bounty: 0 };
    for (const challenge of CHALLENGES) counts[challenge.mode] += 1;
    expect(counts).toEqual({ classic: 4, verdict: 2, bugfix: 1, bounty: 2 });
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

  it('每种判题模式都带上对应的通关契约', () => {
    for (const challenge of CHALLENGES) {
      if (challenge.mode === 'classic') continue;
      expect(challenge.starter.zh, challenge.slug).toContain('sorry');
    }

    const verdicts = CHALLENGES.filter((challenge) => challenge.mode === 'verdict');
    expect(verdicts.map((challenge) => challenge.slug)).toEqual(['nat-sub-trap', 'even-sum-split']);
    for (const challenge of verdicts) {
      expect(challenge.verdict?.correct, challenge.slug).toBe('verdict_false');
      expect(challenge.verdict?.wrong, challenge.slug).toBe('verdict_true');
      expect(challenge.requiredConclusion, challenge.slug).toBeTruthy();
      for (const locale of ['zh', 'en'] as const) {
        expect(challenge.solution[locale], challenge.slug).toContain('verdict_false');
        expect(challenge.solution[locale], challenge.slug).toContain(
          challenge.requiredConclusion ?? '',
        );
      }
    }

    const bugfix = CHALLENGES.filter((challenge) => challenge.mode === 'bugfix');
    expect(bugfix.map((challenge) => challenge.slug)).toEqual(['clamp-contract']);
    for (const challenge of bugfix) {
      expect(challenge.requiredConclusion, challenge.slug).toBeTruthy();
      for (const locale of ['zh', 'en'] as const) {
        expect(challenge.solution[locale], challenge.slug).toContain(
          challenge.requiredConclusion ?? '',
        );
      }
    }

    const bounties = CHALLENGES.filter((challenge) => challenge.mode === 'bounty');
    expect(bounties.map((challenge) => challenge.slug)).toEqual([
      'collatz-bounty',
      'goldbach-bounty',
    ]);
    for (const challenge of bounties) {
      expect(challenge.bounty, challenge.slug).toEqual({
        bronze: 'tier_bronze',
        silver: 'tier_silver',
        legend: 'tier_legend',
      });
      for (const locale of ['zh', 'en'] as const) {
        expect(challenge.starter[locale], challenge.slug).toContain('theorem tier_legend');
        expect(challenge.solution[locale], challenge.slug).toContain('theorem tier_bronze');
        expect(challenge.solution[locale], challenge.slug).toContain('theorem tier_silver');
        expect(challenge.solution[locale], challenge.slug).not.toContain('theorem tier_legend');
      }
    }
  });

  it('E2E 脚本里的挑战 slug 清单与数据源保持一致', () => {
    expect(CHALLENGE_SLUGS).toEqual(CHALLENGES.map((challenge) => challenge.slug));
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
