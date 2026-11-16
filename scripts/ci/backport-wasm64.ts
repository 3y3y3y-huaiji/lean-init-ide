// 把上游 wasm64 需要的修复打到 Lean 源码上（原来是一大段内联 python）。
//
// 用法: node scripts/ci/backport-wasm64.ts <leanSrcDir>
//
// 关键补丁（锚点缺失必须失败）：lean.h 的标量字面量宽度、CMakeLists 的 MEMORY64。
// 其余是诊断插桩与可选修复：锚点缺失只记 missing，不阻塞构建。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectPositionals, parseArgs, runCli } from '../lib/cli.ts';
import { isMainModule } from '../lib/entry.ts';
import { requireDir } from '../lib/fs-guards.ts';

export type BackportStatus = 'patched' | 'already' | 'missing';

export interface BackportEntry {
  readonly name: string;
  readonly status: BackportStatus;
  readonly critical: boolean;
}

type Transformer = (text: string) => string | null;

const applyFile = (
  root: string,
  relativePath: string,
  name: string,
  critical: boolean,
  transform: Transformer,
): BackportEntry => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return { name, status: 'missing', critical };
  const before = readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === null) return { name, status: 'missing', critical };
  if (after === before) return { name, status: 'already', critical };
  writeFileSync(path, after);
  return { name, status: 'patched', critical };
};

const patchLeanHeader: Transformer = (text) => {
  const oldMarker = '#ifdef LEAN_EMSCRIPTEN\n#define LEAN_SCALAR_PTR_LITERAL';
  const newMarker = '#if UINTPTR_MAX == UINT32_MAX\n#define LEAN_SCALAR_PTR_LITERAL';
  if (text.includes(newMarker)) return text;
  if (!text.includes(oldMarker)) return null;
  return text.replace(oldMarker, newMarker);
};

const patchEnvironment: Transformer = (text) => {
  const oldMarker = 'extern "C" uint8* lean_kernel_diag_is_enabled(object*);';
  const newMarker = 'extern "C" uint8 lean_kernel_diag_is_enabled(object*);';
  if (text.includes(newMarker)) return text;
  if (!text.includes(oldMarker)) return null;
  return text.replace(oldMarker, newMarker);
};

const patchThreadStack: Transformer = (text) => {
  const oldMarker = '#define LEAN_DEFAULT_THREAD_STACK_SIZE 8*1024*1024 // 8MB for 32-bit';
  const newMarker = '#define LEAN_DEFAULT_THREAD_STACK_SIZE 64*1024*1024 // 64MB for wasm64';
  if (text.includes(newMarker)) return text;
  if (!text.includes(oldMarker)) return null;
  return text.replace(oldMarker, newMarker);
};

const patchIoHeader: Transformer = (text) => {
  if (text.includes('lean_log_write')) return text;
  if (!text.includes('namespace lean {')) return null;
  let next = text;
  if (!next.includes('#include <cstdio>'))
    next = next.replace('#pragma once', '#pragma once\n#include <cstdio>');
  const helper = `
inline void lean_log_write(unsigned level, char const * category, char const * message) {
    static char const * const names[] = {"error", "warning", "info", "debug"};
    std::fprintf(stderr, "%s: [%s] %s\\n", names[level < 4 ? level : 0], category ? category : "lean", message ? message : "");
    std::fflush(stderr);
}
inline bool lean_wasm_trace_enabled() {
    static int cached = -1;
    if (cached < 0) cached = std::getenv("LEAN_WASM_TRACE") ? 1 : 0;
    return cached == 1;
}
inline void lean_trace_write(char const * category, char const * message) {
    if (lean_wasm_trace_enabled()) lean_log_write(2, category, message);
}
`;
  next = next.replace('namespace lean {', `namespace lean {${helper}`);
  const oldThrow = '        throw exception(error.to_std_string());';
  const newThrow =
    '        std::string msg = error.to_std_string();\n' +
    '        lean_trace_write("io", msg.c_str());\n' +
    '        throw exception(msg);';
  if (!next.includes(oldThrow)) return next;
  return next.replace(oldThrow, newThrow);
};

const patchModuleHeader: Transformer = (text) => {
  if (text.includes('lean_log_write')) return text;
  let next = text;
  if (!next.includes('#include "util/io.h"')) {
    next = next.replace('#include "runtime/io.h"', '#include "runtime/io.h"\n#include "util/io.h"');
  }
  const invalidOld = `            return io_result_mk_error((sstream() << "failed to read file '" << olean_fn << "', invalid header").str());`;
  const invalidNew = `            {
                auto msg = (sstream() << "failed to read file '" << olean_fn << "', invalid header").str();
                lean_trace_write("olean", msg.c_str());
                return io_result_mk_error(msg);
            }`;
  const incompatibleOld = `            return io_result_mk_error((sstream() << "failed to read file '" << olean_fn << "', incompatible header").str());`;
  const incompatibleNew = `            {
                auto msg = (sstream() << "failed to read file '" << olean_fn << "', incompatible header (version=" << int(header.version) << ", flags=" << int(header.flags) << ", githash=" << std::string(header.githash, strnlen(header.githash, sizeof(header.githash))).c_str() << ")").str();
                lean_trace_write("olean", msg.c_str());
                return io_result_mk_error(msg);
            }`;
  next = next.replace(invalidOld, invalidNew);
  next = next.replace(incompatibleOld, incompatibleNew);
  return next === text ? null : next;
};

