import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from './lib/cli.ts';
import {
  buildDocuments,
  buildWorkerChildArgs,
  describeDiagnostic,
  isTypeMismatch,
  parseDiagOptions,
} from './wasm64-lsp-diagnostics.ts';

describe('buildDocuments', () => {
  it('不带模块时示例在第 0 行', () => {
    const { documents, exampleLine } = buildDocuments();
    expect(exampleLine).toBe(0);
    expect(documents['Bad.lean']).toContain('1 + 1 = 3');
    expect(documents['Good.lean']).toContain('1 + 1 = 2');
  });

  it('带模块时 import 占第 0 行', () => {
    const { documents, exampleLine } = buildDocuments('Mathlib.Tactic.Spread');
    expect(exampleLine).toBe(1);
    expect(documents['Bad.lean']?.startsWith('import Mathlib.Tactic.Spread\n')).toBe(true);
  });

  it('自定义 goodCode 替换 Good.lean 主体并保留 import', () => {
    const { documents } = buildDocuments(
      'Mathlib.Data.Nat.Prime.Basic',
      'example : Nat.Prime 2 := Nat.prime_two',
    );
    expect(documents['Good.lean']).toBe(
      'import Mathlib.Data.Nat.Prime.Basic\nexample : Nat.Prime 2 := Nat.prime_two\n',
    );
  });
});

describe('诊断断言', () => {
  it('识别类型不匹配', () => {
    expect(isTypeMismatch([{ message: 'type mismatch' }])).toBe(true);
    expect(isTypeMismatch([{ message: 'unknown identifier' }])).toBe(false);
  });

  it('describeDiagnostic 输出位置与严重级', () => {
    expect(
      describeDiagnostic({
        severity: 1,
        range: { start: { line: 2, character: 4 } },
        message: 'boom\nmore',
      }),
    ).toBe('error 2:4 boom more');
  });
});

describe('parseDiagOptions', () => {
  const makePaths = (): { lean: string; lib: string } => {
    const root = mkdtempSync(join(tmpdir(), 'diag-options-'));
    const lean = join(root, 'lean.mjs');
    writeFileSync(lean, '');
    const lib = join(root, 'lib');
    mkdirSync(lib);
    return { lean, lib };
  };

  it('解析必需参数并默认 worker 模式', () => {
    const { lean, lib } = makePaths();
    const options = parseDiagOptions(['--lean', lean, '--lib', lib]);
    expect(options.mode).toBe('worker');
    expect(options.moduleName).toBeUndefined();
    expect(options.timeoutMs).toBe(300_000);
    expect(options.idleTimeoutMs).toBe(120_000);
    expect(options.jobs).toBe(4);
  });

  it('接受 --idle-timeout 并拒绝非正数', () => {
    const { lean, lib } = makePaths();
    expect(
      parseDiagOptions(['--lean', lean, '--lib', lib, '--idle-timeout', '60000']).idleTimeoutMs,
    ).toBe(60_000);
    expect(() =>
      parseDiagOptions(['--lean', lean, '--lib', lib, '--idle-timeout', '0']),
    ).toThrowError(/idle-timeout/);
  });

  it('接受 --module、--mode 与 --jobs', () => {
    const { lean, lib } = makePaths();
    const options = parseDiagOptions([
      '--lean',
      lean,
      '--lib',
      lib,
      '--module',
      'Mathlib.X',
      '--mode',
      'server',
      '--jobs',
      '1',
    ]);
    expect(options.moduleName).toBe('Mathlib.X');
    expect(options.mode).toBe('server');
    expect(options.jobs).toBe(1);
  });

  it('拒绝非法 --jobs', () => {
    const { lean, lib } = makePaths();
    expect(() => parseDiagOptions(['--lean', lean, '--lib', lib, '--jobs', '0'])).toThrowError(
      CliError,
    );
  });

  it('拒绝空字符串模块（避免把 "" 当缺省值传）', () => {
    const { lean, lib } = makePaths();
    expect(() => parseDiagOptions(['--lean', lean, '--lib', lib, '--module', ''])).toThrowError(
      '参数 --module 不能为空字符串',
    );
  });

  it('拒绝未知参数与非法 mode', () => {
    const { lean, lib } = makePaths();
    expect(() => parseDiagOptions(['--lean', lean, '--lib', lib, '--wat', '1'])).toThrowError(
      /未知参数/,
    );
    expect(() =>
      parseDiagOptions(['--lean', lean, '--lib', lib, '--mode', 'watchdog']),
    ).toThrowError(CliError);
  });

  it('缺少 --lib 时直接报错', () => {
    const { lean } = makePaths();
    expect(() => parseDiagOptions(['--lean', lean])).toThrowError('缺少必需参数 --lib');
  });

  it('路径不存在时报错', () => {
    const { lean } = makePaths();
    expect(() =>
      parseDiagOptions(['--lean', lean, '--lib', join(tmpdir(), 'no-such-lib')]),
    ).toThrowError(/不是目录/);
  });

  it('支持 --doc 过滤单文档并拒绝未知文档名', () => {
    const { lean, lib } = makePaths();
    const parsed = parseDiagOptions(['--lean', lean, '--lib', lib, '--doc', 'Good.lean']);
    expect(parsed.doc).toBe('Good.lean');
    expect(() =>
      parseDiagOptions(['--lean', lean, '--lib', lib, '--doc', 'Other.lean']),
    ).toThrowError(/Bad\.lean 或 Good\.lean/);
  });

  it('buildWorkerChildArgs 透传全部运行参数与目标文档', () => {
    const { lean, lib } = makePaths();
    const options = parseDiagOptions([
      '--lean',
      lean,
      '--lib',
      lib,
      '--module',
      'Mathlib.Order.Basic',
      '--good-code',
      'example : True := trivial',
      '--timeout',
      '600000',
      '--idle-timeout',
      '180000',
      '--jobs',
      '2',
    ]);
    expect(buildWorkerChildArgs(options, 'Bad.lean')).toEqual([
      '--lean',
      lean,
      '--lib',
      lib,
      '--mode',
      'worker',
      '--timeout',
      '600000',
      '--idle-timeout',
      '180000',
      '--jobs',
      '2',
      '--doc',
      'Bad.lean',
      '--module',
      'Mathlib.Order.Basic',
      '--good-code',
      'example : True := trivial',
    ]);
  });
});
