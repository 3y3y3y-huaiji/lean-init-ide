import { describe, expect, it } from 'vitest';
import { classifyLeanStderrLine, parseLeanStderr } from './lean-log';

describe('classifyLeanStderrLine', () => {
  it('识别 error/warning/info/debug 前缀并剥离', () => {
    expect(classifyLeanStderrLine('error: unknown identifier')).toEqual({
      level: 'error',
      message: 'unknown identifier',
    });
    expect(classifyLeanStderrLine('warning: unused variable x')).toEqual({
      level: 'warning',
      message: 'unused variable x',
    });
    expect(classifyLeanStderrLine('info: compiling Init')).toEqual({
      level: 'info',
      message: 'compiling Init',
    });
    expect(classifyLeanStderrLine('debug: trace')).toEqual({
      level: 'debug',
      message: 'trace',
    });
  });

  it('无前缀时按 info 处理并保留原文', () => {
    expect(classifyLeanStderrLine('Lean 4: hello')).toEqual({
      level: 'info',
      message: 'Lean 4: hello',
    });
  });

  it('大小写不敏感，允许空白分隔', () => {
    expect(classifyLeanStderrLine('  ERROR failed to load  ')).toEqual({
      level: 'error',
      message: 'failed to load',
    });
  });

  it('形似但不是级别前缀的单词不误判', () => {
    expect(classifyLeanStderrLine('errors are reported below')).toEqual({
      level: 'info',
      message: 'errors are reported below',
    });
  });
});

describe('parseLeanStderr', () => {
  it('按行切分、去空行、保留顺序', () => {
    const chunk = 'error: boom\r\n\r\nwarning: careful\n\ninfo: done\n';
    expect(parseLeanStderr(chunk)).toEqual([
      { level: 'error', message: 'boom' },
      { level: 'warning', message: 'careful' },
      { level: 'info', message: 'done' },
    ]);
  });

  it('空字符串得到空数组', () => {
    expect(parseLeanStderr('')).toEqual([]);
    expect(parseLeanStderr('\n \r\n')).toEqual([]);
  });
});
