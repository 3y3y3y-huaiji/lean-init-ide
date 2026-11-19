import { describe, expect, it } from 'vitest';
import { isStackOverflowError } from './lean-recovery';
import { formatWorkerError } from './wasm64-error';

describe('formatWorkerError', () => {
  it('逐层解包 Chrome pthread 嵌套 ErrorEvent，保留底层堆栈与栈溢出特征', () => {
    const innerError = new RangeError('Maximum call stack size exceeded');
    const pthreadEvent = {
      message: 'Uncaught RangeError: Maximum call stack size exceeded',
      error: innerError,
    };
    const outerEvent = { message: 'Uncaught [object ErrorEvent]', error: pthreadEvent };

    const formatted = formatWorkerError(outerEvent);

    expect(formatted).toContain('RangeError: Maximum call stack size exceeded');
    expect(formatted).not.toContain('[object ErrorEvent]');
    expect(isStackOverflowError(formatted)).toBe(true);
  });

  it('内层无 stack 时保留可读 message 而不退化成 [object ErrorEvent]', () => {
    const eventLike = {
      message: '',
      error: { message: 'Uncaught RangeError: Maximum call stack size exceeded', error: null },
    };

    const formatted = formatWorkerError(eventLike, 'fallback');

    expect(formatted).toBe('Uncaught RangeError: Maximum call stack size exceeded');
    expect(isStackOverflowError(formatted)).toBe(true);
  });

  it('空对象或完全缺少错误信息时返回明确兜底文案，绝不出现 [object ErrorEvent]', () => {
    const emptyEvent = new ErrorEvent('error');
    const formatted = formatWorkerError(emptyEvent, 'Lean wasm64 process worker failed.');

    expect(formatted).toBe('Lean wasm64 process worker failed.');
    expect(formatted).not.toContain('[object ErrorEvent]');
  });

  it('防止循环 error 引用死循环', () => {
    const cyclic: { message: string; error?: unknown } = { message: 'inner failure' };
    cyclic.error = cyclic;

    expect(formatWorkerError(cyclic)).toBe('inner failure');
  });

  it('处理字符串、原始值与空白兜底', () => {
    expect(formatWorkerError('direct worker failure')).toBe('direct worker failure');
    expect(formatWorkerError('   ', '   ')).toBe('Lean wasm64 worker error.');
    expect(formatWorkerError(42, 'fallback msg')).toBe('fallback msg');
  });
});
