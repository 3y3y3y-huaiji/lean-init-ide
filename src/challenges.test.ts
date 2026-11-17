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

  it('骨架留有 sorry 与双语注释，参考解法不含 sorry 且不引入 Mathlib / Lake', () => {
    for (const challenge of CHALLENGES) {
      for (const locale of ['zh', 'en'] as const) {
        const starter = challenge.starter[locale];
        expect(starter, `${challenge.slug}.starter.${locale}`).toContain('sorry');
        // 小白需要注释解释题目与 Lean 在做什么，不能只有一行符号。
        expect(starter, `${challenge.slug}.starter.${locale}`).toMatch(/^-- /m);
        expect(starter, `${challenge.slug}.starter.${locale}`).not.toMatch(/Mathlib|Lake/);
      }
      expect(challenge.solution, challenge.slug).not.toMatch(/\bsorry\b/);
      expect(challenge.solution, challenge.slug).not.toMatch(/Mathlib|Lake/);
    }
  });

  it('每道题都提供可插入编辑器、且带双语解释的快捷策略', () => {
    for (const challenge of CHALLENGES) {
      expect(challenge.tactics.length, challenge.slug).toBeGreaterThanOrEqual(3);
      for (const tactic of challenge.tactics) {
        expect(tactic.label.trim().length).toBeGreaterThan(0);
        expect(tactic.insert.length).toBeGreaterThan(0);
        expect(tactic.tip.zh.trim().length, `${tactic.label}.tip.zh`).toBeGreaterThan(0);
        expect(tactic.tip.en.trim().length, `${tactic.label}.tip.en`).toBeGreaterThan(0);
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
