import { describe, expect, it } from 'vitest';
import { CHALLENGES } from './challenges';
import { declarationNames, isExerciseSolved, isExerciseStarter, theoremHeaders } from './exercise';

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
    expect(isExerciseSolved(STARTER, STARTER, [])).toBe(false);
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

  it('注释中的 sorry 不影响通关，且未标注 severity 默认按错误处理', () => {
    const withComments = `${SOLVED}\n-- TODO sorry\n/- sorry inside block comment -/\n`;
    expect(isExerciseSolved(STARTER, withComments, [])).toBe(true);
    expect(isExerciseSolved(STARTER, withComments, [{}])).toBe(false);
    expect(isExerciseSolved('example : True := rfl', 'example : True := rfl', [])).toBe(false);
  });

  it('拦截 admit / axiom / sorry 警告诊断，以及篡改定理签名的作弊写法', () => {
    expect(isExerciseSolved(STARTER, SOLVED.replace('induction a with', 'admit'), [])).toBe(false);
    expect(
      isExerciseSolved(
        STARTER,
        'axiom cheat : False\ntheorem add_zero (a : Nat) : a + 0 = a := cheat.elim\ntheorem zero_add (a : Nat) : 0 + a = a := cheat.elim',
        [],
      ),
    ).toBe(false);
    expect(
      isExerciseSolved(STARTER, SOLVED, [{ severity: 2, message: "declaration uses 'sorry'" }]),
    ).toBe(false);
    expect(
      isExerciseSolved(
        STARTER,
        'theorem add_zero (a : Nat) : True := by trivial\ntheorem zero_add (a : Nat) : 0 + a = a := by simp',
        [],
      ),
    ).toBe(false);
    // 支持 term-mode 写法（去掉 `by` 直接写 `:= ...`）。
    expect(theoremHeaders('theorem nat_add_zero (a : Nat) : a + 0 = a := by\n  sorry')).toEqual([
      'theorem nat_add_zero (a : Nat) : a + 0 = a :=',
    ]);
    expect(
      isExerciseSolved(
        'theorem nat_add_zero (a : Nat) : a + 0 = a := by\n  sorry',
        'theorem nat_add_zero (a : Nat) : a + 0 = a := rfl',
        [],
      ),
    ).toBe(true);
  });

  it('全部趣味挑战的官方参考解法都能通过签名与反作弊判定', () => {
    for (const challenge of CHALLENGES) {
      expect(
        isExerciseSolved(challenge.starter.zh, challenge.solution.zh, []),
        challenge.slug,
      ).toBe(true);
      expect(
        isExerciseSolved(challenge.starter.en, challenge.solution.en, []),
        challenge.slug,
      ).toBe(true);
    }
  });
});
