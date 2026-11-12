import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 把运行时补丁应用到 @wasm-idle/lsp 包目录，用于生成 pnpm patch。
 *
 * 安装时补丁由 pnpm-workspace.yaml 的 patchedDependencies 自动应用，不再改写
 * node_modules；升级 @wasm-idle/lsp 后运行 `pnpm run patch:lsp` 重新生成。
 * 模式不匹配会直接抛错，避免依赖升级后补丁静默失效。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = process.argv[2];
if (!packageRoot) {
  throw new Error('usage: node scripts/patch-lsp.mjs <package-root>');
}
const lspDist = path.join(path.resolve(packageRoot), 'dist');

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
 * 1. 资产并发从 3 提到 6：102MB Init 由 6 个 ~22MB pack 主导，6 路正好吃满长肥管道。
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
 * 3. 解压完一个资产就释放压缩态引用，启动峰值不再同时持有 102MB 压缩态 + 415MB 解压态。
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
 * 4. 用浏览器端 wasm zstd 解码器替换 gzip 流：资产从 136 MiB 降到约 102 MiB。
 *    解码器放在 public/vendor/zstddec.mjs，由 worker 以同源绝对路径动态加载，
 *    不进入包依赖图，避免 pnpm 的隔离 node_modules 解析问题。
 */
applyPatch(leanWorker, 'let library;', 'let zstdDecoder;\nlet library;', 'zstd decoder slot');
applyPatch(
  leanWorker,
  "        if ('encoding' in receipt && receipt.encoding === 'gzip') {",
  `        if ('encoding' in receipt && receipt.encoding === 'zstd') {
            if (!zstdDecoder) {
                const zstdDecoderUrl = new URL('/vendor/zstddec.mjs', self.location.origin).href;
                const { ZSTDDecoder } = await import(/* @vite-ignore */ zstdDecoderUrl);
                zstdDecoder = new ZSTDDecoder();
                await zstdDecoder.init();
            }
            bytes = zstdDecoder.decode(new Uint8Array(delivered), receipt.uncompressed.bytes);
            if (bytes.length !== receipt.uncompressed.bytes ||
                hex(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))) !==
                    receipt.uncompressed.sha256)
                throw new Error(\`Lean \${name} decoded receipt mismatch.\`);
        }
        else if ('encoding' in receipt && receipt.encoding === 'gzip') {`,
  'zstd asset decoding',
);

/**
 * 5. MEMFS 直接接管解压后的视图，省掉每个进程一份 415MB 拷贝（canOwn）。
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

/**
 * 6. 把 config/lean4-runtime.json 的交付哈希同步进包内 profile。
 *    这里直接 import 干净包里的 profile、改 assets 再整体写回，避免用正则
 *    逐个匹配六个 pack；上游升级后字段形状变化会在这里立刻暴露。
 */
const manifest = JSON.parse(readFileSync(path.join(root, 'config', 'lean4-runtime.json'), 'utf8'));
const { WASM_LEAN4_PROFILE: profile } = await import(pathToFileURL(runtimePath).href);
for (const asset of manifest.assets) {
  const entry = profile.assets[asset.name];
  if (!entry) continue;
  entry.bytes = asset.bytes;
  entry.sha256 = asset.sha256;
  if (asset.encoding === 'zstd') {
    entry.encoding = 'zstd';
    entry.uncompressed = {
      bytes: asset.uncompressedBytes,
      sha256: asset.uncompressedSha256,
    };
  }
}
profile.workerReceipt = { bytes: workerBytes.length, sha256: workerSha };
writeFileSync(
  runtimePath,
  `export const WASM_LEAN4_PROFILE = ${JSON.stringify(profile, null, 4)};\n//# sourceMappingURL=bundledLean4Runtime.js.map\n`,
);
console.log(
  `lsp patch: profile assets synced; workerReceipt -> ${workerBytes.length} bytes / ${workerSha.slice(0, 12)}…`,
);
