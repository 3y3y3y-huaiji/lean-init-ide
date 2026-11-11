import { describe, expect, it } from 'vitest';
import { resolveRoute } from './router';

describe('resolveRoute', () => {
  it('resolves localized home', () => {
    expect(resolveRoute('/zh/', 'en')).toEqual({
      kind: 'route',
      route: { page: 'home', locale: 'zh' },
    });
  });

  it('resolves the first lesson', () => {
    expect(resolveRoute('/en/learn/first-proof', 'zh')).toEqual({
      kind: 'route',
      route: { page: 'lesson', locale: 'en' },
    });
  });

  it('resolves the playground', () => {
    expect(resolveRoute('/zh/playground', 'en')).toEqual({
      kind: 'route',
      route: { page: 'playground', locale: 'zh' },
    });
  });

  it('treats unknown localized paths as not found', () => {
    expect(resolveRoute('/zh/learn/unknown', 'en')).toEqual({
      kind: 'route',
      route: { page: 'notFound', locale: 'zh' },
    });
  });

  it('ignores trailing slashes', () => {
    expect(resolveRoute('/zh/playground/', 'en')).toEqual({
      kind: 'route',
      route: { page: 'playground', locale: 'zh' },
    });
  });

  it('redirects the root to the fallback locale', () => {
    expect(resolveRoute('/', 'zh')).toEqual({ kind: 'redirect', path: '/zh/' });
  });

  it('prefixes bare paths with the fallback locale', () => {
    expect(resolveRoute('/learn/first-proof', 'zh')).toEqual({
      kind: 'redirect',
      path: '/zh/learn/first-proof',
    });
  });
});
