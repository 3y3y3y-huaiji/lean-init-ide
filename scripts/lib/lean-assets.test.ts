import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isLibraryAsset, walkLibrary } from './lean-assets.ts';

describe('isLibraryAsset', () => {
  it('接受 olean / ir / ilean', () => {
    for (const name of [
      'Init.olean',
      'Init.olean.server',
      'Init.olean.private',
      'Init.ilean',
      'Init.ir',
      'Init.ir.sig',
    ]) {
      expect(isLibraryAsset(name)).toBe(true);
    }
  });

  it('拒绝源码与无关文件', () => {
    for (const name of ['Init.lean', 'Init.c', 'README.md', 'olean']) {
      expect(isLibraryAsset(name)).toBe(false);
    }
  });
});

describe('walkLibrary', () => {
  it('递归收集库文件并跳过其它扩展名', () => {
    const root = mkdtempSync(join(tmpdir(), 'lean-assets-'));
    mkdirSync(join(root, 'Init', 'Data'), { recursive: true });
    writeFileSync(join(root, 'Init.olean'), '');
    writeFileSync(join(root, 'Init', 'Data', 'Nat.olean'), '');
    writeFileSync(join(root, 'Init', 'Data', 'Nat.ir'), '');
    writeFileSync(join(root, 'Init', 'Data', 'Nat.lean'), '');
    const files = walkLibrary(root).map((file) =>
      file
        .slice(root.length + 1)
        .split('\\')
        .join('/'),
    );
    expect(files.sort()).toEqual(['Init.olean', 'Init/Data/Nat.ir', 'Init/Data/Nat.olean']);
  });
});
