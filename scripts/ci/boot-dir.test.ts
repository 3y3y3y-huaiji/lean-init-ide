import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from './../lib/cli.ts';
import { resolveBootDir } from './boot-dir.ts';

const makeRepo = (version: string, createDir: boolean): string => {
  const root = mkdtempSync(join(tmpdir(), 'boot-dir-'));
  const producer = join(root, 'wasm-llvm', 'producer', 'lean-browser');
  mkdirSync(producer, { recursive: true });
  writeFileSync(
    join(producer, 'manifest.json'),
    JSON.stringify({ sources: { lean4: { version } } }),
  );
  if (createDir) mkdirSync(join(root, 'work', `lean-${version}-linux`), { recursive: true });
  return root;
};

describe('resolveBootDir', () => {
  it('按 manifest 里的版本解析，而不是按字典序取第一个目录', () => {
    const root = makeRepo('4.36.0-rc2', true);
    expect(resolveBootDir(root)).toBe(join(root, 'work', 'lean-4.36.0-rc2-linux'));
  });

  it('目录不存在时报错', () => {
    const root = makeRepo('4.36.0-rc2', false);
    expect(() => resolveBootDir(root)).toThrowError(/引导包目录不存在/);
  });

  it('manifest 缺失时报 CliError', () => {
    const root = mkdtempSync(join(tmpdir(), 'boot-dir-empty-'));
    expect(() => resolveBootDir(root)).toThrowError(CliError);
  });

  it('manifest 缺版本字段时报错', () => {
    const root = mkdtempSync(join(tmpdir(), 'boot-dir-nover-'));
    const producer = join(root, 'wasm-llvm', 'producer', 'lean-browser');
    mkdirSync(producer, { recursive: true });
    writeFileSync(join(producer, 'manifest.json'), '{}');
    expect(() => resolveBootDir(root)).toThrowError(/sources.lean4.version/);
  });
});
