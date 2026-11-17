import { describe, expect, it } from 'vitest';
import { countGoalTargets } from './challenge-goal';

describe('countGoalTargets', () => {
  it('空文本与占位提示都算 0 个目标', () => {
    expect(countGoalTargets('')).toBe(0);
    expect(countGoalTargets('把光标放进证明里可以查看目标')).toBe(0);
  });

  it('按 Lean 的 ⊢ 符号统计单目标与多目标', () => {
    expect(countGoalTargets('a b : Nat\n⊢ a + b = b + a')).toBe(1);
    expect(
      countGoalTargets('case left\na : Nat\n⊢ a + 0 = a\n\ncase right\nb : Nat\n⊢ b + 0 = b'),
    ).toBe(2);
  });

  it('目标正文里重复出现的 ⊢ 也计入，保证不会被少算', () => {
    expect(countGoalTargets('⊢ (⊢) = (⊢)')).toBe(3);
  });
});
