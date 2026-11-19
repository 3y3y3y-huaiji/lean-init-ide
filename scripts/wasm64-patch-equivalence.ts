// 补丁行为等价性门禁：
// 1. 差分对比未打补丁的官方 Linux Lean（$BOOT/bin/lean）与打补丁后的 wasm64 Lean（work/dist/lean.mjs），
//    覆盖 replace_fn / whnfCoreStep / simpLoopStep 与上游 tests/elab 用例，校验退出码与标准输出严格一致；
// 2. 在 wasm64 CLI 与 LSP --worker 上运行深栈压测（N=800..2000）与退出码/异常（io.cpp / shell.cpp）回归，
//    确保既不退化原语义，也真正消除浏览器 Worker ~1 MB 栈溢出与异常崩溃。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  CliError,
  optionalString,
  parseArgs,
  requireNumber,
  runCli,
  type FlagSpec,
} from './lib/cli.ts';
import { isMainModule } from './lib/entry.ts';
import { requireDir, requireFile } from './lib/fs-guards.ts';

/** 上游 Lean tests/elab 中仅依赖 Init/Lean 且零外部依赖的核心回归用例。 */
export const CURATED_UPSTREAM_TESTS = [
  'tests/elab/6123_mod_cast.lean',
  'tests/elab/whnfProj.lean',
  'tests/elab/whnfDelayedMVarIssue.lean',
  'tests/elab/simpConfigPropagationIssue1.lean',
  'tests/elab/dsimpZetaIssue.lean',
] as const;

export interface EquivalenceOptions {
  readonly bootLean: string;
  readonly bootLib: string;
  readonly wasmLean: string;
  readonly lspGlue?: string;
  readonly lean4Src: string;
  readonly runLean: string;
  readonly lspScript: string;
  readonly timeoutMs: number;
}

export interface RunOutput {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const EQUIV_SPEC: Record<string, FlagSpec> = {
  'boot-lean': { kind: 'string', required: true, valueName: 'bin/lean' },
  'boot-lib': { kind: 'string', required: true, valueName: 'lib/lean' },
  'wasm-lean': { kind: 'string', required: true, valueName: 'lean.mjs' },
  'lsp-glue': { kind: 'string', valueName: 'lean-adapted-proxy.mjs' },
  'lean4-src': { kind: 'string', required: true, valueName: 'work/lean4' },
  'run-lean': { kind: 'string', required: true, valueName: 'run-lean.mjs' },
  'lsp-script': { kind: 'string', valueName: 'wasm64-lsp-diagnostics.ts' },
  timeout: { kind: 'number', valueName: 'ms' },
};

export const parseEquivalenceOptions = (argv: readonly string[]): EquivalenceOptions => {
  const parsed = parseArgs(argv, EQUIV_SPEC);
  const timeoutMs = parsed.flags.timeout === undefined ? 180_000 : requireNumber(parsed, 'timeout');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new CliError(`--timeout 必须是正整数，收到 ${timeoutMs}`);
  }
  const lspGlue = optionalString(parsed, 'lsp-glue');
  const lspScript =
    optionalString(parsed, 'lsp-script') ??
    resolve(import.meta.dirname, 'wasm64-lsp-diagnostics.ts');
  return {
    bootLean: requireFile(String(parsed.flags['boot-lean'] ?? ''), 'boot-lean'),
    bootLib: requireDir(String(parsed.flags['boot-lib'] ?? ''), 'boot-lib'),
    wasmLean: requireFile(String(parsed.flags['wasm-lean'] ?? ''), 'wasm-lean'),
    ...(lspGlue === undefined ? {} : { lspGlue: requireFile(lspGlue, 'lsp-glue') }),
    lean4Src: requireDir(String(parsed.flags['lean4-src'] ?? ''), 'lean4-src'),
    runLean: requireFile(String(parsed.flags['run-lean'] ?? ''), 'run-lean'),
    lspScript: requireFile(lspScript, 'lsp-script'),
    timeoutMs,
  };
};

/** 归一化 Lean 标准输出：抹平宿主机路径与 /src 虚拟挂载路径、CRLF 和行尾空白差异。 */
export const normalizeStdout = (text: string, hostSrcDir: string): string => {
  const normalizedHost = resolve(hostSrcDir).replace(/\\/g, '/');
  return text
    .replace(/\r\n/g, '\n')
    .replaceAll(`${normalizedHost}/`, '<src>/')
    .replaceAll(`${hostSrcDir}/`, '<src>/')
    .replaceAll('/src/', '<src>/')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
};

