import { describe, expect, it } from 'vitest';
import { CHALLENGES } from './challenges';
import {
  analyzeProofStyle,
  declarationNames,
  isChallengeSolved,
  isExerciseSolved,
  isExerciseStarter,
  solvedChallengeTiers,
  theoremHeaders,
  type ChallengeSpec,
} from './exercise';

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

  it('拦截 admit / axiom / opaque / unsafe / sorry 警告诊断，以及篡改定理签名的作弊写法', () => {
    expect(isExerciseSolved(STARTER, SOLVED.replace('induction a with', 'admit'), [])).toBe(false);
    expect(isExerciseSolved(STARTER, SOLVED.replace('induction a with', 'opaque'), [])).toBe(false);
    expect(isExerciseSolved(STARTER, SOLVED.replace('induction a with', 'unsafe'), [])).toBe(false);
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

  it('全部趣味挑战的官方参考解法都能通过各自模式的判题', () => {
    const specFor = (
      challenge: (typeof CHALLENGES)[number],
      locale: 'zh' | 'en',
    ): ChallengeSpec => ({
      mode: challenge.mode,
      starter: challenge.starter[locale],
      verdict: challenge.verdict,
      requiredConclusion: challenge.requiredConclusion,
      bounty: challenge.bounty,
    });
    for (const challenge of CHALLENGES) {
      for (const locale of ['zh', 'en'] as const) {
        const spec = specFor(challenge, locale);
        expect(
          isChallengeSolved(spec, challenge.solution[locale], []),
          `${challenge.slug}.${locale}`,
        ).toBe(true);
        expect(
          isChallengeSolved(spec, challenge.starter[locale], [
            { severity: 2, message: "declaration uses 'sorry'" },
          ]),
          `${challenge.slug}.${locale} 骨架不应通关`,
        ).toBe(false);
      }
    }
  });
});

describe('analyzeProofStyle', () => {
  it('把自动化战术识别为 ⚡ 降维打击', () => {
    expect(analyzeProofStyle('theorem t : 1 = 1 := by decide').badges).toEqual(['automation']);
    expect(analyzeProofStyle('theorem t (n : Nat) : n + 0 = n := by omega').badges).toEqual([
      'automation',
    ]);
  });

  it('纯手工战术识别为 🛠️ 古典手艺人', () => {
    expect(analyzeProofStyle('theorem t : 1 = 1 := by\n  rfl').badges).toEqual(['handcrafted']);
  });

  it('直接给出证明项识别为 λ 类型论极客', () => {
    expect(analyzeProofStyle('theorem t : 1 = 1 := rfl').badges).toEqual(['term-mode']);
    expect(analyzeProofStyle('theorem t : True := ⟨⟩').badges).toEqual(['term-mode']);
  });

  it('注释里的战术词不参与流派判断', () => {
    expect(analyzeProofStyle('-- by omega decide simp\ntheorem t : 1 = 1 := rfl').badges).toEqual([
      'term-mode',
    ]);
  });

  it('剥除注释与空白后统计有效字符数', () => {
    const code = `-- 这段注释不计入
theorem t : 1 = 1 := by
  rfl
/- 块注释也不计入 -/
`;
    expect(analyzeProofStyle(code).codeChars).toBe('theoremt:1=1:=byrfl'.length);
  });
});

describe('isChallengeSolved 的其它判题模式', () => {
  const verdictSpec = CHALLENGES.find((challenge) => challenge.slug === 'nat-sub-trap');
  const bugfixSpec = CHALLENGES.find((challenge) => challenge.slug === 'clamp-contract');
  const bountySpec = CHALLENGES.find((challenge) => challenge.slug === 'collatz-bounty');

  it('真假审判庭要求保留正确候选且不残留 sorry', () => {
    expect(verdictSpec).toBeDefined();
    if (!verdictSpec) return;
    const spec: ChallengeSpec = {
      mode: verdictSpec.mode,
      starter: verdictSpec.starter.zh,
      verdict: verdictSpec.verdict,
      requiredConclusion: verdictSpec.requiredConclusion,
    };
    expect(isChallengeSolved(spec, verdictSpec.solution.zh, [])).toBe(true);
    expect(isChallengeSolved(spec, verdictSpec.solution.zh, [{ severity: 1 }])).toBe(false);
    expect(
      isChallengeSolved(spec, verdictSpec.solution.zh.replace('verdict_false', 'verdict_true'), []),
    ).toBe(false);
    expect(isChallengeSolved(spec, `theorem verdict_false : True := trivial`, [])).toBe(false);
  });

  it('契约漏洞猎人要求保留核心结论片段', () => {
    expect(bugfixSpec).toBeDefined();
    if (!bugfixSpec) return;
    const spec: ChallengeSpec = {
      mode: bugfixSpec.mode,
      starter: bugfixSpec.starter.zh,
      requiredConclusion: bugfixSpec.requiredConclusion,
    };
    expect(isChallengeSolved(spec, bugfixSpec.solution.zh, [])).toBe(true);
    expect(isChallengeSolved(spec, 'theorem clamp_in_range : True := trivial', [])).toBe(false);
    expect(
      isChallengeSolved(
        spec,
        bugfixSpec.solution.zh.replace('lo ≤ clamp lo hi x ∧ clamp lo hi x ≤ hi', 'True'),
        [],
      ),
    ).toBe(false);
  });

  it('悬赏厅逐层判断，完成铜牌或银牌即可通关', () => {
    expect(bountySpec).toBeDefined();
    if (!bountySpec) return;
    const spec: ChallengeSpec = {
      mode: bountySpec.mode,
      starter: bountySpec.starter.zh,
      bounty: bountySpec.bounty,
    };
    expect(solvedChallengeTiers(spec, bountySpec.solution.zh, [])).toEqual(['bronze', 'silver']);
    expect(isChallengeSolved(spec, bountySpec.solution.zh, [])).toBe(true);
    const bronzeOnly = bountySpec.solution.zh.replace(/theorem tier_silver[\s\S]*$/, '');
    expect(solvedChallengeTiers(spec, bronzeOnly, [])).toEqual(['bronze']);
    expect(isChallengeSolved(spec, bronzeOnly, [])).toBe(true);
    const noSlots = bountySpec.solution.zh.replace(/theorem tier_bronze[\s\S]*$/, '');
    expect(solvedChallengeTiers(spec, noSlots, [])).toEqual([]);
    expect(isChallengeSolved(spec, noSlots, [])).toBe(false);
  });
});
