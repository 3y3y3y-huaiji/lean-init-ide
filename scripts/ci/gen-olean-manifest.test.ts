import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectOleanManifest } from './gen-olean-manifest.ts';

describe('collectOleanManifest', () => {
  it('递归 Init/ 并补上根目录的 Init 附属文件', () => {
    const root = mkdtempSync(join(tmpdir(), 'olean-manifest-'));
    mkdirSync(join(root, 'Init', 'Data'), { recursive: true });
    mkdirSync(join(root, 'Lean'), { recursive: true });
    for (const file of [
      'Init/Prelude.olean',
      'Init/Prelude.olean.server',
      'Init/Prelude.olean.private',
      'Init/Prelude.ilean',
      'Init/Data/Nat.olean',
      'Init.olean',
      'Init.olean.server',
      'Init.ilean',
      'Lean/Util.olean',
      'Init/Prelude.lean',
    ]) {
      writeFileSync(join(root, file), '');
    }

    expect(collectOleanManifest(root)).toEqual([
      'Init.ilean',
      'Init.olean',
      'Init.olean.server',
      'Init/Data/Nat.olean',
      'Init/Prelude.ilean',
      'Init/Prelude.olean',
      'Init/Prelude.olean.private',
      'Init/Prelude.olean.server',
    ]);
  });

  it('没有 Init 目录时返回空列表', () => {
    const root = mkdtempSync(join(tmpdir(), 'olean-empty-'));
    expect(collectOleanManifest(root)).toEqual([]);
  });
});
