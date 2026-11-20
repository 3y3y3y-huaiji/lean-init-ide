// 发布包入口：只负责创建实例、挂载 olean 库与工作目录，不实现 LSP 语义。
//
// 依赖 NODEFS：libraryDir / workDir 都是宿主机目录，只在 Node 环境可用。
// 浏览器里请自行构造 preRun，把 olean 文件写进 MEMFS 的 /lean/lib/lean。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

import createLean from './lean.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const wasmPath = join(HERE, 'lean.wasm.zst');

let cachedBinary = null;
/** zstd 解压一次并缓存；直接以 wasmBinary 交给 Emscripten，不落临时文件。 */
export function wasmBinary() {
  cachedBinary ??= zstdDecompressSync(readFileSync(wasmPath));
  return cachedBinary;
}

/**
 * @param {object} [options]
 * @param {string} [options.libraryDir] 宿主目录，挂载到 /lean/lib/lean（Init olean 等）
 * @param {string} [options.workDir]    宿主目录，挂载到 /src
 * @param {object} [options.moduleOptions] 原样传给 Emscripten 工厂
 * @returns {Promise<object>} Emscripten 模块实例
 */
export async function createLeanRuntime({ libraryDir, workDir, moduleOptions = {} } = {}) {
  const preRun = [
    (module) => {
      module.FS.mkdirTree('/lean/bin');
      module.FS.mkdirTree('/lean/lib/lean');
      module.FS.mkdirTree('/src');
      if (libraryDir) module.FS.mount(module.NODEFS, { root: libraryDir }, '/lean/lib/lean');
      if (workDir) module.FS.mount(module.NODEFS, { root: workDir }, '/src');
    },
    ...(moduleOptions.preRun ?? []),
  ];
  const lean = await createLean({
    noInitialRun: true,
    wasmBinary: wasmBinary(),
    ...moduleOptions,
    preRun,
  });
  if (workDir) lean.FS.chdir('/src');
  return lean;
}

/** 跑一次 CLI，把 ExitStatus 折成退出码。 */
export function callLean(lean, args) {
  try {
    return lean.callMain(args);
  } catch (error) {
    if (error && error.name === 'ExitStatus' && typeof error.status === 'number')
      return error.status;
    throw error;
  }
}

export { createLean };
