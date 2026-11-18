import { describe, expect, it } from 'vitest';
import { patchGenSymtab } from './patch-symtab.ts';

const SAMPLE_GEN_SYMTAB = `names = {}
order = sorted(names, key=lambda s: s.encode())
with open(out, 'w', encoding='utf-8') as o:
    for n in order:
        kind, sig = names[n]
        if kind == 'f':
            ret, ps = sig
            o.write(f'extern {ret} {n}({", ".join(ps) if ps else "void"});\\n')
        else:
            o.write(f'extern {sig} {n};\\n')
    for n in order:
        o.write(f'  {{"{n}", (void*)&{n}}},\\n')
`;

describe('patchGenSymtab', () => {
  it('注入 IO.getRandomBytes 包装并保持幂等', () => {
    const once = patchGenSymtab(SAMPLE_GEN_SYMTAB);
    expect(once).toContain("if 'l_IO_getRandomBytes___boxed' not in names:");
    expect(once).toContain('lean_io_get_random_bytes');
    expect(once).toContain('lean_unbox_usize(nbytes)');
    expect(once).toContain("addr = sig if kind == 'w' else n");
    expect(patchGenSymtab(once)).toBe(once);
  });

  it('缺少锚点时显式抛错', () => {
    expect(() => patchGenSymtab('print("hi")')).toThrow(/期望命中 1 处/);
  });
});
