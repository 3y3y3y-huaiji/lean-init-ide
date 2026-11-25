import { describe, expect, it } from 'vitest';
import {
  MAX_SHARE_CODE_BYTES,
  buildShareUrl,
  decodeSharedCode,
  encodeSharedCode,
} from './code-share';

describe('code-share', () => {
  it('encodeSharedCode / decodeSharedCode 往返保持 Unicode 与换行无损', async () => {
    const sample = [
      '-- 中文注释',
      'theorem add_comm_demo (a b : Nat) : a + b = b + a := by',
      '  omega',
      '',
    ].join('\n');

    const hash = await encodeSharedCode(sample);
    expect(hash.startsWith('#codez=') || hash.startsWith('#code=')).toBe(true);
    expect(await decodeSharedCode(hash)).toBe(sample);
  });

  it('兼容未压缩的 #code= 格式与缺失/非法输入', async () => {
    const bytes = new TextEncoder().encode('example : 1 + 1 = 2 := rfl');
    const b64 = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    expect(await decodeSharedCode(`#code=${b64}`)).toBe('example : 1 + 1 = 2 := rfl');
    expect(await decodeSharedCode('')).toBeNull();
    expect(await decodeSharedCode('#other=123')).toBeNull();
    expect(await decodeSharedCode('#code=***invalid***')).toBeNull();
    expect(await decodeSharedCode('#codez=invalid_deflate_payload')).toBeNull();
  });

  it('超过 32 KB 上限时拒绝编码与解码', async () => {
    const huge = 'a'.repeat(MAX_SHARE_CODE_BYTES + 1);
    await expect(encodeSharedCode(huge)).rejects.toThrow(/exceeds/i);
    const overB64 = 'QQ'.repeat(MAX_SHARE_CODE_BYTES);
    expect(await decodeSharedCode(`#code=${overB64}`)).toBeNull();
  });

  it('buildShareUrl 会清除 lesson/challenge 参数并写入 hash', async () => {
    const url = await buildShareUrl(
      '#eval 42',
      'https://criticalthinking.de5.net/zh/playground?lesson=first-proof&challenge=add-comm',
    );
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://criticalthinking.de5.net');
    expect(parsed.pathname).toBe('/zh/playground');
    expect(parsed.searchParams.has('lesson')).toBe(false);
    expect(parsed.searchParams.has('challenge')).toBe(false);
    expect(await decodeSharedCode(parsed.hash)).toBe('#eval 42');
  });
});
