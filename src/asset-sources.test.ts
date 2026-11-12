import { describe, expect, it } from 'vitest';
import manifestJson from '../config/lean4-runtime.json';
import {
  assetSources,
  isSourceMode,
  prefersDomesticMirror,
  rangedAssets,
  withCacheKey,
} from './asset-sources.mjs';
import type { RuntimeManifest } from './asset-sources.mjs';

const manifest = manifestJson as unknown as RuntimeManifest;
const assetByName = (name: string) => {
  const asset = manifest.assets.find((item) => item.name === name);
  if (!asset) throw new Error(`missing manifest asset ${name}`);
  return asset;
};

describe('withCacheKey', () => {
  it('appends the revision as a cache key', () => {
    expect(withCacheKey('https://example.com/a.gz', 'abc1234')).toBe(
      'https://example.com/a.gz?r=abc1234',
    );
  });

  it('overwrites an existing r but keeps other query parameters', () => {
    expect(withCacheKey('https://example.com/a.gz?x=1&r=old', 'new')).toBe(
      'https://example.com/a.gz?x=1&r=new',
    );
  });

  it('leaves the URL untouched when there is no cache key', () => {
    expect(withCacheKey('https://example.com/a.gz?x=1', '')).toBe('https://example.com/a.gz?x=1');
  });

  it('works on a same-origin relative path', () => {
    expect(withCacheKey('/cdn/lean.wasm.gz', 'abc1234')).toBe('/cdn/lean.wasm.gz?r=abc1234');
    expect(withCacheKey('/cdn/lean.wasm.gz?x=1', 'abc1234')).toBe(
      '/cdn/lean.wasm.gz?x=1&r=abc1234',
    );
  });
});

describe('assetSources', () => {
  it('puts the same-origin R2 gateway first and GitHub raw second', () => {
    const sources = assetSources(manifest, assetByName('lean.mjs'));
    expect(sources).toHaveLength(2);
    expect(sources[0]?.label).toBe('Pages Functions (R2)');
    expect(sources[0]?.url).toBe(`/cdn/lean.mjs?r=${manifest.cacheKey}`);
    expect(sources[1]?.label).toBe('GitHub raw');
    expect(sources[1]?.url).toContain('raw.githubusercontent.com');
    expect(sources[1]?.url).toContain(`?r=${manifest.cacheKey}`);
  });

  it('zstd 资产不回退到 GitHub raw 的上游 gzip', () => {
    const asset = assetByName('lean.wasm.gz.bin');
    expect(asset.encoding).toBe('zstd');
    const sources = assetSources(manifest, asset);
    expect(sources.map((source) => source.label)).toEqual(['Pages Functions (R2)']);
    expect(sources[0]?.url).toBe(`/cdn/lean.wasm.gz.bin?r=${manifest.cacheKey}`);
  });

  it('resolves the relative primary to an absolute URL for Node builds', () => {
    const origin = 'https://criticalthinking.de5.net';
    const absolute = new URL(manifest.primary.baseUrl, origin).href;
    const sources = assetSources(manifest, assetByName('lean.mjs'), absolute);
    expect(sources[0]?.url).toBe(
      `https://criticalthinking.de5.net/cdn/lean.mjs?r=${manifest.cacheKey}`,
    );
  });

  it('normalizes an override base URL that lacks a trailing slash', () => {
    const sources = assetSources(
      manifest,
      assetByName('lean.mjs'),
      'https://staging.example.com/assets',
    );
    expect(sources[0]?.url).toBe(
      `https://staging.example.com/assets/lean.mjs?r=${manifest.cacheKey}`,
    );
  });

  it('deduplicates sources that resolve to the same URL', () => {
    const sources = assetSources(manifest, assetByName('lean.mjs'), manifest.fallback.baseUrl);
    expect(sources).toHaveLength(1);
  });

  it('does not invent a GitHub fallback for a local-only asset', () => {
    const sources = assetSources(manifest, assetByName('runner-worker.js'));
    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toBe(`/cdn/runner-worker.js?r=${manifest.cacheKey}`);
  });

  describe('魔搭镜像', () => {
    const mirrored = {
      ...manifest,
      mirror: {
        label: 'ModelScope (CN)',
        baseUrl: 'https://modelscope.cn/datasets/example/lean4-assets/resolve/master/',
      },
    } as RuntimeManifest;

    it('mirrorFirst 时排在最前，按 cacheKey 目录取文件且不带 ?r=', () => {
      const sources = assetSources(mirrored, assetByName('lean.mjs'), undefined, {
        mirrorFirst: true,
      });
      expect(sources.map((source) => source.label)).toEqual([
        'ModelScope (CN)',
        'Pages Functions (R2)',
        'GitHub raw',
      ]);
      expect(sources[0]?.url).toBe(
        `https://modelscope.cn/datasets/example/lean4-assets/resolve/master/${manifest.cacheKey}/lean.mjs`,
      );
    });

    it('zstd 资产只保留镜像与同源网关', () => {
      const sources = assetSources(mirrored, assetByName('lean.wasm.gz.bin'), undefined, {
        mirrorFirst: true,
      });
      expect(sources.map((source) => source.label)).toEqual([
        'ModelScope (CN)',
        'Pages Functions (R2)',
      ]);
    });

    it('配置 prefix 时镜像目录固定，不再拼 cacheKey', () => {
      const prefixed = {
        ...manifest,
        mirror: {
          label: 'ModelScope (CN)',
          baseUrl: 'https://modelscope.cn/datasets/example/lean4-assets/resolve/master/',
          prefix: 'wasm-lean4',
        },
      } as RuntimeManifest;
      const sources = assetSources(prefixed, assetByName('lean.mjs'), undefined, {
        mirrorFirst: true,
      });
      expect(sources[0]?.url).toBe(
        'https://modelscope.cn/datasets/example/lean4-assets/resolve/master/wasm-lean4/lean.mjs',
      );
    });

    it('includeMirror 时插在 primary 之后', () => {
      const sources = assetSources(mirrored, assetByName('lean.mjs'), undefined, {
        includeMirror: true,
      });
      expect(sources.map((source) => source.label)).toEqual([
        'Pages Functions (R2)',
        'ModelScope (CN)',
        'GitHub raw',
      ]);
    });

    it('默认不启用镜像，Node 构建行为不变', () => {
      const sources = assetSources(mirrored, assetByName('lean.mjs'));
      expect(sources.map((source) => source.label)).toEqual(['Pages Functions (R2)', 'GitHub raw']);
    });
  });

  describe('诊断用的强制源', () => {
    it('githubFirst 把 GitHub 排到最前，其余源保留做回退', () => {
      const sources = assetSources(manifest, assetByName('lean.mjs'), undefined, {
        githubFirst: true,
      });
      expect(sources.map((source) => source.label)).toEqual(['GitHub raw', 'Pages Functions (R2)']);
      expect(sources[0]?.url).toContain('raw.githubusercontent.com');
    });

    it('没有 GitHub 回退的资产不会凭空造源', () => {
      const sources = assetSources(manifest, assetByName('runner-worker.js'), undefined, {
        githubFirst: true,
      });
      expect(sources.map((source) => source.label)).toEqual(['Pages Functions (R2)']);
    });

    it('只认 mirror / cdn / github 三个值', () => {
      expect(isSourceMode('mirror')).toBe(true);
      expect(isSourceMode('cdn')).toBe(true);
      expect(isSourceMode('github')).toBe(true);
      expect(isSourceMode('')).toBe(false);
      expect(isSourceMode(null)).toBe(false);
      expect(isSourceMode('MIRROR')).toBe(false);
    });
  });
});

