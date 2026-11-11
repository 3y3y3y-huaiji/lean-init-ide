import { describe, expect, it } from 'vitest';
import manifestJson from '../config/lean4-runtime.json';
import { assetSources, rangedAssets, withCacheKey } from './asset-sources.mjs';
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
    const sources = assetSources(manifest, assetByName('lean.wasm.gz.bin'));
    expect(sources).toHaveLength(2);
    expect(sources[0]?.label).toBe('Pages Functions (R2)');
    expect(sources[0]?.url).toBe(`/cdn/lean.wasm.gz?r=${manifest.cacheKey}`);
    expect(sources[1]?.label).toBe('GitHub raw');
    expect(sources[1]?.url).toContain('raw.githubusercontent.com');
    expect(sources[1]?.url).toContain(`?r=${manifest.cacheKey}`);
  });

  it('resolves the relative primary to an absolute URL for Node builds', () => {
    const origin = 'https://operator.ccwu.cc';
    const absolute = new URL(manifest.primary.baseUrl, origin).href;
    const sources = assetSources(manifest, assetByName('lean.mjs'), absolute);
    expect(sources[0]?.url).toBe(`https://operator.ccwu.cc/cdn/lean.mjs?r=${manifest.cacheKey}`);
  });

  it('normalizes an override base URL that lacks a trailing slash', () => {
    const sources = assetSources(manifest, assetByName('lean.mjs'), 'https://staging.example.com/assets');
    expect(sources[0]?.url).toBe(`https://staging.example.com/assets/lean.mjs?r=${manifest.cacheKey}`);
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
    expect(total).toBeGreaterThan(130_000_000);
    expect(total).toBeLessThan(150_000_000);
  });

  it('has unique names and keys, with relative primary and HTTPS fallback', () => {
    expect(new Set(manifest.assets.map((asset) => asset.name)).size).toBe(manifest.assets.length);
    expect(new Set(manifest.assets.map((asset) => asset.key)).size).toBe(manifest.assets.length);
    expect(manifest.primary.baseUrl.startsWith('/')).toBe(true);
    expect(manifest.primary.baseUrl.endsWith('/')).toBe(true);
    expect(manifest.fallback.baseUrl.startsWith('https://')).toBe(true);

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
