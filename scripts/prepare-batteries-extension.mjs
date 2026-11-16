#!/usr/bin/env node
/**
 * 为 wasm32 扩展包准备 Batteries 的「无 Lean 元编程」子集。
 *
 * Batteries 的 Tactic / Lean 相关模块依赖 Lean 编译器 oleans；wasm 运行时只有
 * Init + Std，没有 Lean。这个脚本用原生 Lean 的 --deps 计算依赖闭包，剔除任何
 * 间接依赖 Lean / Lake 的模块，只保留 Init + Std + Batteries 内部的模块。
 *
 * 输出：
 * - <out-src>/Batteries.lean：只 import 保留下来的模块
 * - <out-src>/Batteries/**：保留下来的源码副本
 * - <out-deps>：合并后的 deps.txt（保留 work/deps.txt 里的 Init/Std 行）
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = new Map();
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (!arg.startsWith('--')) continue;
  const [key, value] = arg.slice(2).split('=');
  if (value !== undefined) args.set(key, value);
  else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
    args.set(key, argv[index + 1]);
    index += 1;
  } else {
    args.set(key, 'true');
  }
}

const batteries = resolve(args.get('batteries') ?? 'work/batteries');
const bootstrap = resolve(args.get('bootstrap') ?? '');
const work = resolve(args.get('work') ?? 'work');
const outSrc = resolve(args.get('out-src') ?? join(work, 'batteries-filtered'));
const outDeps = resolve(args.get('out-deps') ?? join(work, 'deps.txt'));
if (!bootstrap) throw new Error('缺少 --bootstrap');

const lean = join(bootstrap, 'bin', 'lean');
const nativeLib = join(bootstrap, 'lib', 'lean');
const moduleRoot = join(batteries, 'Batteries');
if (!existsSync(moduleRoot)) throw new Error(`${moduleRoot} 不存在`);

const walk = (dir, relative = 'Batteries') => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), child));
    else if (entry.isFile() && entry.name.endsWith('.lean')) {
      out.push(child.slice(0, -'.lean'.length));
    }
  }
  return out;
};

const modules = walk(moduleRoot);
if (existsSync(join(batteries, 'Batteries.lean'))) modules.push('Batteries');
modules.sort();

const strip = (value) => {
  let result = value.trim().replace(/\.olean$/, '');
  if (result.startsWith(`${nativeLib}/`)) result = result.slice(nativeLib.length + 1);
  if (result.startsWith(`${batteries}/`)) result = result.slice(batteries.length + 1);
  return result;
};

const depsByModule = new Map();
const failed = [];
for (const module of modules) {
  try {
    const output = execFileSync(lean, ['--deps', `${module}.lean`], {
      cwd: batteries,
      env: { ...process.env, LEAN_PATH: `${nativeLib}:${batteries}` },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const deps = [
      ...new Set(
        output
          .split(/\r?\n/)
          .map(strip)
          .filter((dep) => dep && dep !== module),
      ),
    ];
    depsByModule.set(module, deps);
  } catch (error) {
    failed.push(`${module}: ${error.message}`);
    depsByModule.set(module, ['Lean']);
  }
}

const allowed = (dep) =>
  dep === 'Init' ||
  dep.startsWith('Init/') ||
  dep === 'Std' ||
  dep.startsWith('Std/') ||
  dep === 'Batteries' ||
  dep.startsWith('Batteries/');

const selected = new Set();
const excluded = [];
for (const module of modules) {
  const closure = new Set();
  const stack = [module];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const dep of depsByModule.get(current) ?? []) {
      if (closure.has(dep)) continue;
      closure.add(dep);
      if (depsByModule.has(dep)) stack.push(dep);
    }
  }
  if ([...closure].every(allowed)) {
    selected.add(module);
  } else {
    excluded.push(module);
  }
}

// 原始 Batteries.lean 通常 import 了 Tactic/Lean 模块；用保留下来的模块重建一个根。
selected.delete('Batteries');
const rootImports = [...selected].sort().map((module) => `import ${module}`);
mkdirSync(outSrc, { recursive: true });
writeFileSync(
  join(outSrc, 'Batteries.lean'),
  `${rootImports.join('\n')}\n\n/- Lean-free Batteries subset for the browser runtime. -/\n`,
);
selected.add('Batteries');

for (const module of selected) {
  if (module === 'Batteries') continue;
  const source = join(batteries, `${module}.lean`);
  const target = join(outSrc, `${module}.lean`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

const existingDeps = existsSync(outDeps) ? readFileSync(outDeps, 'utf8').trimEnd() : '';
const lines = [];
if (existingDeps) lines.push(existingDeps);
for (const module of [...selected].sort()) {
  const deps =
    module === 'Batteries'
      ? [...selected].filter((name) => name !== 'Batteries')
      : (depsByModule.get(module) ?? []).filter(allowed);
  lines.push(`${module}: ${deps.join(' ')}`);
}
writeFileSync(outDeps, `${lines.join('\n')}\n`);

console.log(
  `batteries: ${modules.length} modules, selected ${selected.size}, excluded ${excluded.length}`,
);
if (excluded.length > 0) {
  console.log(
    `batteries: excluded (Lean/Lake deps): ${excluded.slice(0, 12).join(', ')}${excluded.length > 12 ? ' ...' : ''}`,
  );
}
if (failed.length > 0) {
  console.log(`batteries: ${failed.length} modules failed --deps and were excluded`);
}
console.log(`batteries: filtered source -> ${outSrc}`);
console.log(`batteries: deps -> ${outDeps}`);
