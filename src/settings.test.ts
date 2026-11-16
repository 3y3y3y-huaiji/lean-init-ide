import { beforeEach, describe, expect, it } from 'vitest';
import { getAutoStart, readRuntimeSession, setAutoStart, writeRuntimeSession } from './settings';

describe('auto-start setting', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('defaults to off so the 102 MB download is opt-in', () => {
    expect(getAutoStart()).toBe(false);
  });

  it('remembers an explicit opt-in', () => {
    setAutoStart(true);
    expect(localStorage.getItem('lean:auto-start')).toBe('true');
    expect(getAutoStart()).toBe(true);
  });

  it('remembers turning it back off', () => {
    setAutoStart(true);
    setAutoStart(false);
    expect(getAutoStart()).toBe(false);
  });

  it('treats unexpected stored values as off', () => {
    localStorage.setItem('lean:auto-start', 'yes');
    expect(getAutoStart()).toBe(false);
  });
});

describe('runtime session state', () => {
  beforeEach(() => sessionStorage.clear());

  it('没有记录时返回 null', () => {
    expect(readRuntimeSession()).toBeNull();
  });

  it('保存运行状态与扩展库列表，过滤非字符串 id', () => {
    writeRuntimeSession({ active: true, extensions: ['std', 'batteries'] });
    expect(readRuntimeSession()).toEqual({ active: true, extensions: ['std', 'batteries'] });

    sessionStorage.setItem(
      'lean:runtime-session',
      JSON.stringify({ active: false, extensions: ['std', 1, null] }),
    );
    expect(readRuntimeSession()).toEqual({ active: false, extensions: ['std'] });
  });

  it('结构不符或损坏的数据视为没有记录', () => {
    sessionStorage.setItem('lean:runtime-session', '{not json');
    expect(readRuntimeSession()).toBeNull();
    sessionStorage.setItem('lean:runtime-session', JSON.stringify({ active: 'yes' }));
    expect(readRuntimeSession()).toBeNull();
    sessionStorage.setItem('lean:runtime-session', JSON.stringify({ extensions: [] }));
    expect(readRuntimeSession()).toBeNull();
  });
});
