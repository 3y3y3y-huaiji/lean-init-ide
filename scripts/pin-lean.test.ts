import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from './lib/cli.ts';
import { LEAN_PIN, cropEventLoopPatch, pinLean, resolveLeanPin } from './pin-lean.ts';

const PATCH = [
  'diff --git a/src/runtime/uv/event_loop.cpp b/src/runtime/uv/event_loop.cpp',
  '--- a/src/runtime/uv/event_loop.cpp',
  '+++ b/src/runtime/uv/event_loop.cpp',
  '@@ -1 +1 @@',
  '-static int alive = 0;',
  '+static uint8_t alive = 0;',
  'diff --git a/src/include/lean/lean.h b/src/include/lean/lean.h',
  '--- a/src/include/lean/lean.h',
  '+++ b/src/include/lean/lean.h',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  '',
].join('\n');

const makeRepo = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'pin-lean-'));
  const producer = join(root, 'wasm-llvm', 'producer', 'lean-browser');
  mkdirSync(join(producer, 'patches'), { recursive: true });
  writeFileSync(join(producer, 'patches', '0001.patch'), PATCH);
  writeFileSync(
    join(producer, 'manifest.json'),
    JSON.stringify(
      {
        sources: { lean4: { version: '4.34.1', commit: 'old' } },
        bootstrap: { url: 'old', sha256: 'old' },
        patches: [{ path: 'patches/0001.patch', sha256: 'old' }],
      },
      null,
      2,
    ),
  );
  return root;
};

describe('cropEventLoopPatch', () => {
  it('只裁掉 event_loop.cpp，保留其它段', () => {
    const { patch, before, after } = cropEventLoopPatch(PATCH);
    expect(before).toBe(2);
    expect(after).toBe(1);
    expect(patch).toContain('lean.h');
    expect(patch).not.toContain('event_loop.cpp');
  });

  it('没有 event_loop.cpp 时原样返回', () => {
    const { patch, before, after } = cropEventLoopPatch('diff --git a/a b/a\n');
    expect(before).toBe(after);
    expect(patch).toBe('diff --git a/a b/a\n');
  });
});

describe('resolveLeanPin', () => {
  it('没有 LEAN_PIN_* 时使用默认 pin', () => {
    expect(resolveLeanPin({})).toEqual(LEAN_PIN);
  });

  it('四个环境变量齐全时整体覆盖', () => {
    const pin = resolveLeanPin({
      LEAN_PIN_VERSION: 'v9.9.9',
      LEAN_PIN_COMMIT: 'deadbeef',
      LEAN_PIN_BOOTSTRAP_URL: 'https://example.com/lean.tar.zst',
      LEAN_PIN_BOOTSTRAP_SHA256: 'abc123',
    });
    expect(pin).toEqual({
      version: 'v9.9.9',
      commit: 'deadbeef',
      bootstrapUrl: 'https://example.com/lean.tar.zst',
      bootstrapSha256: 'abc123',
    });
  });

  it('只给一部分时直接报错，避免版本与引导包错配', () => {
    expect(() => resolveLeanPin({ LEAN_PIN_VERSION: 'v9.9.9' })).toThrowError(/必须同时提供/);
  });
});

describe('pinLean', () => {
  it('改写 manifest 与补丁 sha256', () => {
    const root = makeRepo();
    const result = pinLean(root);
    expect(result.cropped).toBe(true);

    const producer = join(root, 'wasm-llvm', 'producer', 'lean-browser');
    const manifest = JSON.parse(readFileSync(join(producer, 'manifest.json'), 'utf8')) as {
      sources: { lean4: { version: string; commit: string } };
      bootstrap: { url: string; sha256: string };
      patches: Array<{ sha256: string }>;
    };
    expect(manifest.sources.lean4.version).toBe(LEAN_PIN.version);
    expect(manifest.sources.lean4.commit).toBe(LEAN_PIN.commit);
    expect(manifest.bootstrap.url).toBe(LEAN_PIN.bootstrapUrl);
    expect(manifest.bootstrap.sha256).toBe(LEAN_PIN.bootstrapSha256);

    const cropped = readFileSync(join(producer, 'patches', '0001.patch'), 'utf8');
    expect(manifest.patches[0]?.sha256).toBe(createHash('sha256').update(cropped).digest('hex'));
  });

  it('第二次运行是幂等的，不会再次改 sha', () => {
    const root = makeRepo();
    pinLean(root);
    const producer = join(root, 'wasm-llvm', 'producer', 'lean-browser');
    const first = readFileSync(join(producer, 'manifest.json'), 'utf8');
    const second = pinLean(root);
    expect(second.cropped).toBe(false);
    expect(readFileSync(join(producer, 'manifest.json'), 'utf8')).toBe(first);
  });

  it('仓库根不存在时报 CliError', () => {
    expect(() => pinLean(join(tmpdir(), 'definitely-missing-pin-lean'))).toThrowError(CliError);
  });
});
