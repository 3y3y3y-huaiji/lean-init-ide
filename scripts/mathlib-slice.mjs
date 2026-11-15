// 裁切 Mathlib：按 import 静态闭包收集目标模块需要的源文件。
//
// 不调用 Lean 工具链：CI 里没有与本项目 Lean 版本一致的官方 Linux 二进制，
// 而 wasm64 编译器一次只能编一个文件，必须先知道完整依赖集合与编译顺序，
// 否则要等编译到一半才发现缺模块。
//
// 用法：
//   node scripts/mathlib-slice.mjs deps <mathlibDir>
//   node scripts/mathlib-slice.mjs slice --root <dir> --targets A,B --max N --out <dir> --manifest <file>
//
// 退出码：0 = 有结果；3 = 闭包超过 --max（调用方应跳过编译）；其它 = 出错。
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

// Init / Std / Lean 的 olean 已经由 wasm64 自己编好，不再进入闭包。
const BUNDLED = new Set(['Init', 'Std', 'Lean', 'Lake']);

const walk = (dir, visit) => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, visit);
    else if (entry.name.endsWith('.lean')) visit(path);
  }
};

/** 只索引库目录（首字母大写的模块根），跳过 scripts/、lake-packages 之类的辅助目录。 */
const indexSources = (root) => {
  const index = new Map();
  for (const pkg of readdirSync(root, { withFileTypes: true })) {
    if (!pkg.isDirectory() || pkg.name.startsWith('.')) continue;
    walk(join(root, pkg.name), (file) => {
      const rel = relative(join(root, pkg.name), file).split(sep).join('/');
      if (!/^[A-Z][A-Za-z0-9_]*\//.test(rel)) return;
      const module = rel.slice(0, -'.lean'.length).replaceAll('/', '.');
      if (!index.has(module)) index.set(module, file);
    });
  }
  return index;
};

/**
 * 只扫文件头部的导入区：Lean 要求 import 在其它命令之前，
 * 这样文档注释里举例用的 `import Foo` 不会被误当成真依赖。
 */
const readImports = (file) => {
  const text = readFileSync(file, 'utf8');
  const imports = [];
  let inBlock = false;
  let offset = 0;
  while (offset < text.length) {
    const lineEnd = text.indexOf('\n', offset);
    const line = text.slice(offset, lineEnd === -1 ? text.length : lineEnd);
    offset = lineEnd === -1 ? text.length : lineEnd + 1;
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('-/')) inBlock = false;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('--')) continue;
    // 新版 Lean 源码会在 import 之前写 module / prelude。
    if (trimmed === 'module' || trimmed === 'prelude') continue;
    if (trimmed.startsWith('/-')) {
      if (!trimmed.includes('-/')) inBlock = true;
      continue;
    }
    const match = /^(?:public\s+)?import\s+(?:all\s+)?([\w.«»']+)$/.exec(trimmed);
    if (!match) break;
    imports.push(match[1]);
  }
  return imports;
};

/** 后序 DFS：返回可直接顺序编译的模块列表。 */
const closure = (index, target) => {
  const order = [];
  const state = new Map();
  const externals = new Set();
  const visit = (module, stack) => {
    const seen = state.get(module);
    if (seen === 'done') return;
    if (seen === 'visiting') {
      // Lean 不允许循环 import，真出现就记一笔继续，避免静默丢文件。
      console.log(`warn: 循环 import ${stack.join(' -> ')} -> ${module}`);
      return;
    }
    state.set(module, 'visiting');
    for (const imported of readImports(index.get(module))) {
      if (index.has(imported)) visit(imported, [...stack, module]);
      else if (!BUNDLED.has(imported.split('.')[0])) externals.add(imported);
    }
    state.set(module, 'done');
    order.push(module);
  };
  visit(target, []);
  return { order, externals: [...externals] };
};

const printDeps = (mathlibDir) => {
  const manifest = JSON.parse(readFileSync(join(mathlibDir, 'lake-manifest.json'), 'utf8'));
  for (const pkg of manifest.packages ?? []) {
    // 只处理 git 依赖：path / 内置工具链条目不需要克隆。
    if (!pkg.url || !pkg.rev) continue;
    console.log(`${pkg.url} ${pkg.rev} ${pkg.name}`);
  }
};

const parseArgs = (argv) => {
  const options = { targets: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') options.root = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--manifest') options.manifest = argv[++i];
    else if (arg === '--max') options.max = Number(argv[++i]);
    else if (arg === '--targets') {
      options.targets = (argv[++i] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    } else throw new Error(`未知参数 ${arg}`);
  }
  return options;
};

const [command, ...rest] = process.argv.slice(2);

if (command === 'deps') {
  printDeps(rest[0]);
} else if (command === 'slice') {
  const options = parseArgs(rest);
  if (!options.root || !options.out || !options.manifest || !options.targets.length) {
    throw new Error('slice 需要 --root --out --manifest --targets');
  }
  const index = indexSources(options.root);
  console.log(`indexed modules: ${index.size}`);
  let best = null;
  for (const target of options.targets) {
    if (!index.has(target)) {
      console.log(`skip ${target}: 源码里没有这个模块`);
      continue;
    }
    const { order, externals } = closure(index, target);
    console.log(`${target}: ${order.length} modules, ${externals.length} externals`);
    if (externals.length) console.log(`  externals: ${externals.slice(0, 10).join(', ')}`);
    if (!best || order.length < best.order.length) best = { target, order, externals };
  }
  if (!best) throw new Error('没有可用的目标模块');
  if (best.order.length > (options.max ?? Infinity)) {
    console.log(`oversize: ${best.target} 需要 ${best.order.length} 个模块，超过上限 ${options.max}`);
    process.exit(3);
  }
  for (const module of best.order) {
    const rel = `${module.replaceAll('.', '/')}.lean`;
    const destination = join(options.out, rel);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(index.get(module), destination);
  }
  writeFileSync(
    options.manifest,
    `${JSON.stringify({ target: best.target, modules: best.order, externals: best.externals }, null, 2)}\n`
  );
  console.log(`slice target=${best.target} modules=${best.order.length} -> ${options.out}`);
} else {
  throw new Error('usage: mathlib-slice.mjs deps <mathlibDir> | slice --root ... --targets ...');
}
