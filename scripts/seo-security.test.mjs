import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('首页入口与边缘安全/路由契约', () => {
  it('index.html 不含未使用的 preconnect，且所有内联脚本均匹配 _headers 中的 CSP 哈希', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    const headers = readFileSync(resolve(root, 'public', '_headers'), 'utf8');

    expect(html).not.toContain('rel="preconnect"');

    const scriptSrcMatch = /script-src\s+([^;\r\n]+)/.exec(headers);
    const scriptSrc = scriptSrcMatch?.[1] ?? '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
    expect(scriptSrc).toContain('blob:');
    expect(scriptSrc).toContain('https://static.cloudflareinsights.com');

    const inlineScripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (m) => m[1]);
    expect(inlineScripts.length).toBeGreaterThan(0);
    for (const body of inlineScripts) {
      const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
      expect(scriptSrc).toContain(hash);
    }
  });

  it('_headers 包含严格的 HSTS 与智能体文件 Content-Type', () => {
    const headers = readFileSync(resolve(root, 'public', '_headers'), 'utf8');
    expect(headers).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    expect(headers).toContain('Cross-Origin-Opener-Policy: same-origin');
    expect(headers).toContain('Cross-Origin-Embedder-Policy: require-corp');
    expect(headers).toContain('/llms.txt');
    expect(headers).toContain('/.well-known/ai-catalog.json');
    expect(headers).toContain('Content-Type: application/json; charset=utf-8');
  });

  it('_redirects 将 SEO 与智能体发现路径全部置于 /* SPA 回退之前', () => {
    const redirects = readFileSync(resolve(root, 'public', '_redirects'), 'utf8');
    const fallbackIndex = redirects.search(/^\/\*\s+\/index\.html\s+200$/m);
    expect(fallbackIndex).toBeGreaterThan(-1);

    for (const path of [
      '/sitemap.xml',
      '/robots.txt',
      '/llms.txt',
      '/.well-known/ai-catalog.json',
      '/ai-catalog.json',
      '/.well-known/ard.json',
    ]) {
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp(`^${escaped}\\s+\\S+\\s+200$`, 'm').exec(redirects);
      expect(match, path).not.toBeNull();
      expect(match.index, path).toBeLessThan(fallbackIndex);
    }
  });
});
