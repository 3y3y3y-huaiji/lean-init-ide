import { describe, expect, it } from 'vitest';
import { findDeclaration } from './lean-declaration';

const linesOf = (source: string) => source.replace(/^\n/, '').split('\n');

describe('声明定位', () => {
  it('解析单行 theorem 并保留完整命题', () => {
    const lines = linesOf(`
theorem add_comm (a b : Nat) : a + b = b + a := by
  induction a with
`);

    expect(findDeclaration(lines, 1)).toEqual({
      startLine: 0,
      signature: 'theorem add_comm (a b : Nat) : a + b = b + a',
    });
  });

  it('跨行签名会拼接成一行', () => {
    const lines = linesOf(`
theorem add_comm (a b : Nat) :
    a + b = b + a := by
  induction a with
`);

    expect(findDeclaration(lines, 2)?.signature).toBe(
      'theorem add_comm (a b : Nat) : a + b = b + a',
    );
  });

  it('光标在声明之前时返回 null', () => {
    const lines = linesOf(`
import Init

theorem foo : True := trivial
`);

    expect(findDeclaration(lines, 0)).toBeNull();
    expect(findDeclaration(lines, 1)).toBeNull();
  });

  it('多声明文件里取光标所属的那一个', () => {
    const lines = linesOf(`
theorem first : True := trivial

theorem second : 1 = 1 := rfl
  -- 光标在这里
`);

    const found = findDeclaration(lines, 3);
    expect(found?.startLine).toBe(2);
    expect(found?.signature).toBe('theorem second : 1 = 1');
  });

  it('识别 example / def / instance / inductive', () => {
    const cases: Array<[string, string]> = [
      ['example : 1 = 1 := rfl', 'example : 1 = 1'],
      ['def double (n : Nat) : Nat := n + n', 'def double (n : Nat) : Nat'],
      ['instance : Inhabited Nat := ⟨0⟩', 'instance : Inhabited Nat'],
      ['inductive Color where', 'inductive Color'],
    ];

    for (const [source, expected] of cases) {
      expect(findDeclaration([source], 0)?.signature, source).toBe(expected);
    }
  });

  it('没有声明关键字时返回 null', () => {
    expect(findDeclaration([], 0)).toBeNull();
    expect(findDeclaration(['import Init', 'open Nat'], 1)).toBeNull();
  });

  it('超长签名在第 6 行处截断', () => {
    const lines = linesOf(`
theorem long
  (a : Nat)
  (b : Nat)
  (c : Nat)
  (d : Nat)
  (e : Nat)
  (f : Nat) :
  a = a := by
  rfl
`);

    const found = findDeclaration(lines, 8);
    expect(found?.signature).toContain('theorem long');
    expect(found?.signature).toContain('(e : Nat)');
    expect(found?.signature).not.toContain('a = a');
  });

  it('压平多余空白', () => {
    const lines = ['theorem   spaced    (a:  Nat)  :   a  =  a  := by'];

    expect(findDeclaration(lines, 0)?.signature).toBe('theorem spaced (a: Nat) : a = a');
  });

  it('光标行越界时夹到有效范围', () => {
    const lines = ['theorem foo : True := trivial'];

    expect(findDeclaration(lines, -5)?.startLine).toBe(0);
    expect(findDeclaration(lines, 99)?.startLine).toBe(0);
  });

  it('签名在 where 处截断', () => {
    const lines = linesOf(`
def helper : Nat -> Nat
  | 0 => 0
  | n => n
`);

    expect(findDeclaration(lines, 2)?.signature).toBe('def helper : Nat -> Nat');
  });
});
