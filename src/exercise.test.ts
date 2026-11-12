import { describe, expect, it } from 'vitest';
import { declarationNames, isExerciseSolved, isExerciseStarter } from './exercise';

const STARTER = `theorem add_zero (a : Nat) : a + 0 = a := by
  sorry

theorem zero_add (a : Nat) : 0 + a = a := by
  sorry
`;

const SOLVED = `theorem add_zero (a : Nat) : a + 0 = a := by
  induction a with
  | zero => rfl
  | succ a ih => simp

theorem zero_add (a : Nat) : 0 + a = a := by
  induction a with
  | zero => rfl
  | succ a ih => simp
`;

describe('declarationNames', () => {
  it('提取具名声明的名字并去重', () => {
    expect(declarationNames(STARTER)).toEqual(['add_zero', 'zero_add']);
    expect(declarationNames('example : True := by trivial')).toEqual([]);
  });
});

describe('isExerciseStarter', () => {
  it('只有带 sorry 的具名练习才算练习', () => {
    expect(isExerciseStarter(STARTER)).toBe(true);
    expect(isExerciseStarter('def bad : Nat := true')).toBe(false);
    expect(isExerciseStarter('example : True := by sorry')).toBe(false);
  });
});

describe('isExerciseSolved', () => {
  it('清空代码不能通关', () => {
    expect(isExerciseSolved(STARTER, '', [])).toBe(false);
    expect(isExerciseSolved(STARTER, '-- 全删了\n', [])).toBe(false);
    expect(isExerciseSolved(STARTER, '-- add_zero\n-- zero_add\n', [])).toBe(false);
  });

  it('保留声明名、去掉 sorry 且无错误才通关', () => {
    expect(isExerciseSolved(STARTER, SOLVED, [])).toBe(true);
    expect(isExerciseSolved(STARTER, SOLVED, [{ severity: 2 }])).toBe(true);
    expect(isExerciseSolved(STARTER, SOLVED, [{ severity: 1 }])).toBe(false);
  });

  it('删掉或改名其中一个定理不能通关', () => {
    expect(isExerciseSolved(STARTER, 'theorem add_zero (a : Nat) : a + 0 = a := by rfl', [])).toBe(
      false,
    );
    expect(isExerciseSolved(STARTER, SOLVED.replace('zero_add', 'zero_add_rw'), [])).toBe(false);
  });

  it('名字被更长标识符包含时不算保留', () => {
    expect(
      isExerciseSolved(STARTER, SOLVED.replace('theorem zero_add ', 'theorem zero_add_rw '), []),
    ).toBe(false);
  });
});
