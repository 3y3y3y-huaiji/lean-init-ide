import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectLakeLibs } from './collect-lake-libs.ts';

describe('collectLakeLibs', () => {
  it('合并 base olean 与 mathlib/packages 下的 .lake/build/lib/lean', () => {
    const root = mkdtempSync(join(tmpdir(), 'collect-lake-'));
    const base = join(root, 'olean32');
    const lake = join(root, 'mathlib4');
    const out = join(root, 'out');
    mkdirSync(join(base, 'Init'), { recursive: true });
    writeFileSync(join(base, 'Init', 'Prelude.olean'), 'init');

    mkdirSync(join(lake, '.lake', 'build', 'lib', 'lean', 'Mathlib', 'Tactic'), {
      recursive: true,
    });
    writeFileSync(
      join(lake, '.lake', 'build', 'lib', 'lean', 'Mathlib', 'Tactic', 'Spread.olean'),
      'spread',
    );
    writeFileSync(
      join(lake, '.lake', 'build', 'lib', 'lean', 'Mathlib', 'Tactic', 'Spread.ir'),
      'spread-ir',
    );
    writeFileSync(
      join(lake, '.lake', 'build', 'lib', 'lean', 'Mathlib', 'Tactic', 'ignore.txt'),
      'nope',
    );

    mkdirSync(
      join(lake, '.lake', 'packages', 'batteries', '.lake', 'build', 'lib', 'lean', 'Batteries'),
      { recursive: true },
    );
    writeFileSync(
      join(
        lake,
        '.lake',
        'packages',
        'batteries',
        '.lake',
        'build',
        'lib',
        'lean',
        'Batteries',
        'Data.olean.server',
      ),
      'bat',
    );

    const logs: string[] = [];
    const result = collectLakeLibs(base, lake, out, (m) => logs.push(m));
    expect(result).toEqual({ packageLibDirs: 2, copiedFiles: 3 });
    expect(readFileSync(join(out, 'Init', 'Prelude.olean'), 'utf8')).toBe('init');
    expect(readFileSync(join(out, 'Mathlib', 'Tactic', 'Spread.olean'), 'utf8')).toBe('spread');
    expect(readFileSync(join(out, 'Mathlib', 'Tactic', 'Spread.ir'), 'utf8')).toBe('spread-ir');
    expect(readFileSync(join(out, 'Batteries', 'Data.olean.server'), 'utf8')).toBe('bat');
    expect(existsSync(join(out, 'Mathlib', 'Tactic', 'ignore.txt'))).toBe(false);
    expect(logs).toHaveLength(2);
  });
});