export const assertOutputsMatch = (
  label: string,
  expected: RunOutput,
  actual: RunOutput,
  hostSrcDir: string,
): void => {
  if (expected.status !== actual.status) {
    throw new Error(
      `[${label}] 退出码不一致: boot=${expected.status} wasm64=${actual.status}\n` +
        `boot stderr:\n${expected.stderr}\nwasm64 stderr:\n${actual.stderr}`,
    );
  }
  const bootOut = normalizeStdout(expected.stdout, hostSrcDir);
  const wasmOut = normalizeStdout(actual.stdout, hostSrcDir);
  if (bootOut !== wasmOut) {
    throw new Error(
      `[${label}] 输出行为与原版 Lean 不一致!\n--- boot ---\n${bootOut}\n--- wasm64 ---\n${wasmOut}`,
    );
  }
};

/** 面向 replace_fn / WHNF / Simp 三处补丁高危边界的定向等价性用例。 */
export const buildDifferentialCorpus = (): string =>
  [
    'import Lean',
    '',
    'open Lean Lean.Meta',
    '',
    '-- 1. replace_fn / instantiateLevelParams：共享子树、未共享子树与多构造器递归',
    'private def mkMixedExpr : Expr :=',
    '  let u : Level := .param `u',
    '  let v : Level := .param `v',
    '  let shared : Expr := .app (.const `Nat.succ []) (.const `Nat.zero [])',
    '  let body : Expr :=',
    '    .letE `x (.const `Nat []) shared',
    '      (.app (.app (.const `Nat.add []) (.bvar 0)) (.mdata {} (.proj `Prod 0 (.app shared shared)))) false',
    '  .lam `n (.const `Nat []) (.forallE `m (.sort (.succ u)) (.app (.const `id [v]) body) .default) .default',
    '',
    '#eval show CoreM Unit from do',
    '  let e := mkMixedExpr',
    '  let replaced := e.replace fun sub =>',
    '    if sub.isConstOf `Nat.zero then some (.const `zeroAlt []) else none',
    '  let noop := e.replace fun _ => none',
    '  let inst := e.instantiateLevelParams [`u, `v] [.one, .succ .one]',
    '  IO.println s!"replace_eq_noop={e == noop}"',
    '  IO.println s!"replace_changed={e != replaced}"',
    '  IO.println s!"replace_hash={replaced.hash}"',
    '  IO.println s!"replace_str={replaced}"',
    '  IO.println s!"inst_hash={inst.hash}"',
    '  IO.println s!"inst_str={inst}"',
    '',
    '-- 2. WHNF：zeta / zetaHave / zetaUnused / trackZetaDelta / cfg.beta / cfg.proj 四模式',
    '-- 这些定义会被 `.const` 按名字引用，不能是 private（私有名字会被 mangle）。',
    'def mkFun : Nat → (Nat → Nat) := fun k x => x + k',
    'structure Box where val : Nat',
    'def wrapBox (n : Nat) : Box := ⟨n + 1⟩',
    '',
    'private def runWhnfCases : MetaM Unit := do',
    '  -- 2a. proj 四种透明度开关',
    '  let projExpr : Expr := .proj `Box 0 (.app (.const `wrapBox []) (.lit (.natVal 4)))',
    '  for mode in [TransparencyMode.all, .default, .reducible, .instances] do',
    '    let out ← withTransparency mode <| withConfig (fun c => { c with proj := .yes }) (whnf projExpr)',
    '    IO.println s!"proj_yes[{reprStr mode}]={out}"',
    '  let outNo ← withConfig (fun c => { c with proj := .no }) (whnf projExpr)',
    '  IO.println s!"proj_no={outNo}"',
    '  -- 2b. cfg.beta = false 时：头原本不是 lambda 但归约成 lambda 会继续 beta；头原本是 lambda 则不 beta',
    '  let appHeadNonLam : Expr := .app (.app (.const `mkFun []) (.lit (.natVal 5))) (.lit (.natVal 1))',
    '  let appHeadLam : Expr := .app (.lam `x (.const `Nat []) (.bvar 0) .default) (.lit (.natVal 9))',
    '  let noBeta1 ← withConfig (fun c => { c with beta := false }) (whnf appHeadNonLam)',
    '  let noBeta2 ← withConfig (fun c => { c with beta := false }) (whnf appHeadLam)',
    '  IO.println s!"beta_false_nonlam={noBeta1} beta_false_lam={noBeta2}"',
    '  -- 2c. withTrackingZetaDelta 与 zetaUnused',
    '  let res ← withLetDecl `a (.const `Nat []) (.lit (.natVal 7)) fun fv => do',
    '    withConfig (fun c => { c with zetaDelta := true }) <| withTrackingZetaDelta do',
    '      let w ← whnf (.app (.app (.const `Nat.add []) fv) (.lit (.natVal 2)))',
    '      let tracked ← getZetaDeltaFVarIds',
    '      return (w, tracked.contains fv.fvarId!)',
    '  IO.println s!"zeta_delta={res.1} tracked={res.2}"',
    '  let unusedLet : Expr := .letE `u (.const `Nat []) (.lit (.natVal 99)) (.lit (.natVal 3)) true',
    '  let outUnused ← withConfig (fun c => { c with zeta := false, zetaUnused := true }) (whnf unusedLet)',
    '  IO.println s!"zeta_unused={outUnused}"',
    '',
    '#eval show MetaM Unit from runWhnfCases',
    '',
    '-- 3. Simp：multi-step、singlePass、memoize=false 与 maxSteps 截断报错一致性',
    'private def lin : Nat → Nat',
    '  | 0 => 0',
    '  | n + 1 => lin n',
    '',
    'theorem lin_ok : lin 12 = 0 := by simp [lin]',
    '',
    'example : (let x := 2; x + lin 6) = 2 := by',
    '  simp (config := { singlePass := true }) [lin]',
    '',
    'example : lin 6 = 0 := by',
    '  simp (config := { memoize := false }) [lin]',
    '',
    '/-- error: `simp` failed: maximum number of steps exceeded -/',
    '#guard_msgs in',
    'example : lin 20 = 0 := by',
    '  simp (config := { maxSteps := 4 }) [lin]',
    '',
    '-- 4. trace.Meta.whnf 定向校验',
    'set_option trace.Meta.whnf true in',
    'example : (let x := 1; x + 2) = 3 := rfl',
    '',
  ].join('\n');

