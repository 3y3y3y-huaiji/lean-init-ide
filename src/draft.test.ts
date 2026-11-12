import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, draftKeyFor, readDraft, saveDraft } from './draft';

describe('练习草稿', () => {
  beforeEach(() => localStorage.clear());

  it('自由编辑器与课时使用不同的 key', () => {
    expect(draftKeyFor()).toBe('lean:draft:playground');
    expect(draftKeyFor('first-proof')).toBe('lean:draft:first-proof');
  });

  it('保存后能读回代码与时间戳', () => {
    saveDraft('lean:draft:first-proof', 'example : True := by trivial');
    const draft = readDraft('lean:draft:first-proof');
    expect(draft?.code).toBe('example : True := by trivial');
    expect(draft?.updatedAt).toBeTypeOf('number');
  });

  it('清空后读不到草稿', () => {
    saveDraft('lean:draft:first-proof', 'code');
    clearDraft('lean:draft:first-proof');
    expect(readDraft('lean:draft:first-proof')).toBeNull();
  });

  it('损坏或结构不符的 JSON 视为没有草稿', () => {
    localStorage.setItem('lean:draft:broken', '{not json');
    localStorage.setItem('lean:draft:shape', JSON.stringify({ code: 1 }));
    expect(readDraft('lean:draft:broken')).toBeNull();
    expect(readDraft('lean:draft:shape')).toBeNull();
  });
});
