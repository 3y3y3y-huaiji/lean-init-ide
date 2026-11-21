import { describe, expect, it } from 'vitest';
import assetsSource from '../node_modules/@wasm-idle/lsp/dist/lean4/assets.js?raw';
import bundledRuntimeSource from '../node_modules/@wasm-idle/lsp/dist/bundledLean4Runtime.js?raw';
import runtimeWorkerSource from '../node_modules/@wasm-idle/lsp/dist/lean4/runtime-worker.js?raw';
import typesSource from '../node_modules/@wasm-idle/lsp/dist/types.d.ts?raw';
import workerSource from '../node_modules/@wasm-idle/lsp/dist/lean4/worker.js?raw';

/**
 * 这些补丁由 pnpm-workspace.yaml 的 patchedDependencies 在安装时应用（patches/ 目录）。
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

  it('pthread 池保持 16/8：再小会让文件检查静默不产生诊断', () => {
    expect(workerSource).toContain("startProcess(['-j4', '--worker', document.uri], 16,");
    expect(workerSource).toContain("startProcess(['-j2', '--server'], 8,");
  });

  it('用同源 wasm 解码器解 zstd 资产', () => {
    expect(workerSource).toContain("receipt.encoding === 'zstd'");
    expect(workerSource).toContain("new URL('/vendor/zstddec.mjs', self.location.origin).href");
    expect(workerSource).toContain('@vite-ignore');
    expect(bundledRuntimeSource).toContain('"encoding": "zstd"');
  });

  it('解压后释放 zstd 解码器的 Wasm 堆', () => {
    expect(workerSource).toContain('zstdDecoder = undefined;');
  });

  it('zstd SHA-256 直接校验视图，不再深拷贝 110MB', () => {
    expect(workerSource).toContain(
      "if (bytes.length !== receipt.uncompressed.bytes ||\n                hex(await crypto.subtle.digest('SHA-256', bytes)) !==",
    );
  });

  it('--server 引导进程跳过库文件挂载', () => {
    expect(runtimeWorkerSource).toContain("data.args.includes('--server')");
    expect(runtimeWorkerSource).toContain('isServerBootstrap ? [] : unpackLibrary(data.library)');
  });

  it('扩展包 SharedArrayBuffer 零拷贝透传进 Worker', () => {
    expect(workerSource).toContain('buffer instanceof SharedArrayBuffer');
    expect(typesSource).toContain('extensionPacks?: Record<string, ArrayBufferLike>');
  });

  it('打通 wasm32 线性内存上报、非阻塞 pollMemory 与 dispose 防泄漏置空', () => {
    expect(runtimeWorkerSource).toContain('reportMemory();');
    expect(runtimeWorkerSource).toContain(
      'self.postMessage({ ready: true, memoryBytes: lastMemoryBytes, wasmMemory });',
    );
    expect(workerSource).toContain('processWasmMemory = data.wasmMemory;');
    expect(workerSource).toContain('processWasmMemory = undefined;');
    expect(workerSource).toContain("data?.type === 'pollMemory'");
    expect(workerSource).toContain("type: 'memorySample'");
  });
});
