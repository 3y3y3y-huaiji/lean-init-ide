import { describe, expect, it } from 'vitest';
import { stripGoalFence } from './lean-goal';

describe('stripGoalFence', () => {
  it('去掉 plainGoal 返回的 lean 围栏', () => {
    expect(stripGoalFence('```lean\na : Nat\n⊢ a + 0 = a\n```')).toBe('a : Nat\n⊢ a + 0 = a');
  });

  it('没有围栏时只去掉首尾空白', () => {
    expect(stripGoalFence('  ⊢ True  ')).toBe('⊢ True');
  });

  it('空目标不会留下围栏行', () => {
    expect(stripGoalFence('```lean\n\n```')).toBe('');
  });
});
