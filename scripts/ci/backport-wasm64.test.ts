import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBackports } from './backport-wasm64.ts';

const write = (root: string, relative: string, text: string): void => {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

const makeLean = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'backport-'));
  write(
    root,
    'src/include/lean/lean.h',
    '#ifdef LEAN_EMSCRIPTEN\n#define LEAN_SCALAR_PTR_LITERAL(a, b, c, d) \\\n  {LEAN_SCALAR_PTR_LITERAL_4(a, b, c, d)}\n#endif\n',
  );
  write(
    root,
    'src/CMakeLists.txt',
    'set(EMSCRIPTEN_SETTINGS "-s ALLOW_MEMORY_GROWTH=1 -fwasm-exceptions -pthread")\n',
  );
  write(
    root,
    'src/kernel/environment.cpp',
    'extern "C" uint8* lean_kernel_diag_is_enabled(object*);\n',
  );
  write(
    root,
    'src/runtime/thread.cpp',
    '#define LEAN_DEFAULT_THREAD_STACK_SIZE 8*1024*1024 // 8MB for 32-bit\n',
  );
  write(
    root,
    'src/util/io.h',
    '#pragma once\nnamespace lean {\nvoid f() {\n        throw exception(error.to_std_string());\n}\n}\n',
  );
  write(
    root,
    'src/library/module.cpp',
    '#include "runtime/io.h"\n' +
      `            return io_result_mk_error((sstream() << "failed to read file '" << olean_fn << "', invalid header").str());\n` +
      `            return io_result_mk_error((sstream() << "failed to read file '" << olean_fn << "', incompatible header").str());\n`,
  );
  write(
    root,
    'src/util/shell.cpp',
    '#include "githash.h"\n' +
      'extern "C" LEAN_EXPORT int lean_main(int argc, char ** argv) {\n' +
      '    foo();\n' +
      '    });\n' +
      '    return shell_rc;\n' +
      '}\n',
  );
  write(
    root,
    'src/initialize/init.cpp',
    'int main() {\n' + '    consume_io_result(initialize_Init(builtin));\n' + '}\n',
  );
  return root;
};

describe('applyBackports', () => {
  it('关键补丁与插桩都打上', () => {
    const root = makeLean();
    const entries = applyBackports(root);
    const status = (name: string): string | undefined =>
      entries.find((entry) => entry.name === name)?.status;

    expect(status('lean.h scalar literal')).toBe('patched');
    expect(status('CMakeLists MEMORY64')).toBe('patched');
    expect(status('environment.cpp diag 返回类型')).toBe('patched');
    expect(status('thread.cpp 线程栈 64MB')).toBe('patched');
    expect(status('util/io.h 内核日志')).toBe('patched');
    expect(status('module.cpp olean 头诊断')).toBe('patched');
    expect(status('shell.cpp 异常兜底')).toBe('patched');
    expect(status('init.cpp 阶段打点')).toBe('patched');

    const leanH = readFileSync(join(root, 'src/include/lean/lean.h'), 'utf8');
    expect(leanH).toContain('#if UINTPTR_MAX == UINT32_MAX');
    expect(leanH).not.toContain('#ifdef LEAN_EMSCRIPTEN');

    const cmake = readFileSync(join(root, 'src/CMakeLists.txt'), 'utf8');
    expect(cmake).toContain('-sMEMORY64=1');

    const init = readFileSync(join(root, 'src/initialize/init.cpp'), 'utf8');
    expect(init).toContain('LEAN_WASM_TRACE');
    expect(init).toContain('info: [init] Init start\\n');

    const shell = readFileSync(join(root, 'src/util/shell.cpp'), 'utf8');
    expect(shell).toContain('lean_wasm_report_exception');
    expect(shell).toContain('catch (...)');

    const module = readFileSync(join(root, 'src/library/module.cpp'), 'utf8');
    expect(module).toContain('lean_trace_write("olean"');
    expect(module).toContain('version=" << int(header.version)');
  });

  it('第二次运行是幂等的', () => {
    const root = makeLean();
    applyBackports(root);
    const second = applyBackports(root);
    expect(second.filter((entry) => entry.status === 'patched')).toEqual([]);
    expect(second.find((entry) => entry.name === 'lean.h scalar literal')?.status).toBe('already');
  });

  it('关键锚点缺失时标记 missing（CLI 会因此失败）', () => {
    const empty = mkdtempSync(join(tmpdir(), 'backport-empty-'));
    const entries = applyBackports(empty);
    expect(
      entries.filter((entry) => entry.critical).every((entry) => entry.status === 'missing'),
    ).toBe(true);
  });
});
