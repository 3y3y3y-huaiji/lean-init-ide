import { describe, expect, it } from 'vitest';
import {
  CliError,
  expectPositionals,
  optionalString,
  parseArgs,
  requireNumber,
  requireString,
  type FlagSpec,
} from './cli.ts';

const SPEC: Record<string, FlagSpec> = {
  lean: { kind: 'string' },
  lib: { kind: 'string' },
  module: { kind: 'string' },
  mode: { kind: 'string' },
  timeout: { kind: 'number' },
  verbose: { kind: 'boolean' },
};

describe('parseArgs', () => {
  it('解析字符串、数字、布尔与位置参数', () => {
    const parsed = parseArgs(['--lean', 'a.mjs', '--timeout', '30', '--verbose', 'extra'], SPEC);
    expect(parsed.flags).toEqual({ lean: 'a.mjs', timeout: 30, verbose: true });
    expect(parsed.positionals).toEqual(['extra']);
  });

  it('支持 --name=value', () => {
    const parsed = parseArgs(['--lib=work/lib', '--mode=worker'], SPEC);
    expect(parsed.flags).toEqual({ lib: 'work/lib', mode: 'worker' });
  });

  it('拒绝未知参数', () => {
    expect(() => parseArgs(['--nope', 'x'], SPEC)).toThrowError(new CliError('未知参数 --nope'));
  });

  it('拒绝缺值', () => {
    expect(() => parseArgs(['--lean'], SPEC)).toThrowError(/需要一个值/);
    expect(() => parseArgs(['--lean', '--lib', 'x'], SPEC)).toThrowError(/需要一个值/);
  });

  it('拒绝空字符串（这就是 --module "" 的事故来源）', () => {
    expect(() => parseArgs(['--module', '', '--lean', 'a', '--lib', 'b'], SPEC)).toThrowError(
      '参数 --module 不能为空字符串',
    );
  });

  it('拒绝重复参数', () => {
    expect(() => parseArgs(['--lean', 'a', '--lean', 'b'], SPEC)).toThrowError(/重复/);
  });

  it('拒绝非数字', () => {
    expect(() => parseArgs(['--timeout', 'abc'], SPEC)).toThrowError(/需要数字/);
  });

  it('校验必需参数', () => {
    const required: Record<string, FlagSpec> = {
      lean: { kind: 'string', required: true },
      lib: { kind: 'string' },
    };
    expect(() => parseArgs(['--lib', 'x'], required)).toThrowError('缺少必需参数 --lean');
  });

  it('布尔参数不接受值', () => {
    expect(() => parseArgs(['--verbose=1'], SPEC)).toThrowError(/不接受值/);
  });
});

describe('取值辅助', () => {
  it('requireString / requireNumber 只返回对应类型', () => {
    const parsed = parseArgs(['--lean', 'a', '--timeout', '5'], SPEC);
    expect(requireString(parsed, 'lean')).toBe('a');
    expect(requireNumber(parsed, 'timeout')).toBe(5);
    expect(() => requireString(parsed, 'timeout')).toThrowError(CliError);
  });

  it('optionalString 区分“没传”和“传了空”', () => {
    const parsed = parseArgs(['--lean', 'a'], SPEC);
    expect(optionalString(parsed, 'module')).toBeUndefined();
  });

  it('positionals 数量不对时报错并带用法', () => {
    const parsed = parseArgs(['a'], SPEC);
    expect(() => expectPositionals(parsed, 2, 'node x <a> <b>')).toThrowError(/node x <a> <b>/);
  });
});
