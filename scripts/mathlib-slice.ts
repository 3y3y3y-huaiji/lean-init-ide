// 裁切 Mathlib：按 import 静态闭包收集目标模块需要的源文件。
//
// 不调用 Lean 工具链：CI 里没有与本项目 Lean 版本一致的官方 Linux 二进制，
// 而 wasm64 编译器一次只能编一个文件，必须先知道完整依赖集合与编译顺序。
//
// 用法：
//   node scripts/mathlib-slice.ts deps <mathlibDir>
//   node scripts/mathlib-slice.ts slice --root <dir> --targets A,B --max N --out <dir> --manifest <file>
//
// 退出码：0 = 有结果；3 = 闭包超过 --max（调用方应跳过编译）；其它 = 出错。
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import {
  CliError,
  expectPositionals,
  optionalString,
  parseArgs,
  requireNumber,
  requireString,
  runCli,
  type FlagSpec,
} from './lib/cli.ts';
import { isMainModule } from './lib/entry.ts';
import { requireDir, requireFile } from './lib/fs-guards.ts';

const BUNDLED = new Set(['Init', 'Std', 'Lean', 'Lake']);

const walk = (dir: string, visit: (file: string) => void): void => {
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
export const indexSources = (root: string): Map<string, string> => {
  const index = new Map<string, string>();
  for (const pkg of readdirSync(root, { withFileTypes: true })) {
    if (!pkg.isDirectory() || pkg.name.startsWith('.')) continue;
    const pkgRoot = join(root, pkg.name);
    walk(pkgRoot, (file) => {
      const rel = relative(pkgRoot, file).split(sep).join('/');
      if (!/^[A-Z][A-Za-z0-9_]*(\/|\.lean$)/.test(rel)) return;
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
export const readImports = (text: string): string[] => {
  const imports: string[] = [];
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
    if (/^(module|prelude)(\s|$)/.test(trimmed)) continue;
    if (trimmed.startsWith('/-')) {
      if (!trimmed.includes('-/')) inBlock = true;
      continue;
    }
    const code = trimmed.replace(/\s--.*$/, '').trim();
    const match = /^(?:(?:public|meta|private|nonrec)\s+)*import\s+(?:all\s+)?([\w.«»']+)$/.exec(
      code,
    );
    if (!match) break;
    const imported = match[1];
    if (imported === undefined) break;
    imports.push(imported);
  }
  return imports;
};

export interface ClosureResult {
  readonly order: string[];
  readonly externals: string[];
}

/** 多目标后序 DFS 并集：共享依赖只出现一次，顺序可直接传给 wasm64 逐个编译。 */
export const collectClosures = (
  index: ReadonlyMap<string, string>,
  targets: readonly string[],
  read: (file: string) => string,
  warn: (message: string) => void = (message) => console.warn(message),
): ClosureResult => {
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const externals = new Set<string>();
  const visit = (module: string, stack: readonly string[]): void => {
    const seen = state.get(module);
    if (seen === 'done') return;
    if (seen === 'visiting') {
      warn(`循环 import ${[...stack, module].join(' -> ')}`);
      return;
    }
    const file = index.get(module);
    if (file === undefined) return;
    state.set(module, 'visiting');
    for (const imported of readImports(read(file))) {
      if (index.has(imported)) visit(imported, [...stack, module]);
      else if (!BUNDLED.has(imported.split('.')[0] ?? '')) externals.add(imported);
    }
    state.set(module, 'done');
    order.push(module);
  };
  for (const target of targets) visit(target, []);
  return { order, externals: [...externals] };
};

/** 单目标后序 DFS：返回可直接顺序编译的模块列表。 */
export const collectClosure = (
  index: ReadonlyMap<string, string>,
  target: string,
  read: (file: string) => string,
  warn: (message: string) => void = (message) => console.warn(message),
): ClosureResult => collectClosures(index, [target], read, warn);

export const printDeps = (mathlibDir: string): void => {
  const manifestPath = requireFile(join(mathlibDir, 'lake-manifest.json'), 'lake-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    packages?: Array<{ name?: string; url?: string; rev?: string }>;
  };
  for (const pkg of manifest.packages ?? []) {
    if (!pkg.url || !pkg.rev) continue;
    console.log(`${pkg.url} ${pkg.rev} ${pkg.name ?? ''}`);
  }
};

const SLICE_SPEC: Record<string, FlagSpec> = {
  root: { kind: 'string', required: true, valueName: 'dir' },
  targets: { kind: 'string', required: true, valueName: 'A,B' },
  optional: { kind: 'string', valueName: 'C,D' },
  union: { kind: 'boolean' },
  out: { kind: 'string', required: true, valueName: 'dir' },
  manifest: { kind: 'string', required: true, valueName: 'file' },
  max: { kind: 'number', valueName: 'N' },
};

export const slice = (
  options: {
    root: string;
    targets: string[];
    optional?: string[];
    union?: boolean;
    out: string;
    manifest: string;
    max?: number;
  },
  log: (message: string) => void = console.log,
): { target: string; targets: string[]; modules: string[] } | null => {
  if (options.targets.length === 0) throw new CliError('--targets 不能为空');
  const root = requireDir(options.root, 'root');
  const index = indexSources(root);
  log(`indexed modules: ${index.size}`);
  const max = options.max ?? Number.POSITIVE_INFINITY;
  const readSource = (file: string) => readFileSync(file, 'utf8');

  let chosenTargets: string[];
  let closure: ClosureResult;

  if (options.union) {
    const present = options.targets.filter((target) => {
      if (index.has(target)) return true;
      log(`skip ${target}: 源码里没有这个模块`);
      return false;
    });
    if (present.length === 0) throw new CliError('没有可用的目标模块');
    closure = collectClosures(index, present, readSource);
    log(
      `union(${present.join(',')}): ${closure.order.length} modules, ${closure.externals.length} externals`,
    );
    if (closure.externals.length) log(`  externals: ${closure.externals.slice(0, 10).join(', ')}`);
    if (closure.order.length > max) {
      log(`oversize: ${present.join(',')} 需要 ${closure.order.length} 个模块，超过上限 ${max}`);
      return null;
    }
    chosenTargets = [...present];
    for (const candidate of options.optional ?? []) {
      if (chosenTargets.includes(candidate)) continue;
      if (!index.has(candidate)) {
        log(`skip optional ${candidate}: 源码里没有这个模块`);
        continue;
      }
      const next = collectClosures(index, [...chosenTargets, candidate], readSource);
      if (next.order.length > max) {
        log(`skip optional ${candidate}: 并集 ${next.order.length} 超过上限 ${max}`);
        continue;
      }
      chosenTargets.push(candidate);
      closure = next;
      log(`include optional ${candidate}: union=${closure.order.length} modules`);
    }
  } else {
    let best: { target: string; order: string[]; externals: string[] } | undefined;
    for (const target of options.targets) {
      if (!index.has(target)) {
        log(`skip ${target}: 源码里没有这个模块`);
        continue;
      }
      const { order, externals } = collectClosure(index, target, readSource);
      log(`${target}: ${order.length} modules, ${externals.length} externals`);
      if (externals.length) log(`  externals: ${externals.slice(0, 10).join(', ')}`);
      if (!best || order.length < best.order.length) best = { target, order, externals };
    }
    if (!best) throw new CliError('没有可用的目标模块');
    if (best.order.length > max) {
      log(`oversize: ${best.target} 需要 ${best.order.length} 个模块，超过上限 ${max}`);
      return null;
    }
    chosenTargets = [best.target];
    closure = { order: best.order, externals: best.externals };
  }

  for (const module of closure.order) {
    const source = index.get(module);
    if (source === undefined) throw new Error(`索引里没有 ${module}`);
    const destination = join(options.out, `${module.replaceAll('.', '/')}.lean`);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  const primary = chosenTargets[0];
  if (!primary) throw new CliError('没有可用的目标模块');
  writeFileSync(
    options.manifest,
    `${JSON.stringify({ target: primary, targets: chosenTargets, modules: closure.order, externals: closure.externals }, null, 2)}\n`,
  );
  log(`slice targets=${chosenTargets.join(',')} modules=${closure.order.length} -> ${options.out}`);
  return { target: primary, targets: chosenTargets, modules: closure.order };
};

const splitCsv = (raw: string): string[] =>
  raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

const main = (): void => {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'deps') {
    const parsed = parseArgs(rest, {});
    const [dir] = expectPositionals(parsed, 1, 'node scripts/mathlib-slice.ts deps <mathlibDir>');
    printDeps(requireDir(dir ?? '', 'mathlibDir'));
    return;
  }
  if (command === 'slice') {
    const parsed = parseArgs(rest, SLICE_SPEC);
    const targets = splitCsv(requireString(parsed, 'targets'));
    const optionalRaw = optionalString(parsed, 'optional');
    const optional = optionalRaw === undefined ? undefined : splitCsv(optionalRaw);
    const max = parsed.flags.max === undefined ? undefined : requireNumber(parsed, 'max');
    const result = slice({
      root: requireString(parsed, 'root'),
      targets,
      ...(optional === undefined ? {} : { optional }),
      ...(parsed.flags.union === true ? { union: true } : {}),
      out: requireString(parsed, 'out'),
      manifest: requireString(parsed, 'manifest'),
      ...(max === undefined ? {} : { max }),
    });
    if (result === null) process.exit(3);
    return;
  }
  throw new CliError('用法: mathlib-slice.ts deps <mathlibDir> | slice --root ... --targets ...');
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
