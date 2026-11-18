// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WASM64_GLUE,
  WASM64_INDEX,
  WASM64_WASM,
  loadWasm64Runtime,
  wasm64AssetUrl,
  wasm64CandidateUrls,
  wasm64CdnUrl,
  type Wasm64Manifest,
} from './lean-wasm64-runtime';

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
};

describe('loadWasm64Runtime', () => {
  const fakeModule = { fake: true } as unknown as WebAssembly.Module;

  beforeEach(() => {
    vi.spyOn(WebAssembly, 'compile').mockResolvedValue(fakeModule);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://example.test/glue-64');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('清单为空时明确拒绝，不伪造成功', async () => {
    await expect(
      loadWasm64Runtime({
        manifest: { cacheKey: 'empty', leanVersion: '4.36.0-rc2', runtime: 'test', assets: [] },
      }),
    ).rejects.toThrow(/尚未发布/);
  });

  it('校验交付与解压字节，支持 /wasm-lean4-64/ 在 SW 未接管时回退 /cdn/', async () => {
    const glueBytes = new TextEncoder().encode('export default () => ({});');
    const wasmRaw = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
    const wasmZst = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 1]);
    const indexBytes = new TextEncoder().encode(JSON.stringify({ chunks: [], files: [] }));
    const packRaw = new Uint8Array([10, 20, 30]);
    const packZst = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 2]);

    const manifest: Wasm64Manifest = {
      cacheKey: 'w64-test',
      leanVersion: '4.36.0-rc2',
      runtime: 'test',
      assets: [
        {
          name: WASM64_GLUE,
          key: `wasm-lean4/4.36.0-rc2-wasm64/${WASM64_GLUE}`,
          bytes: glueBytes.byteLength,
          sha256: await sha256Hex(glueBytes),
        },
        {
          name: WASM64_WASM,
          key: `wasm-lean4/4.36.0-rc2-wasm64/${WASM64_WASM}`,
          bytes: wasmZst.byteLength,
          sha256: await sha256Hex(wasmZst),
          ranged: true,
          encoding: 'zstd',
          uncompressedBytes: wasmRaw.byteLength,
          uncompressedSha256: await sha256Hex(wasmRaw),
        },
        {
          name: WASM64_INDEX,
          key: `wasm-lean4/4.36.0-rc2-wasm64/${WASM64_INDEX}`,
          bytes: indexBytes.byteLength,
          sha256: await sha256Hex(indexBytes),
        },
        {
          name: 'lean-init-64-00.pack.zst.bin',
          key: 'wasm-lean4/4.36.0-rc2-wasm64/lean-init-64-00.pack.zst.bin',
          bytes: packZst.byteLength,
          sha256: await sha256Hex(packZst),
          ranged: true,
          encoding: 'zstd',
          uncompressedBytes: packRaw.byteLength,
          uncompressedSha256: await sha256Hex(packRaw),
        },
      ],
    };

    const requests: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      requests.push(url);
      // 模拟 SW 未接管：/wasm-lean4-64/ 返回 SPA HTML，触发回退 /cdn/。
      if (url.startsWith('/wasm-lean4-64/')) {
        return new Response('<html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url.includes(WASM64_GLUE)) return new Response(glueBytes, { status: 200 });
      if (url.includes(WASM64_WASM)) return new Response(wasmZst, { status: 200 });
      if (url.includes(WASM64_INDEX)) return new Response(indexBytes, { status: 200 });
      if (url.includes('lean-init-64-00.pack.zst.bin'))
        return new Response(packZst, { status: 200 });
      return new Response('not found', { status: 404 });
    };

    const stages: string[] = [];
    const runtime = await loadWasm64Runtime({
      manifest,
      fetchImpl,
      createZstd: async () => ({
        decode: (bytes) => (bytes[4] === 1 ? wasmRaw : packRaw),
      }),
      onStage: (stage) => stages.push(stage),
    });

    expect(runtime.glueUrl).toBe('blob:https://example.test/glue-64');
    expect(runtime.wasmModule).toBe(fakeModule);
    expect(runtime.library[WASM64_INDEX]).toEqual(indexBytes);
    expect(runtime.library['lean-init-64-00.pack']).toEqual(packRaw);
    expect(runtime.library['lean-init-64-00.pack']?.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(stages).toContain('compile');
    expect(requests.some((url) => url.startsWith('/wasm-lean4-64/'))).toBe(true);
    expect(
      requests.some((url) => url.startsWith('/cdn/wasm-lean4/4.36.0-rc2-wasm64/lean-lsp.wasm.zst')),
    ).toBe(true);

    runtime.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://example.test/glue-64');
  });

  it('SHA-256 不匹配时抛错拒绝加载', async () => {
    const glueBytes = new TextEncoder().encode('glue');
    const manifest: Wasm64Manifest = {
      cacheKey: 'bad',
      leanVersion: '4.36.0-rc2',
      runtime: 'test',
      assets: [
        {
          name: WASM64_GLUE,
          key: `wasm-lean4/4.36.0-rc2-wasm64/${WASM64_GLUE}`,
          bytes: glueBytes.byteLength,
          sha256: '0'.repeat(64),
        },
      ],
    };
    await expect(
      loadWasm64Runtime({
        manifest,
        fetchImpl: async () => new Response(glueBytes, { status: 200 }),
      }),
    ).rejects.toThrow(/SHA-256/);
  });

  it('URL 构造把大文件路由到 /wasm-lean4-64/，小文件直接走 /cdn/', () => {
    const manifest: Wasm64Manifest = {
      cacheKey: 'ck1',
      leanVersion: '4.36.0-rc2',
      runtime: 'test',
      assets: [],
    };
    expect(
      wasm64AssetUrl(manifest, {
        name: WASM64_WASM,
        key: 'wasm-lean4/4.36.0-rc2-wasm64/lean-lsp.wasm.zst',
        bytes: 10,
        sha256: 'ab'.repeat(32),
        ranged: true,
      }),
    ).toBe(`/wasm-lean4-64/${WASM64_WASM}?v=${'ab'.repeat(32)}`);
    expect(
      wasm64CdnUrl(manifest, {
        name: WASM64_GLUE,
        key: 'wasm-lean4/4.36.0-rc2-wasm64/lean-lsp-adapted.mjs',
        bytes: 10,
        sha256: 'cd'.repeat(32),
      }),
    ).toBe('/cdn/wasm-lean4/4.36.0-rc2-wasm64/lean-lsp-adapted.mjs?r=ck1');
  });

  it('单个源超过下载预算时中止，并把超时写进失败汇总', async () => {
    vi.useFakeTimers();
    try {
      const glue = new TextEncoder().encode('glue');
      const manifest: Wasm64Manifest = {
        cacheKey: 'timeout',
        leanVersion: '4.36.0-rc2',
        runtime: 'test',
        assets: [
          {
            name: WASM64_GLUE,
            key: `wasm-lean4/4.36.0-rc2-wasm64/${WASM64_GLUE}`,
            bytes: glue.byteLength,
            sha256: await sha256Hex(glue),
          },
        ],
      };
      const fetchImpl = ((_input: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        })) as typeof fetch;

      const loading = loadWasm64Runtime({ manifest, fetchImpl, assetTimeoutMs: 100 });
      const rejection = loading.catch((error: Error) => error);

      await vi.advanceTimersByTimeAsync(100);

      const error = (await rejection) as Error;
      expect(error.message).toContain('timeout after 100ms');
      expect(error.message).toContain('/cdn/');
    } finally {
      vi.useRealTimers();
    }
  });

  it('国内/海外源排序复用 mirror 与 /cdn/，且绝不在浏览器侧请求 GitHub Release', () => {
    const manifest: Wasm64Manifest = {
      cacheKey: 'ck2',
      leanVersion: '4.36.0-rc2',
      runtime: 'test',
      primary: { label: 'Pages Functions (R2)', baseUrl: '/cdn/' },
      fallback: {
        label: 'GitHub release',
        baseUrl:
          'https://github.com/3y3y3y-huaiji/lean-init-ide/releases/download/runtime-v4.36.0-rc2-wasm64/',
      },
      mirror: {
        label: '魔搭镜像（国内）',
        baseUrl: 'https://modelscope.cn/datasets/HQZMSu/lean4-assets/resolve/master/',
        prefix: 'wasm-lean4/4.36.0-rc2-wasm64',
      },
      assets: [],
    };
    const glue = {
      name: WASM64_GLUE,
      key: 'wasm-lean4/4.36.0-rc2-wasm64/lean-lsp-adapted.mjs',
      source: 'lean-lsp-adapted.mjs',
      bytes: 10,
      sha256: 'cd'.repeat(32),
    };
    const domesticUrls = wasm64CandidateUrls(manifest, glue, true);
    expect(domesticUrls).toEqual([
      'https://modelscope.cn/datasets/HQZMSu/lean4-assets/resolve/master/wasm-lean4/4.36.0-rc2-wasm64/lean-lsp-adapted.mjs',
      '/cdn/wasm-lean4/4.36.0-rc2-wasm64/lean-lsp-adapted.mjs?r=ck2',
    ]);
    const overseasUrls = wasm64CandidateUrls(manifest, glue, false);
    expect(overseasUrls).toEqual([
      '/cdn/wasm-lean4/4.36.0-rc2-wasm64/lean-lsp-adapted.mjs?r=ck2',
      'https://modelscope.cn/datasets/HQZMSu/lean4-assets/resolve/master/wasm-lean4/4.36.0-rc2-wasm64/lean-lsp-adapted.mjs',
    ]);
  });
});
