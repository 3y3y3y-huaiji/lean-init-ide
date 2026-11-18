// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createWasm64LanguageServer, wasm64Available } from './lean-wasm64-server';
import type { Wasm64Manifest } from './lean-wasm64-runtime';
import type { LeanProcess, LeanProcessCallbacks } from './lean-wasm64-supervisor';

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
};

describe('createWasm64LanguageServer', () => {
  it('清单为空时 wasm64Available 返回 false', () => {
    expect(wasm64Available({ assets: [] })).toBe(false);
    expect(wasm64Available({ assets: [{}] })).toBe(true);
  });

  it('串联运行时加载与 LSP 监督器，并在 dispose 时一并释放 glue URL', async () => {
    const glueBytes = new TextEncoder().encode('export default () => ({});');
    const wasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
    const indexBytes = new TextEncoder().encode(JSON.stringify({ chunks: [], files: [] }));

    const manifest: Wasm64Manifest = {
      cacheKey: 'srv-test',
      leanVersion: '4.36.0-rc2',
      runtime: 'test',
      assets: [
        {
          name: 'lean-lsp-adapted.mjs',
          key: 'k/lean-lsp-adapted.mjs',
          bytes: glueBytes.byteLength,
          sha256: await sha256Hex(glueBytes),
        },
        {
          name: 'lean-lsp.wasm.zst',
          key: 'k/lean-lsp.wasm.zst',
          bytes: wasmBytes.byteLength,
          sha256: await sha256Hex(wasmBytes),
        },
        {
          name: 'lean-init-64.index.json',
          key: 'k/lean-init-64.index.json',
          bytes: indexBytes.byteLength,
          sha256: await sha256Hex(indexBytes),
        },
      ],
    };

    const fakeModule = { fake: true } as unknown as WebAssembly.Module;
    vi.spyOn(WebAssembly, 'compile').mockResolvedValue(fakeModule);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://example.test/srv-glue');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('lean-lsp-adapted.mjs')) return new Response(glueBytes, { status: 200 });
      if (url.includes('lean-lsp.wasm.zst')) return new Response(wasmBytes, { status: 200 });
      if (url.includes('lean-init-64.index.json')) return new Response(indexBytes, { status: 200 });
      return new Response('missing', { status: 404 });
    }) as typeof fetch;

    const spawned: Array<{
      args: readonly string[];
      callbacks: LeanProcessCallbacks;
      disposed: boolean;
    }> = [];

    try {
      const server = await createWasm64LanguageServer({
        manifest,
        createFactory:
          () =>
          (args, callbacks): LeanProcess => {
            const record = { args, callbacks, disposed: false };
            spawned.push(record);
            return {
              ready: Promise.resolve(),
              send: () => undefined,
              dispose: () => {
                record.disposed = true;
              },
            };
          },
      });

      expect(spawned).toHaveLength(1);
      expect(spawned[0]?.args).toEqual(['-j2', '--server']);
      server.dispose();
      expect(spawned[0]?.disposed).toBe(true);
      expect(revokeSpy).toHaveBeenCalledWith('blob:https://example.test/srv-glue');
    } finally {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    }
  });
});