const patchShell: Transformer = (text) => {
  if (text.includes('LEAN_WASM_ERR')) return text;
  let next = text;
  if (!next.includes('#include <cstdio>')) {
    next = next.replace('#include "githash.h"', '#include <cstdio>\n#include "githash.h"');
  }
  const helper = `
static void lean_wasm_report_exception(char const * type, char const * msg) {
    std::fprintf(stderr, "[LEAN_WASM_ERR] {\\"type\\":\\"%s\\",\\"msg\\":\\"", type);
    for (char const * p = msg; p && *p; ++p) {
        unsigned char c = (unsigned char)*p;
        std::fputc((c == '"' || c == '\\\\' || c < 0x20) ? '\\'' : (char)c, stderr);
    }
    std::fprintf(stderr, "\\"}\\n");
    std::fflush(stderr);
}
`;
  const anchor = 'extern "C" LEAN_EXPORT int lean_main(int argc, char ** argv) {';
  if (!next.includes(anchor)) return null;
  next = next.replace(anchor, `${helper}\n${anchor}\n    try {`);
  const tailOld = '    });\n    return shell_rc;\n}';
  const tailNew =
    '    });\n    return shell_rc;\n' +
    '    } catch (lean::throwable & ex) {\n' +
    '        lean_wasm_report_exception("lean::exception", ex.what());\n' +
    '        return 1;\n' +
    '    } catch (std::exception & ex) {\n' +
    '        lean_wasm_report_exception("std::exception", ex.what());\n' +
    '        return 1;\n' +
    '    } catch (...) {\n' +
    '        lean_wasm_report_exception("unknown", "non-standard exception");\n' +
    '        return 1;\n' +
    '    }\n' +
    '}';
  if (!next.includes(tailOld)) return null;
  return next.replace(tailOld, tailNew);
};

const patchInitTrace: Transformer = (text) => {
  if (text.includes('LEAN_WASM_TRACE')) return text;
  let next = text;
  if (!next.includes('#include <cstdio>')) next = `#include <cstdio>\n#include <cstdlib>\n${next}`;
  for (const stage of ['Init', 'Std', 'Lean']) {
    const pattern = new RegExp(
      `^(\\s*)consume_io_result\\(initialize_${stage}\\(builtin\\)\\);`,
      'm',
    );
    const replacement =
      `$1if (std::getenv("LEAN_WASM_TRACE")) { fprintf(stderr, "info: [init] ${stage} start\\n"); fflush(stderr); }\n` +
      `$1consume_io_result(initialize_${stage}(builtin));`;
    next = next.replace(pattern, replacement);
  }
  return next;
};

const patchCMakeSettings: Transformer = (text) => {
  const oldMarker =
    'set(EMSCRIPTEN_SETTINGS "-s ALLOW_MEMORY_GROWTH=1 -fwasm-exceptions -pthread")';
  const newMarker =
    'set(EMSCRIPTEN_SETTINGS "-sMEMORY64=1 -s ALLOW_MEMORY_GROWTH=1 -fwasm-exceptions -pthread")';
  if (text.includes(newMarker)) return text;
  if (!text.includes(oldMarker)) return null;
  return text.replace(oldMarker, newMarker);
};

export const applyBackports = (leanRoot: string): BackportEntry[] => [
  applyFile(leanRoot, 'src/include/lean/lean.h', 'lean.h scalar literal', true, patchLeanHeader),
  applyFile(leanRoot, 'src/CMakeLists.txt', 'CMakeLists MEMORY64', true, patchCMakeSettings),
  applyFile(
    leanRoot,
    'src/kernel/environment.cpp',
    'environment.cpp diag 返回类型',
    false,
    patchEnvironment,
  ),
  applyFile(leanRoot, 'src/runtime/thread.cpp', 'thread.cpp 线程栈 64MB', false, patchThreadStack),
  applyFile(leanRoot, 'src/util/io.h', 'util/io.h 内核日志', false, patchIoHeader),
  applyFile(
    leanRoot,
    'src/library/module.cpp',
    'module.cpp olean 头诊断',
    false,
    patchModuleHeader,
  ),
  applyFile(leanRoot, 'src/util/shell.cpp', 'shell.cpp 异常兜底', false, patchShell),
  applyFile(leanRoot, 'src/initialize/init.cpp', 'init.cpp 阶段打点', false, patchInitTrace),
];

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2), {});
  const [leanRoot] = expectPositionals(
    parsed,
    1,
    'node scripts/ci/backport-wasm64.ts <leanSrcDir>',
  );
  const root = requireDir(leanRoot ?? '', 'leanSrcDir');
  const entries = applyBackports(root);
  for (const entry of entries) {
    console.log(`${entry.status.padEnd(8)} ${entry.name}${entry.critical ? '（关键）' : ''}`);
  }
  const failed = entries.filter((entry) => entry.critical && entry.status === 'missing');
  if (failed.length > 0) {
    throw new Error(`关键锚点缺失: ${failed.map((entry) => entry.name).join(', ')}`);
  }
};

if (isMainModule(import.meta.url, process.argv[1])) runCli(main);
