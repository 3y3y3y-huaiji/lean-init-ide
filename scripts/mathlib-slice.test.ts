import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from './lib/cli.ts';
import {
  collectClosure,
  collectClosures,
  indexSources,
  readImports,
  slice,
} from './mathlib-slice.ts';

describe('readImports', () => {
  it('识别 module / prelude / 修饰符 / 行尾注释', () => {
    const text = [
      'module',
      'prelude',
      'public meta import Mathlib.A',
      'import all Mathlib.B -- 行尾注释',
      'import Mathlib.C',
      'def x := 1',
      'import Mathlib.Late',
    ].join('\n');
    expect(readImports(text)).toEqual(['Mathlib.A', 'Mathlib.B', 'Mathlib.C']);
  });

  it('块注释里的 import 不算依赖', () => {
    const text = ['/-', 'import Mathlib.Fake', '-/', 'import Mathlib.Real'].join('\n');
    expect(readImports(text)).toEqual(['Mathlib.Real']);
  });

  it('行首注释与空行跳过', () => {
    const text = ['-- import Mathlib.Fake', '', 'import Mathlib.Real'].join('\n');
    expect(readImports(text)).toEqual(['Mathlib.Real']);
  });

  it('单行块注释不影响后续 import', () => {
    const text = ['/- note -/ import Mathlib.A', 'import Mathlib.B'].join('\n');
    expect(readImports(text)).toEqual(['Mathlib.B']);
  });
});

describe('collectClosure', () => {
  const sources = new Map<string, string>([
    ['A', 'import B\nimport C\n'],
    ['B', 'import Init\nimport X\n'],
    ['C', 'import B\n'],
  ]);
  const index = new Map<string, string>();
  for (const module of ['A', 'B', 'C']) index.set(module, `${module}.lean`);

  it('后序输出依赖，Init/Std/Lean 不算外部依赖', () => {
    const { order, externals } = collectClosure(
      index,
      'A',
      (file) => sources.get(file.replace('.lean', '')) ?? '',
    );
    expect(order).toEqual(['B', 'C', 'A']);
    expect(externals).toEqual(['X']);
  });

  it('循环 import 只告警，不丢模块', () => {
    const cycle = new Map<string, string>([
      ['A', 'import B\n'],
      ['B', 'import A\n'],
    ]);
    const cyclicIndex = new Map<string, string>([
      ['A', 'A.lean'],
      ['B', 'B.lean'],
    ]);
    const warnings: string[] = [];
    const { order } = collectClosure(
      cyclicIndex,
      'A',
      (file) => cycle.get(file.replace('.lean', '')) ?? '',
      (message) => warnings.push(message),
    );
    expect(order).toEqual(['B', 'A']);
    expect(warnings[0]).toContain('循环 import');
  });
});

describe('indexSources', () => {
  it('只收首字母大写的模块根，跳过 scripts 与隐藏目录', () => {
    const root = mkdtempSync(join(tmpdir(), 'mathlib-slice-'));
    // 真实布局：work/mathlib/<包名>/<模块根>/...，模块名从包内的模块根算起。
    mkdirSync(join(root, 'mathlib4', 'Mathlib', 'Order'), { recursive: true });
    mkdirSync(join(root, 'mathlib4', 'scripts'), { recursive: true });
    mkdirSync(join(root, 'batteries', 'Batteries'), { recursive: true });
    mkdirSync(join(root, 'Qq'), { recursive: true });
    mkdirSync(join(root, '.git'), { recursive: true });
    writeFileSync(join(root, 'mathlib4', 'Mathlib', 'Order', 'Basic.lean'), '');
    writeFileSync(join(root, 'mathlib4', 'scripts', 'gen.lean'), '');
    writeFileSync(join(root, 'mathlib4', 'Mathlib', 'Qq.lean'), '');
    writeFileSync(join(root, 'batteries', 'Batteries', 'Data.lean'), '');
    writeFileSync(join(root, 'Qq', 'Qq.lean'), '');
    writeFileSync(join(root, '.git', 'Hook.lean'), '');

    const index = indexSources(root);
    expect([...index.keys()].sort()).toEqual([
      'Batteries.Data',
      'Mathlib.Order.Basic',
      'Mathlib.Qq',
      'Qq',
    ]);
  });
});