describe('prefersDomesticMirror', () => {
  it('treats a Chinese first choice as domestic', () => {
    expect(prefersDomesticMirror('zh-CN,zh;q=0.9,en;q=0.8')).toBe(true);
    expect(prefersDomesticMirror('zh-Hant-TW,zh;q=0.9')).toBe(true);
    expect(prefersDomesticMirror('zh')).toBe(true);
  });

  it('keeps other languages and missing headers on the overseas order', () => {
    expect(prefersDomesticMirror('en-US,en;q=0.9')).toBe(false);
    expect(prefersDomesticMirror('ja-JP,ja;q=0.9,en;q=0.5')).toBe(false);
    expect(prefersDomesticMirror('*')).toBe(false);
    expect(prefersDomesticMirror('')).toBe(false);
    expect(prefersDomesticMirror(null)).toBe(false);
  });
});

describe('runtime manifest', () => {
  it('ships seven ranged assets with pinned sizes and hashes', () => {
    const ranged = rangedAssets(manifest);
    expect(ranged).toHaveLength(7);
    for (const asset of ranged) {
      expect(asset.bytes).toBeGreaterThan(0);
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.key).toBeTruthy();
    }
    const total = ranged.reduce((sum, asset) => sum + asset.bytes, 0);
    expect(total).toBeGreaterThan(95_000_000);
    expect(total).toBeLessThan(115_000_000);
    for (const asset of ranged) {
      if (asset.encoding !== 'zstd') continue;
      const upstreamBytes = asset.upstreamBytes ?? 0;
      const uncompressedBytes = asset.uncompressedBytes ?? 0;
      expect(asset.upstream).toMatch(/\.gz$/);
      expect(upstreamBytes).toBeGreaterThan(asset.bytes);
      expect(uncompressedBytes).toBeGreaterThan(upstreamBytes);
      expect(asset.uncompressedSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('has unique names and keys, with relative primary and HTTPS fallback', () => {
    expect(new Set(manifest.assets.map((asset) => asset.name)).size).toBe(manifest.assets.length);
    expect(new Set(manifest.assets.map((asset) => asset.key)).size).toBe(manifest.assets.length);
    expect(manifest.primary.baseUrl.startsWith('/')).toBe(true);
    expect(manifest.primary.baseUrl.endsWith('/')).toBe(true);
    expect(manifest.fallback.baseUrl.startsWith('https://')).toBe(true);
    expect(manifest.mirror?.baseUrl.startsWith('https://')).toBe(true);

    for (const asset of manifest.assets) {
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      const urls = assetSources(manifest, asset).map((source) => source.url);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url.startsWith('/') || url.startsWith('https://')).toBe(true);
      }
    }
  });
});