/** 深层递归压测（仅 patched wasm64 需要跑过；验证 replace_fn / whnfCoreStep / simpLoopStep）。 */
export const buildDeepStressCorpus = (): string =>
  [
    'import Lean',
    '',
    'open Lean',
    '',
    'private def mkDeepApp (n : Nat) : Expr :=',
    '  -- 用 Nat.rec 而不是 Nat.recOn：后者的 LCNF 签名不在官方 olean 里，#eval 跑不起来。',
    '  Nat.rec (.const `base [Level.param `u]) (fun _ acc =>',
    '    .lam `x (.const `Nat []) (.app acc (.bvar 0)) .default) n',
    '',
    '#eval show IO Unit from do',
    '  let e := mkDeepApp 2000',
    '  let r := e.replace fun sub => if sub.isConstOf `base then some (.const `base2 []) else none',
    '  let i := e.instantiateLevelParams [`u] [.one]',
    '  if r == e || i == e then throw (IO.userError "deep replace_fn did not transform")',
    '  IO.println "deep_replace_ok"',
    '',
    'private def deepLin : Nat → Nat',
    '  | 0 => 0',
    '  | n + 1 => deepLin n',
    '',
    'set_option maxRecDepth 8000 in',
    'example : deepLin 800 = 0 := by simp [deepLin]',
    '',
    'private def nestedAdd (n : Nat) : Nat :=',
    '  match n with',
    '  | 0 => 0',
    '  | k + 1 => let x := nestedAdd k; x',
    '',
    'set_option maxRecDepth 8000 in',
    'example : nestedAdd 400 = 0 := by simp [nestedAdd]',
    '',
    '#eval IO.println "deep_stress_ok"',
    '',
  ].join('\n');

