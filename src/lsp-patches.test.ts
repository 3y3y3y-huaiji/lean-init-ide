import { describe, expect, it } from 'vitest';
import assetsSource from '../node_modules/@wasm-idle/lsp/dist/lean4/assets.js?raw';
import runtimeWorkerSource from '../node_modules/@wasm-idle/lsp/dist/lean4/runtime-worker.js?raw';
import workerSource from '../node_modules/@wasm-idle/lsp/dist/lean4/worker.js?raw';

/**
 * 这些补丁由 scripts/patch-lsp.mjs 在 postinstall/prebuild:web 时应用。
 * 依赖升级如果改了源码形状，补丁会失效；这里直接把关键行为钉住，
 * 避免「安装成功但补丁没生效」悄悄上线。
 */
describe('@wasm-idle/lsp 补丁', () => {
  it('资产并发固定为 6', () => {
    expect(assetsSource).toContain('maxConcurrentDownloads: 6');
  });

  it('MEMFS 接管解压视图，避免每个进程复制 415MB', () => {
    expect(runtimeWorkerSource).toContain('lean.FS.writeFile(path, file.bytes, { canOwn: true });');
  });

  it('解压后释放压缩态引用', () => {
    expect(workerSource).toContain('const payload = { ...(await preflightLean4RuntimeAssets');
    expect(workerSource).toContain('delete payload[name];');
  });

  it('pthread 池保持 64：缩小会让文件检查静默不产生诊断', () => {
    expect(workerSource).toContain("startProcess(['-j4', '--worker', document.uri], 64,");
    expect(workerSource).toContain("startProcess(['-j2', '--server'], 8,");
  });
});
