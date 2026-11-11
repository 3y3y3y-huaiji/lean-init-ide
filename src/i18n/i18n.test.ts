import { beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from './en';
import { zh } from './zh';

const collectPaths = (value: unknown, path: string, out: Map<string, unknown>): void => {
  out.set(path, value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPaths(item, `${path}[${index}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectPaths(child, path ? `${path}.${key}` : key, out);
    }
  }
};

describe('translations', () => {
  const zhPaths = new Map<string, unknown>();
  const enPaths = new Map<string, unknown>();
  collectPaths(zh, '', zhPaths);
  collectPaths(en, '', enPaths);

  it('ships the same keys in both locales', () => {
    expect([...enPaths.keys()].sort()).toEqual([...zhPaths.keys()].sort());
  });

  it('has no empty strings', () => {
    for (const [path, value] of zhPaths) {
      if (typeof value === 'string') expect(value.trim(), path).not.toBe('');
    }
    for (const [path, value] of enPaths) {
      if (typeof value === 'string') expect(value.trim(), path).not.toBe('');
    }
  });

  it('defines the same helper functions', () => {
    for (const [path, value] of zhPaths) {
      if (typeof value === 'function') expect(typeof enPaths.get(path), path).toBe('function');
    }
  });
});

describe('detectLocale', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('prefers a remembered locale', async () => {
    localStorage.setItem('lean:locale', 'zh');
    const { detectLocale } = await import('./index');
    expect(detectLocale()).toBe('zh');
  });

  it('falls back to English for non-Chinese browsers', async () => {
    const { detectLocale } = await import('./index');
    expect(detectLocale()).toBe('en');
  });
});
