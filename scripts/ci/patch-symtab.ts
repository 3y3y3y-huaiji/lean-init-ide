// 给 wasm-llvm 的 gen-symtab.py 补入缺失的运行时外部符号包装（IO.getRandomBytes）。
// Lean v4.36 的 `@[extern "lean_io_get_random_bytes"]` 不在 $CGEN 里生成 l_IO_getRandomBytes___boxed，
// 导致 Mathlib 经过 Init.Data.Random 时解释器查表返回 NULL。
// 用法: node scripts/ci/patch-symtab.ts <gen-symtab.py>
import { readFileSync, writeFileSync } from 'node:fs';
import { CliError, expectPositionals, parseArgs, runCli } from '../lib/cli.ts';
import { isMainModule } from '../lib/entry.ts';
import { requireFile } from '../lib/fs-guards.ts';

const MARKER = 'wasm64_IO_getRandomBytes___boxed';

const replaceOnce = (source: string, from: string, to: string, label: string): string => {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: 期望命中 1 处，实际 ${count}`);
  return source.replace(from, to);
};

export const patchGenSymtab = (source: string): string => {
  if (source.includes(MARKER)) return source;

  let patched = replaceOnce(
    source,
    'order = sorted(names, key=lambda s: s.encode())',
    [
      'if not files or not funcs:',
      "    raise SystemExit(f'gen-symtab.py: expected .c files and LEAN_EXPORT functions under {root}, got {len(files)} files, {len(funcs)} functions')",
      "if 'l_IO_getRandomBytes___boxed' not in names:",
      `    names['l_IO_getRandomBytes___boxed'] = ('w', '${MARKER}')`,
      'order = sorted(names, key=lambda s: s.encode())',
    ].join('\n'),
    '注册 IO.getRandomBytes 包装条目',
  );

  patched = replaceOnce(
    patched,
    [
      "        if kind == 'f':",
      '            ret, ps = sig',
      '            o.write(f\'extern {ret} {n}({", ".join(ps) if ps else "void"});\\n\')',
      '        else:',
      "            o.write(f'extern {sig} {n};\\n')",
    ].join('\n'),
    [
      "        if kind == 'f':",
      '            ret, ps = sig',
      '            o.write(f\'extern {ret} {n}({", ".join(ps) if ps else "void"});\\n\')',
      "        elif kind == 'w':",
      "            o.write('extern lean_object* lean_io_get_random_bytes(size_t);\\n')",
      "            o.write(f'static lean_object* {sig}(lean_object* nbytes, lean_object* w) {{\\n')",
      "            o.write('  (void)w; size_t n = lean_unbox_usize(nbytes); lean_dec(nbytes); return lean_io_get_random_bytes(n);\\n')",
      "            o.write('}\\n')",
      '        else:',
      "            o.write(f'extern {sig} {n};\\n')",
    ].join('\n'),
    '生成 IO.getRandomBytes C 包装函数',
  );

  patched = replaceOnce(
    patched,
    '    for n in order:\n        o.write(f\'  {{"{n}", (void*)&{n}}},\\n\')',
    "    for n in order:\n        kind, sig = names[n]\n        addr = sig if kind == 'w' else n\n        o.write(f'  {{\"{n}\", (void*)&{addr}}},\\n')",
    '符号表绑定包装函数地址',
  );

  return patched;
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), {});
  const [target = ''] = expectPositionals(
    parsed,
    1,
    'node scripts/ci/patch-symtab.ts <gen-symtab.py>',
  );
  if (!target) throw new CliError('缺少 gen-symtab.py 路径');
  const file = requireFile(target, 'gen-symtab.py');
  const next = patchGenSymtab(readFileSync(file, 'utf8'));
  writeFileSync(file, next);
  console.log(`patched ${target}`);
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
