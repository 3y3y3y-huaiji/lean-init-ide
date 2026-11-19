import { describe, expect, it } from 'vitest';
import { applyPageMeta, swapLocalePath } from './meta';

describe('swapLocalePath', () => {
  it('互换语言前缀并保留其余路径，英文首页固定回根路径', () => {
    expect(swapLocalePath('/zh/learn/simp', 'zh')).toBe('/en/learn/simp');
    expect(swapLocalePath('/en/privacy', 'en')).toBe('/zh/privacy');
    expect(swapLocalePath('/zh/', 'zh')).toBe('/');
    expect(swapLocalePath('/', 'en')).toBe('/zh/');
  });
});

describe('applyPageMeta', () => {
  it('写入 lang、description、canonical、og 与 hreflang，且重复调用不产生重复标签', () => {
    document.head.innerHTML = '';
    applyPageMeta(document, {
      locale: 'en',
      pathname: '/en/learn/simp',
      title: 'Finishing with simp',
      description: 'Learn how simp rewrites goals.',
    });
    applyPageMeta(document, {
      locale: 'en',
      pathname: '/en/learn/simp',
      title: 'Finishing with simp',
      description: 'Learn how simp rewrites goals.',
    });

    expect(document.documentElement.lang).toBe('en');
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      'https://criticalthinking.de5.net/en/learn/simp',
    );
    expect(document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content).toBe(
      'https://criticalthinking.de5.net/en/learn/simp',
    );
    expect(document.head.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content).toBe(
      'Finishing with simp',
    );
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toBe(
      'Learn how simp rewrites goals.',
    );
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.content,
    ).toBe('en_US');

    const zh = document.head.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="zh"]');
    const en = document.head.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="en"]');
    const xDefault = document.head.querySelector<HTMLLinkElement>(
      'link[rel="alternate"][hreflang="x-default"]',
    );
    expect(zh?.href).toBe('https://criticalthinking.de5.net/zh/learn/simp');
    expect(en?.href).toBe('https://criticalthinking.de5.net/en/learn/simp');
    expect(xDefault?.href).toBe('https://criticalthinking.de5.net/en/learn/simp');
  });

  it('英文首页的 canonical、en 与 x-default 都指向根路径', () => {
    document.head.innerHTML = '';
    applyPageMeta(document, {
      locale: 'en',
      pathname: '/',
      title: 'Lean Init IDE · Run Lean 4 in your browser',
      description: 'Run Lean 4 in the browser.',
    });

    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      'https://criticalthinking.de5.net/',
    );
    expect(
      document.head.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="en"]')?.href,
    ).toBe('https://criticalthinking.de5.net/');
    expect(
      document.head.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="zh"]')?.href,
    ).toBe('https://criticalthinking.de5.net/zh/');
    expect(
      document.head.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="x-default"]')
        ?.href,
    ).toBe('https://criticalthinking.de5.net/');
  });
});