describe('slice', () => {
  const makeTree = (): { root: string; out: string; manifest: string } => {
    const root = mkdtempSync(join(tmpdir(), 'mathlib-slice-run-'));
    mkdirSync(join(root, 'mathlib4', 'Mathlib'), { recursive: true });
    writeFileSync(join(root, 'mathlib4', 'Mathlib', 'A.lean'), 'import Mathlib.B\n');
    writeFileSync(join(root, 'mathlib4', 'Mathlib', 'B.lean'), '');
    const out = join(root, 'out');
    return { root, out, manifest: join(root, 'slice.json') };
  };

  it('按拓扑序复制源文件并写 manifest', () => {
    const { root, out, manifest } = makeTree();
    const result = slice({ root, targets: ['Mathlib.A'], out, manifest });
    expect(result?.modules).toEqual(['Mathlib.B', 'Mathlib.A']);
    expect(readFileSync(join(out, 'Mathlib', 'A.lean'), 'utf8')).toBe('import Mathlib.B\n');
    expect(JSON.parse(readFileSync(manifest, 'utf8')).modules).toEqual(['Mathlib.B', 'Mathlib.A']);
  });

  it('超过 --max 返回 null（调用方按退出码 3 跳过编译）', () => {
    const { root, out, manifest } = makeTree();
    expect(slice({ root, targets: ['Mathlib.A'], out, manifest, max: 1 })).toBeNull();
  });

  it('--targets 为空直接报错', () => {
    const { root, out, manifest } = makeTree();
    expect(() => slice({ root, targets: [], out, manifest })).toThrowError(CliError);
  });

  it('--union 与 --optional 在预算内贪心打包多个 Mathlib 目标', () => {
    const root = mkdtempSync(join(tmpdir(), 'mathlib-slice-union-'));
    mkdirSync(join(root, 'mathlib4', 'Mathlib'), { recursive: true });
    writeFileSync(join(root, 'mathlib4', 'Mathlib', 'Base.lean'), '');
    writeFileSync(join(root, 'mathlib4', 'Mathlib', 'A.lean'), 'import Mathlib.Base\n');
    writeFileSync(join(root, 'mathlib4', 'Mathlib', 'B.lean'), 'import Mathlib.Base\n');
    writeFileSync(join(root, 'mathlib4', 'Mathlib', 'Huge1.lean'), 'import Mathlib.Base\n');
    writeFileSync(join(root, 'mathlib4', 'Mathlib', 'Huge2.lean'), 'import Mathlib.Huge1\n');
    const out = join(root, 'out');
    const manifest = join(root, 'slice.json');
    const result = slice({
      root,
      targets: ['Mathlib.A'],
      optional: ['Mathlib.B', 'Mathlib.Huge2'],
      union: true,
      out,
      manifest,
      max: 3,
    });
    expect(result).toEqual({
      target: 'Mathlib.A',
      targets: ['Mathlib.A', 'Mathlib.B'],
      modules: ['Mathlib.Base', 'Mathlib.A', 'Mathlib.B'],
    });
    const written = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(written.targets).toEqual(['Mathlib.A', 'Mathlib.B']);
  });
});

describe('collectClosures', () => {
  it('合并多个目标且共享依赖不重复输出', () => {
    const sources = new Map<string, string>([
      ['A', 'import Shared\n'],
      ['B', 'import Shared\n'],
      ['Shared', ''],
    ]);
    const index = new Map<string, string>([
      ['A', 'A.lean'],
      ['B', 'B.lean'],
      ['Shared', 'Shared.lean'],
    ]);
    const { order } = collectClosures(
      index,
      ['A', 'B'],
      (file) => sources.get(file.replace('.lean', '')) ?? '',
    );
    expect(order).toEqual(['Shared', 'A', 'B']);
  });
});
