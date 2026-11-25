// 把 config/lean4-runtime.json 的交付信息同步进 @wasm-idle/lsp 自带的 WASM_LEAN4_PROFILE。
//
// 为什么需要：@wasm-idle/lsp 的 profile（含每个资产 bytes / sha256 / zstd 解压信息）是**补丁快照**
// 的一部分，pnpm install 时就固定了。清单升级到 Lean 4.36 后，profile 仍是 4.35 的字节数，
// 运行时把「清单里的新分片」当成超出 profile 上限的资产，直接报
// `Runtime asset lean-init-00.pack.gz.bin exceeds the 18279146 byte limit`（#76 的 E2E 红）。
//
// 这里在每次 build 前按清单重写 profile，让资产描述跟着清单走，不再依赖补丁里冻结的快照。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const runtimePath = join(
  root,
  'node_modules',
  '@wasm-idle',
  'lsp',
  'dist',
  'bundledLean4Runtime.js',
);

const manifestPath = join(root, 'config', 'lean4-runtime.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const runtimeVersion = /(\d+\.\d+\.\d+)/.exec(manifest.runtime ?? '')?.[1];
if (runtimeVersion === undefined) {
  throw new Error(`config/lean4-runtime.json 的 runtime 字段里没有版本号: ${manifest.runtime}`);
}

const { WASM_LEAN4_PROFILE: profile } = await import(pathToFileURL(runtimePath).href);

const logicalNameOf = (name) => {
  const match = /^(.*?)\.gz(\.bin)?$/.exec(name);
  return match?.[1];
};

const nextAssets = {};
for (const asset of manifest.assets) {
  const previous = profile.assets[asset.name] ?? {};
  const entry = { ...previous };
  entry.upstream = previous.upstream ?? asset.source ?? asset.name;
  const logicalName = previous.logicalName ?? logicalNameOf(asset.name);
  if (logicalName !== undefined) entry.logicalName = logicalName;
  if (asset.encoding === 'zstd') {
    entry.encoding = 'zstd';
    entry.uncompressed = {
      bytes: asset.uncompressedBytes,
      sha256: asset.uncompressedSha256,
    };
  }
  entry.bytes = asset.bytes;
  entry.sha256 = asset.sha256;
  nextAssets[asset.name] = entry;
}

const removed = Object.keys(profile.assets).filter((name) => nextAssets[name] === undefined);

profile.version = runtimeVersion;
profile.profileId = String(profile.profileId).replace(/\d+\.\d+\.\d+/, runtimeVersion);
// profile.source 指向生成该 profile 的构建 commit；清单里没有这个信息，保持原值即可。
profile.assets = nextAssets;

writeFileSync(
  runtimePath,
  `export const WASM_LEAN4_PROFILE = ${JSON.stringify(profile, null, 4)};\n//# sourceMappingURL=bundledLean4Runtime.js.map\n`,
);

// 写完立刻读回校验，避免「脚本跑绿但文件没变」这类静默失败。
const check = readFileSync(runtimePath, 'utf8');
for (const asset of manifest.assets) {
  const needle = `"bytes": ${asset.bytes}`;
  if (!check.includes(needle)) {
    throw new Error(`profile 未写入 ${asset.name} 的字节数 ${asset.bytes}`);
  }
}
if (!check.includes(`"version": ${JSON.stringify(runtimeVersion)}`)) {
  throw new Error(`profile 未更新到 ${runtimeVersion}`);
}

console.log(
  `lsp profile synced: ${profile.profileId} · ${manifest.assets.length} assets` +
    (removed.length ? ` · 移除清单外条目 ${removed.join(', ')}` : ''),
);
