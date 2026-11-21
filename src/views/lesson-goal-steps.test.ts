import { describe, expect, it } from 'vitest';

import { lessonsFor } from '../i18n';
import type { LessonPage } from '../i18n/types';
import { extractStructuredGoalSteps, formatGoalStepText } from './lesson-goal-steps';

describe('extractStructuredGoalSteps', () => {
  it('将说明行归入当前步骤的 note 而不拆成伪步骤', () => {
    const page: LessonPage = {
      slug: 'demo',
      navTitle: 'Demo',
      title: 'Demo',
      lead: 'Lead',
      blocks: [
        {
          kind: 'code',
          code: 'theorem imp_id (P : Prop) : P → P := by\n  intro hp\n  exact hp',
        },
        {
          kind: 'goal',
          text: [
            '证明开始：⊢ P → P',
            '说明：此时还没拆开前提，整个蕴含式都在目标里。',
            '执行 intro hp：',
            '  hp : P',
            '  ⊢ P',
            '说明：intro 把左边的 P 收进上下文作为假设 hp。',
            '执行 exact hp：没有剩余目标',
          ].join('\n'),
        },
      ],
    };

    const steps = extractStructuredGoalSteps(page);
    expect(steps).toEqual([
      {
        goal: '证明开始：⊢ P → P',
        note: '此时还没拆开前提，整个蕴含式都在目标里。',
        codeIndex: 0,
        lineIndex: 0,
      },
      {
        goal: '执行 intro hp：\nhp : P\n⊢ P',
        note: 'intro 把左边的 P 收进上下文作为假设 hp。',
        codeIndex: 0,
        lineIndex: 1,
      },
      {
        goal: '执行 exact hp：没有剩余目标',
        codeIndex: 0,
        lineIndex: 2,
      },
    ]);

    expect(formatGoalStepText(steps[0]!)).toBe(
      '证明开始：⊢ P → P\n此时还没拆开前提，整个蕴含式都在目标里。',
    );
  });

  it('当 goal 块直接位于目标代码块之前时，优先绑定到紧随其后的代码块', () => {
    const lessons = lessonsFor('zh');
    const hashmapLesson = lessons.find((lesson) => lesson.slug === 'eng-hashmap');
    expect(hashmapLesson).toBeDefined();

    const steps = extractStructuredGoalSteps(hashmapLesson!);
    const lookupStep = steps.find((step) => step.goal.includes('(m.insert k v)[k]? = some v'));
    const memStep = steps.find((step) => step.goal.includes('k ∈ m.insert k v'));

    expect(lookupStep?.codeIndex).toBe(2);
    expect(memStep?.codeIndex).toBe(3);
  });

  it('空行后的解释性段落自动并入上一步 note，而不会把空行后的新步骤Header吞掉', () => {
    for (const locale of ['zh', 'en'] as const) {
      const lessons = lessonsFor(locale);
      const intro = lessons.find((lesson) => lesson.slug === 'what-is-lean')!;
      const introSteps = extractStructuredGoalSteps(intro);
      expect(introSteps.length, `${locale}:what-is-lean`).toBe(2);
      expect(introSteps[1]?.note).toBeTruthy();

      const induction = lessons.find((lesson) => lesson.slug === 'induction')!;
      const indSteps = extractStructuredGoalSteps(induction);
      expect(indSteps.some((step) => step.goal.includes('0 + 0 = 0'))).toBe(true);
      expect(indSteps.some((step) => step.goal.includes('0 + succ a = succ a'))).toBe(true);
    }
  });

  it('为所有中英文课程提取有效步骤并映射到合法代码行号', () => {
    for (const locale of ['zh', 'en'] as const) {
      for (const lesson of lessonsFor(locale)) {
        const codeBlocks = lesson.blocks.flatMap((block) =>
          block.kind === 'code' ? [block.code] : [],
        );
        const steps = extractStructuredGoalSteps(lesson);
        expect(steps.length, `${locale}:${lesson.slug}`).toBeGreaterThan(0);

        for (const step of steps) {
          expect(step.goal.trim().length, `${locale}:${lesson.slug}`).toBeGreaterThan(0);
          if (step.codeIndex !== null) {
            expect(step.codeIndex).toBeGreaterThanOrEqual(0);
            expect(step.codeIndex).toBeLessThan(codeBlocks.length);
            const lines = codeBlocks[step.codeIndex]!.split('\n');
            if (step.lineIndex !== null) {
              expect(step.lineIndex).toBeGreaterThanOrEqual(0);
              expect(step.lineIndex).toBeLessThan(lines.length);
            }
          }
        }
      }
    }
  });
});
