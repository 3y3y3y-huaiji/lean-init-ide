import { describe, expect, it } from 'vitest';
import { isGoalMethodNotFound, isTransientGoalError, stripGoalFence } from './lean-goal';

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

describe('plainGoal 错误分类', () => {
  it('只有 MethodNotFound 判定为不支持', () => {
    expect(isGoalMethodNotFound({ code: -32601, message: 'Method not found' })).toBe(true);
    expect(isGoalMethodNotFound(new Error('Lean document process was replaced.'))).toBe(false);
  });

  it('进程替换、取消与内容修改视为瞬态错误', () => {
    expect(
      isTransientGoalError(
        new Error('$/lean/plainGoal failed: Lean document process was replaced.'),
      ),
    ).toBe(true);
    expect(isTransientGoalError({ code: -32800 })).toBe(true);
    expect(isTransientGoalError({ code: -32801 })).toBe(true);
    expect(isTransientGoalError({ code: -32603 })).toBe(true);
    expect(isTransientGoalError({ message: 'connection is disposed' })).toBe(true);
    expect(isTransientGoalError('not connected')).toBe(true);
    expect(isTransientGoalError(new Error('Lean session stopped'))).toBe(true);
  });

  it('MethodNotFound 不会被当成瞬态错误重试', () => {
    expect(isTransientGoalError({ code: -32601, message: 'Method not found' })).toBe(false);
  });

  it('普通业务错误不重试', () => {
    expect(isTransientGoalError(new Error('unexpected server response'))).toBe(false);
  });
});
