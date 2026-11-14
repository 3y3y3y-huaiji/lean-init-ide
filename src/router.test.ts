import { describe, expect, it } from 'vitest';
import { canonicalRoutePath, resolveRoute } from './router';

describe('resolveRoute', () => {
  it('resolves localized home', () => {
    expect(resolveRoute('/zh/', 'en')).toEqual({
      kind: 'route',
      route: { page: 'home', locale: 'zh' },
    });
  });

  it('resolves a lesson slug', () => {
    expect(resolveRoute('/en/learn/first-proof', 'zh')).toEqual({
      kind: 'route',
      route: { page: 'lesson', locale: 'en', slug: 'first-proof' },
    });
  });

  it('passes unknown slugs through, the view decides how to fall back', () => {
    expect(resolveRoute('/zh/learn/unknown', 'en')).toEqual({
      kind: 'route',
      route: { page: 'lesson', locale: 'zh', slug: 'unknown' },
    });
  });

  it('redirects the bare learn index to the first lesson', () => {
    expect(resolveRoute('/zh/learn', 'en')).toEqual({
      kind: 'redirect',
      path: '/zh/learn/what-is-lean',
    });
  });

  it('resolves the playground', () => {
    expect(resolveRoute('/zh/playground', 'en')).toEqual({
      kind: 'route',
      route: { page: 'playground', locale: 'zh' },
    });
  });

  it('resolves the privacy page', () => {
    expect(resolveRoute('/en/privacy', 'zh')).toEqual({
      kind: 'route',
      route: { page: 'privacy', locale: 'en' },
    });
  });

  it('resolves the reference page', () => {
    expect(resolveRoute('/zh/reference', 'en')).toEqual({
      kind: 'route',
      route: { page: 'reference', locale: 'zh' },
    });
  });

  it('treats unrelated localized paths as not found', () => {
    expect(resolveRoute('/zh/nope', 'en')).toEqual({
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

  it('formats canonical paths consistently for SSG matching', () => {
    expect(canonicalRoutePath({ page: 'home', locale: 'zh' })).toBe('/zh/');
    expect(canonicalRoutePath({ page: 'lesson', locale: 'en', slug: 'induction' })).toBe(
      '/en/learn/induction',
    );
    expect(canonicalRoutePath({ page: 'lesson', locale: 'zh' })).toBe('/zh/learn/what-is-lean');
    expect(canonicalRoutePath({ page: 'playground', locale: 'zh' })).toBe('/zh/playground');
    expect(canonicalRoutePath({ page: 'reference', locale: 'en' })).toBe('/en/reference');
    expect(canonicalRoutePath({ page: 'privacy', locale: 'zh' })).toBe('/zh/privacy');
    expect(canonicalRoutePath({ page: 'notFound', locale: 'en' })).toBe('/en/');
  });
});
