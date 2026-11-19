import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from './lib/cli.ts';
import {
  CURATED_UPSTREAM_TESTS,
  assertOutputsMatch,
  buildDeepStressCorpus,
  buildDifferentialCorpus,
  compareWithExitTrapTolerance,
  isKnownExitTrap,
  normalizeStdout,
  parseEquivalenceOptions,
  runEquivalenceSuite,
  type EquivalenceOptions,
  type RunOutput,
} from './wasm64-patch-equivalence.ts';

/** 触发已知退出期 trap 的真实 stderr 形状（run 44519972634）。 */
const EXIT_TRAP_STDERR =
  'RuntimeError: memory access out of bounds\n' +
  '    at lean.wasm.emscripten_builtin_free (wasm://wasm/lean.wasm-20d5c736:wasm-function[155]:0xb5cf7)\n' +
  '    at lean.wasm.lean_dec_ref_cold (wasm://wasm/lean.wasm-20d5c736:wasm-function[60]:0xa1acd)\n';

describe('wasm64-patch-equivalence', () => {
  it('normalizeStdout 统一宿主路径、/src 与换行符', () => {
    const raw = '/tmp/work-dir/Foo.lean:10:2: ok\r\n/src/Bar.lean:3:0: done  \r\n';
    expect(normalizeStdout(raw, '/tmp/work-dir')).toBe(
      '<src>/Foo.lean:10:2: ok\n<src>/Bar.lean:3:0: done',
    );
  });

  it('assertOutputsMatch 在退出码或输出不同步时显式失败', () => {
    expect(() =>
      assertOutputsMatch(
        'case',
        { status: 0, stdout: '/src/A.lean:1:0: ok\n', stderr: '' },
        { status: 0, stdout: '/tmp/host/A.lean:1:0: ok\r\n', stderr: '' },
        '/tmp/host',
      ),
    ).not.toThrow();

    expect(() =>
      assertOutputsMatch(
        'case',
        { status: 0, stdout: 'a', stderr: '' },
        { status: 1, stdout: 'a', stderr: 'trap' },
        '/tmp/host',
      ),
    ).toThrow(/退出码不一致/);

    expect(() =>
      assertOutputsMatch(
        'case',
        { status: 0, stdout: 'alpha', stderr: '' },
        { status: 0, stdout: 'beta', stderr: '' },
        '/tmp/host',
      ),
    ).toThrow(/输出行为与原版 Lean 不一致/);
  });

  it('assertOutputsMatch 在退出码不一致时把两边的 stdout 一起贴出来', () => {
    let message = '';
    try {
      assertOutputsMatch(
        'case',
        { status: 0, stdout: '/tmp/host/A.lean:1:0: ok\n', stderr: '' },
        { status: 99, stdout: '/tmp/host/A.lean:1:0: ok\n', stderr: 'boom' },
        '/tmp/host',
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('退出码不一致');
    expect(message).toContain('<src>/A.lean:1:0: ok');
    expect(message).toContain('wasm64 stderr:\nboom');
  });

  it('isKnownExitTrap 只认退出期堆损坏的签名', () => {
    expect(isKnownExitTrap({ status: 0, stdout: '', stderr: EXIT_TRAP_STDERR })).toBe(false);
    expect(isKnownExitTrap({ status: 99, stdout: '', stderr: EXIT_TRAP_STDERR })).toBe(true);
    expect(
      isKnownExitTrap({ status: 1, stdout: '', stderr: 'Maximum call stack size exceeded' }),
    ).toBe(false);
  });

  it('compareWithExitTrapTolerance 对 stdout 一致的偶发 trap 重跑一次', () => {
    const expected: RunOutput = { status: 0, stdout: 'a\nb\n', stderr: '' };
    const replies: RunOutput[] = [
      { status: 99, stdout: 'a\nb\n', stderr: EXIT_TRAP_STDERR },
      { status: 0, stdout: 'a\nb\n', stderr: '' },
    ];
    let calls = 0;
    const result = compareWithExitTrapTolerance(
      'retry',
      expected,
      () => replies[calls++] as RunOutput,
      '/tmp/host',
    );
    expect(calls).toBe(2);
    expect(result.status).toBe(0);
  });

  it('compareWithExitTrapTolerance 在 trap 复现但 stdout 一致时只告警放行', () => {
    const expected: RunOutput = { status: 0, stdout: 'a\nb\n', stderr: '' };
    let calls = 0;
    const result = compareWithExitTrapTolerance(
      'warn',
      expected,
      () => {
        calls += 1;
        return { status: 99, stdout: 'a\nb\n', stderr: EXIT_TRAP_STDERR };
      },
      '/tmp/host',
    );
    expect(calls).toBe(2);
    expect(result.status).toBe(99);
  });

  it('compareWithExitTrapTolerance 不放过 stdout 有差异或非已知签名的失败', () => {
    const expected: RunOutput = { status: 0, stdout: 'a\nb\n', stderr: '' };

    // stdout 被截断（说明崩在中途，不是退出期）：不重跑、直接失败。
    let calls = 0;
    expect(() =>
      compareWithExitTrapTolerance(
        'truncated',
        expected,
        () => {
          calls += 1;
          return { status: 99, stdout: 'a\n', stderr: EXIT_TRAP_STDERR };
        },
        '/tmp/host',
      ),
    ).toThrow(/stdout 校验未通过/);
    expect(calls).toBe(1);

    // 爆栈等真回归不是已知签名：同样不重跑。
    calls = 0;
    expect(() =>
      compareWithExitTrapTolerance(
        'stack',
        expected,
        () => {
          calls += 1;
          return { status: 1, stdout: 'a\nb\n', stderr: 'Maximum call stack size exceeded' };
        },
        '/tmp/host',
      ),
    ).toThrow(/退出码不一致/);
    expect(calls).toBe(1);
  });

  it('语料覆盖 replace_fn、WHNF、Simp 与深栈压测关键断言', () => {
    const diff = buildDifferentialCorpus();
    expect(diff).toContain('e.replace');
    expect(diff).toContain('instantiateLevelParams');
    expect(diff).toContain('withTrackingZetaDelta');
    expect(diff).toContain('beta := false');
    expect(diff).toContain('singlePass := true');
    expect(diff).toContain('memoize := false');
    expect(diff).toContain('maxSteps := 4');

    const stress = buildDeepStressCorpus();
    expect(stress).toContain('mkDeepApp 2000');
    expect(stress).toContain('deepLin 800');
    expect(CURATED_UPSTREAM_TESTS).toContain('tests/elab/6123_mod_cast.lean');
    expect(CURATED_UPSTREAM_TESTS).toContain('tests/elab/whnfProj.lean');
  });

  it('parseEquivalenceOptions 解析必须参数并拒绝非法 timeout', () => {
    const root = mkdtempSync(join(tmpdir(), 'patch-equiv-opt-'));
    const bootLean = join(root, 'lean');
    const wasmLean = join(root, 'lean.mjs');
    const runLean = join(root, 'run-lean.mjs');
    const bootLib = join(root, 'lib');
    const lean4Src = join(root, 'lean4');
    writeFileSync(bootLean, '');
    writeFileSync(wasmLean, '');
    writeFileSync(runLean, '');
    mkdirSync(bootLib);
    mkdirSync(lean4Src);

    const opts = parseEquivalenceOptions([
      '--boot-lean',
      bootLean,
      '--boot-lib',
      bootLib,
      '--wasm-lean',
      wasmLean,
      '--lean4-src',
      lean4Src,
      '--run-lean',
      runLean,
    ]);
    expect(opts.timeoutMs).toBe(180_000);

    expect(() =>
      parseEquivalenceOptions([
        '--boot-lean',
        bootLean,
        '--boot-lib',
        bootLib,
        '--wasm-lean',
        wasmLean,
        '--lean4-src',
        lean4Src,
        '--run-lean',
        runLean,
        '--timeout',
        '0',
      ]),
    ).toThrowError(CliError);
  });

  const makeFixtureOptions = (): EquivalenceOptions => {
    const root = mkdtempSync(join(tmpdir(), 'patch-equiv-suite-'));
    const bootLean = join(root, 'lean');
    const wasmLean = join(root, 'lean.mjs');
    const lspGlue = join(root, 'lean-adapted-proxy.mjs');
    const runLean = join(root, 'run-lean.mjs');
    const lspScript = join(root, 'lsp-diag.ts');
    const bootLib = join(root, 'lib');
    const lean4Src = join(root, 'lean4');
    writeFileSync(bootLean, '');
    writeFileSync(wasmLean, '');
    writeFileSync(lspGlue, '');
    writeFileSync(runLean, '');
    writeFileSync(lspScript, '');
    mkdirSync(bootLib);
    for (const rel of CURATED_UPSTREAM_TESTS) {
      const target = join(lean4Src, rel);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, '-- upstream fixture\n');
    }
    return parseEquivalenceOptions([
      '--boot-lean',
      bootLean,
      '--boot-lib',
      bootLib,
      '--wasm-lean',
      wasmLean,
      '--lsp-glue',
      lspGlue,
      '--lean4-src',
      lean4Src,
      '--run-lean',
      runLean,
      '--lsp-script',
      lspScript,
    ]);
  };

  it('runEquivalenceSuite 容忍退出期 trap：stdout 一致就重跑并放行，stdout 有差异仍失败', () => {
    const options = makeFixtureOptions();
    const okBoot = () => ({ status: 0, stdout: 'ok\n', stderr: '' });
    const trappedWasm = (_opts: EquivalenceOptions, _dir: string, rel: string) =>
      rel === 'DeepStress.lean'
        ? { status: 99, stdout: 'deep_stress_ok\n', stderr: EXIT_TRAP_STDERR }
        : rel === 'Exit42.lean'
          ? { status: 1, stdout: '', stderr: 'worker error' }
          : { status: 99, stdout: 'ok\n', stderr: EXIT_TRAP_STDERR };

    expect(() =>
      runEquivalenceSuite(options, {
        runBoot: okBoot,
        runWasm: trappedWasm,
        runLsp: () => ({ status: 0, stdout: '', stderr: '' }),
      }),
    ).not.toThrow();

    // 同一次崩溃但 stdout 少了一行 → 说明崩在中途，必须红。
    expect(() =>
      runEquivalenceSuite(options, {
        runBoot: okBoot,
        runWasm: (_opts, _dir, rel) =>
          rel === 'PatchEquiv.lean'
            ? { status: 99, stdout: '', stderr: EXIT_TRAP_STDERR }
            : trappedWasm(_opts, _dir, rel),
        runLsp: () => ({ status: 0, stdout: '', stderr: '' }),
      }),
    ).toThrow(/stdout 校验未通过/);
  });

  it('runEquivalenceSuite 在差分一致、深栈通过与 Exit42 正常时全部通过', () => {
    const options = makeFixtureOptions();
    expect(() =>
      runEquivalenceSuite(options, {
        runBoot: (_opts, _dir, file) => ({
          status: 0,
          stdout: file.endsWith('PatchEquiv.lean') ? 'match\n' : 'ok\n',
          stderr: '',
        }),
        runWasm: (_opts, _dir, rel) => {
          if (rel === 'Exit42.lean') return { status: 42, stdout: '', stderr: '' };
          if (rel === 'DeepStress.lean')
            return { status: 0, stdout: 'deep_stress_ok\n', stderr: '' };
          if (rel === 'PatchEquiv.lean') return { status: 0, stdout: 'match\n', stderr: '' };
          return { status: 0, stdout: 'ok\n', stderr: '' };
        },
        runLsp: () => ({ status: 0, stdout: '[diag] ok\n', stderr: '' }),
      }),
    ).not.toThrow();
  });

  it('runEquivalenceSuite 拦截 DeepStress 与 LSP 回归失败，Exit42 只告警', () => {
    const options = makeFixtureOptions();
    const okBoot = () => ({ status: 0, stdout: 'ok\n', stderr: '' });
    expect(() =>
      runEquivalenceSuite(options, {
        runBoot: okBoot,
        runWasm: (_opts, _dir, rel) =>
          rel === 'DeepStress.lean'
            ? { status: 1, stdout: '', stderr: 'Maximum call stack' }
            : { status: 0, stdout: 'ok\n', stderr: '' },
        runLsp: () => ({ status: 0, stdout: '', stderr: '' }),
      }),
    ).toThrow(/DeepStress\.lean 在 wasm64 CLI 失败/);

    // wasm64 CLI 的 IO.Process.exit 目前会以 1 退出，门禁只告警不失败。
    expect(() =>
      runEquivalenceSuite(options, {
        runBoot: okBoot,
        runWasm: (_opts, _dir, rel) =>
          rel === 'DeepStress.lean'
            ? { status: 0, stdout: 'deep_stress_ok\n', stderr: '' }
            : rel === 'Exit42.lean'
              ? { status: 1, stdout: '', stderr: 'worker error' }
              : { status: 0, stdout: 'ok\n', stderr: '' },
        runLsp: () => ({ status: 0, stdout: '', stderr: '' }),
      }),
    ).not.toThrow();

    expect(() =>
      runEquivalenceSuite(options, {
        runBoot: okBoot,
        runWasm: (_opts, _dir, rel) =>
          rel === 'DeepStress.lean'
            ? { status: 0, stdout: 'deep_stress_ok\n', stderr: '' }
            : rel === 'Exit42.lean'
              ? { status: 42, stdout: '', stderr: '' }
              : { status: 0, stdout: 'ok\n', stderr: '' },
        runLsp: () => ({ status: 1, stdout: '', stderr: 'worker trap' }),
      }),
    ).toThrow(/LSP --worker 深栈回归失败/);
  });
});
