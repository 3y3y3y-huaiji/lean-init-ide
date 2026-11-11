import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 所有补丁都在安装时幂等应用；模式不匹配会直接抛错，避免依赖升级后静默失效。
 * 这是仓库唯一允许改 node_modules 的地方（postinstall 自动执行）。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lspDist = path.join(root, 'node_modules', '@wasm-idle', 'lsp', 'dist');

const applyPatch = (relativePath, from, to, label) => {
  const target = path.join(lspDist, relativePath);
  const source = readFileSync(target, 'utf8');
  if (source.includes(to)) {
    console.log(`lsp patch: ${label} already applied`);
    return;
  }
  if (!source.includes(from)) {
    throw new Error(
      `lsp patch: expected ${JSON.stringify(from)} in ${target}. The package version changed; update the patch.`,
    );
  }
  writeFileSync(target, source.replace(from, to));
  console.log(`lsp patch: ${label}`);
};

/**
 * 1. 资产并发从 3 提到 6：143MB Init 由 6 个 ~22MB pack 主导，6 路正好吃满长肥管道。
 */
applyPatch(
  path.join('lean4', 'assets.js'),
  'maxConcurrentDownloads: 3',
  'maxConcurrentDownloads: 6',
  'maxConcurrentDownloads 3 -> 6',
);

const leanWorker = path.join('lean4', 'worker.js');

/**
 * 2. 文件进程 pthread 池 64 -> 16。Emscripten 启动时会预创建整个池，每个 Worker
 *    都是独立 JS 上下文。实测 8 会让文件检查静默不产生诊断（界面仍 ready），
 *    16 是能稳定出诊断的下限；bootstrap 的 8 不要动，降到 4 同样会丢诊断。
 */
applyPatch(
  leanWorker,
  "startProcess(['-j4', '--worker', document.uri], 64,",
  "startProcess(['-j4', '--worker', document.uri], 16,",
  'lean file pthread pool 64 -> 16',
);

/**
 * 3. 解压完一个资产就释放压缩态引用，启动峰值不再同时持有 143MB 压缩态 + 415MB 解压态。
 *    preflight 结果是冻结对象，先浅拷贝成可变对象再 delete。
 */
applyPatch(
  leanWorker,
  `    const payload = await preflightLean4RuntimeAssets(data.options.baseUrl, {
        limits,
        persistentCache: data.persistentAssets?.persistentCache,
        reportProgress: (loaded, stage) => scope.postMessage({ type: 'progress', stage, loaded, total: 1 })
    });`,
  `    const payload = { ...(await preflightLean4RuntimeAssets(data.options.baseUrl, {
        limits,
        persistentCache: data.persistentAssets?.persistentCache,
        reportProgress: (loaded, stage) => scope.postMessage({ type: 'progress', stage, loaded, total: 1 })
    })) };`,
  'mutable preflight payload',
);
applyPatch(
  leanWorker,
  `            library[logicalName] = shared;
        }
    }`,
  `            library[logicalName] = shared;
        }
        delete payload[name];
    }`,
  'release compressed asset after inflate',
);

/**
 * 4. MEMFS 直接接管解压后的视图，省掉每个进程一份 415MB 拷贝（canOwn）。
 *    库目录只读；文档 #eval 写入的是 /workspace，不会改共享 pack。
 */
applyPatch(
  path.join('lean4', 'runtime-worker.js'),
  'lean.FS.writeFile(path, file.bytes);',
  'lean.FS.writeFile(path, file.bytes, { canOwn: true });',
  'MEMFS canOwn (skip 415MB copy)',
);

/**
 * 5. 包内硬编码的 runner worker 字节数与 SHA-256 用我们的源文件动态重算，
 *    并同步到 workerReceipt；?v= 随之变化，cacheKey 保持不变。
 */
const workerPath = path.join(root, 'scripts', 'assets', 'runner-worker.js');
const workerBytes = readFileSync(workerPath);
const workerSha = createHash('sha256').update(workerBytes).digest('hex');
const runtimePath = path.join(lspDist, 'bundledLean4Runtime.js');
const runtimeSource = readFileSync(runtimePath, 'utf8');
const receipt = /(workerReceipt:\s*\{\s*bytes:\s*)\d+(,\s*sha256:\s*')[a-f0-9]+(')/;
if (!receipt.test(runtimeSource)) {
  throw new Error('lsp patch: workerReceipt shape changed; update the patch.');
}
const nextRuntime = runtimeSource.replace(
  receipt,
  (_match, prefix, middle, suffix) =>
    `${prefix}${workerBytes.length}${middle}${workerSha}${suffix}`,
);
if (nextRuntime !== runtimeSource) {
  writeFileSync(runtimePath, nextRuntime);
  console.log(
    `lsp patch: workerReceipt -> ${workerBytes.length} bytes / ${workerSha.slice(0, 12)}…`,
  );
} else {
  console.log('lsp patch: workerReceipt already synced');
}
