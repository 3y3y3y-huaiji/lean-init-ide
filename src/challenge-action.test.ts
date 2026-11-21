import { describe, expect, it } from 'vitest';
import { applyChallengeTactic, challengeTacticAction } from './challenge-action';
import type { ChallengeTactic } from './challenges';

const tactic = (overrides: Partial<ChallengeTactic> = {}): ChallengeTactic => ({
  label: '测试出招卡',
  insert: { zh: 'by decide', en: 'by decide' },
  description: { zh: '测试', en: 'test' },
  ...overrides,
});

describe('出招卡应用逻辑', () => {
  it('默认按 replace-sorry 处理', () => {
    expect(challengeTacticAction(tactic())).toBe('replace-sorry');
  });

  it('只替换第一个未注释的 sorry，注释里的 sorry 不算数', () => {
    const code = `-- 这里写 sorry 只是示例
theorem demo : True := by
  -- 不要动注释里的 sorry
  sorry
`;
    const next = applyChallengeTactic(code, tactic(), 'zh');
    expect(next).toContain('theorem demo : True := by');
    expect(next).toContain('by decide');
    expect(next).not.toMatch(/^\s*sorry\s*$/m);
    expect(next.match(/这里写 sorry 只是示例/g)).toHaveLength(1);
  });

  it('跳过块注释里的 sorry', () => {
    const code = `/- sorry -/
theorem demo : True := by
  sorry
`;
    const next = applyChallengeTactic(code, tactic(), 'zh');
    expect(next).toContain('/- sorry -/');
    expect(next).toContain('by decide');
  });

  it('没有 sorry 时替换最后一条定理的证明部分，而不是把文件插坏', () => {
    const code = `def demo : Nat := 1

theorem first : True := by
  trivial

theorem second : True := by
  trivial
`;
    const next = applyChallengeTactic(
      code,
      tactic({ insert: { zh: 'exact True.intro', en: 'exact True.intro' } }),
      'zh',
    );
    expect(next).toContain('theorem first : True := by\n  trivial');
    expect(next).toContain('theorem second : True := by\n  exact True.intro');
  });

  it('set-code 直接返回该语言的完整文件', () => {
    const next = applyChallengeTactic(
      'old',
      tactic({
        action: 'set-code',
        insert: { zh: '-- 中文\n#check Nat', en: '-- English\n#check Nat' },
      }),
      'en',
    );
    expect(next).toBe('-- English\n#check Nat');
  });

  it('既没有 sorry 也没有定理时回退到片段本身', () => {
    expect(applyChallengeTactic('-- 空文件', tactic(), 'zh')).toBe('by decide');
  });
});