const runBootLean = (options: EquivalenceOptions, workDir: string, filePath: string): RunOutput => {
  const res = spawnSync(options.bootLean, ['-j1', '-R', workDir, filePath], {
    cwd: workDir,
    env: { ...process.env, LEAN_PATH: options.bootLib },
    encoding: 'utf8',
    timeout: options.timeoutMs,
  });
  if (res.error) throw res.error;
  return {
    status: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
};

const runWasmLean = (options: EquivalenceOptions, workDir: string, relFile: string): RunOutput => {
  const res = spawnSync(
    process.execPath,
    [
      options.runLean,
      options.wasmLean,
      workDir,
      options.bootLib,
      '--',
      '-j1',
      '-R',
      '/src',
      `/src/${relFile}`,
    ],
    {
      encoding: 'utf8',
      timeout: options.timeoutMs,
    },
  );
  if (res.error) throw res.error;
  return {
    status: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
};

export interface EquivalenceRunners {
  readonly runBoot?: (options: EquivalenceOptions, workDir: string, filePath: string) => RunOutput;
  readonly runWasm?: (options: EquivalenceOptions, workDir: string, relFile: string) => RunOutput;
  readonly runLsp?: (options: EquivalenceOptions, deepCode: string) => RunOutput;
}

const runLspDeepCheck = (options: EquivalenceOptions, deepCode: string): RunOutput => {
  if (!options.lspGlue) {
    throw new Error('缺少 --lsp-glue 参数');
  }
  const res = spawnSync(
    process.execPath,
    [
      options.lspScript,
      '--lean',
      options.lspGlue,
      '--lib',
      options.bootLib,
      '--doc',
      'Good.lean',
      '--good-code',
      deepCode,
      '--expect-info',
      'lsp_deep_ok',
      '--mode',
      'worker',
      '--timeout',
      String(options.timeoutMs),
      '--idle-timeout',
      '120000',
      '--jobs',
      '4',
    ],
    { encoding: 'utf8', timeout: options.timeoutMs + 30_000 },
  );
  if (res.error) throw res.error;
  return {
    status: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
};

export const runEquivalenceSuite = (
  options: EquivalenceOptions,
  runners: EquivalenceRunners = {},
): void => {
  const runBoot = runners.runBoot ?? runBootLean;
  const runWasm = runners.runWasm ?? runWasmLean;
  const runLsp = runners.runLsp ?? runLspDeepCheck;
  const workDir = mkdtempSync(join(tmpdir(), 'wasm64-patch-equiv-'));
  try {
    for (const rel of CURATED_UPSTREAM_TESTS) {
      const srcPath = join(options.lean4Src, rel);
      if (!existsSync(srcPath)) {
        throw new Error(`找不到上游回归测试文件: ${srcPath}`);
      }
      const name = rel.replace(/\//g, '_');
      const localFile = join(workDir, name);
      writeFileSync(localFile, readFileSync(srcPath, 'utf8'));
      const bootRes = runBoot(options, workDir, localFile);
      const wasmRes = runWasm(options, workDir, name);
      if (bootRes.status !== 0) {
        throw new Error(
          `上游测试 ${rel} 在原版 boot lean 就失败 (${bootRes.status}): ${bootRes.stderr}`,
        );
      }
      assertOutputsMatch(rel, bootRes, wasmRes, workDir);
      console.log(`[equiv] upstream pass: ${rel}`);
    }

    const diffPath = join(workDir, 'PatchEquiv.lean');
    writeFileSync(diffPath, buildDifferentialCorpus());
    const bootDiff = runBoot(options, workDir, diffPath);
    const wasmDiff = runWasm(options, workDir, 'PatchEquiv.lean');
    if (bootDiff.status !== 0) {
      throw new Error(
        `PatchEquiv.lean 在原版 boot lean 失败 (${bootDiff.status}): ${bootDiff.stderr}\n${bootDiff.stdout}`,
      );
    }
    assertOutputsMatch('PatchEquiv.lean', bootDiff, wasmDiff, workDir);
    console.log('[equiv] PatchEquiv.lean differential match ok');

    const stressPath = join(workDir, 'DeepStress.lean');
    writeFileSync(stressPath, buildDeepStressCorpus());
    const wasmStress = runWasm(options, workDir, 'DeepStress.lean');
    if (wasmStress.status !== 0 || !wasmStress.stdout.includes('deep_stress_ok')) {
      throw new Error(
        `DeepStress.lean 在 wasm64 CLI 失败 (status=${wasmStress.status}):\n${wasmStress.stderr}\n${wasmStress.stdout}`,
      );
    }
    console.log('[equiv] DeepStress.lean CLI ok');

    writeFileSync(join(workDir, 'Exit42.lean'), '#eval (IO.Process.exit 42 : IO Unit)\n');
    const exitRes = runWasm(options, workDir, 'Exit42.lean');
    if (exitRes.status !== 42) {
      throw new Error(
        `IO.Process.exit 42 期望退出码 42，实际 ${exitRes.status}: ${exitRes.stderr}`,
      );
    }
    console.log('[equiv] IO.Process.exit 42 ok');

    if (options.lspGlue) {
      const lspDeepCode = [
        'private def deepSimpLsp : Nat → Nat',
        '  | 0 => 0',
        '  | n + 1 => deepSimpLsp n',
        '',
        'set_option maxRecDepth 8000 in',
        'example : deepSimpLsp 800 = 0 := by simp [deepSimpLsp]',
        '',
        '#eval "lsp_deep_ok"',
      ].join('\n');
      const lspRes = runLsp(options, lspDeepCode);
      if (lspRes.status !== 0) {
        throw new Error(
          `LSP --worker 深栈回归失败 (${lspRes.status}):\n${lspRes.stderr}\n${lspRes.stdout}`,
        );
      }
      console.log('[equiv] LSP --worker deep simp N=800 ok');
    }

    console.log('[equiv] all patch equivalence gates passed');
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
};

const main = (): void => {
  const options = parseEquivalenceOptions(process.argv.slice(2));
  runEquivalenceSuite(options);
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
