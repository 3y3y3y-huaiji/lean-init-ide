import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAutoStart,
  getDefaultExtensions,
  getRuntimeArch,
  readRuntimeSession,
  setAutoStart,
  setDefaultExtensions,
  setRuntimeArch,
  writeRuntimeSession,
} from './settings';

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

describe('default extension libraries', () => {
  beforeEach(() => localStorage.clear());

  it('没有记录时返回空数组', () => {
    expect(getDefaultExtensions()).toEqual([]);
  });

  it('保存并读取启动默认库', () => {
    setDefaultExtensions(['std', 'batteries']);
    expect(getDefaultExtensions()).toEqual(['std', 'batteries']);
  });

  it('损坏或结构不符的数据视为空', () => {
    localStorage.setItem('lean:default-extensions', '{not json');
    expect(getDefaultExtensions()).toEqual([]);
    localStorage.setItem('lean:default-extensions', JSON.stringify({ std: true }));
    expect(getDefaultExtensions()).toEqual([]);
    localStorage.setItem('lean:default-extensions', JSON.stringify(['std', 1, null]));
    expect(getDefaultExtensions()).toEqual(['std']);
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

describe('runtime architecture selection', () => {
  beforeEach(() => localStorage.clear());

  it('默认始终为 wasm32，异常存储值也安全回落为 wasm32', () => {
    expect(getRuntimeArch()).toBe('wasm32');
    localStorage.setItem('lean:runtime-arch', 'wasm128');
    expect(getRuntimeArch()).toBe('wasm32');
  });

  it('支持显式切换并持久化保存实验性 wasm64 与切回 wasm32', () => {
    setRuntimeArch('wasm64');
    expect(localStorage.getItem('lean:runtime-arch')).toBe('wasm64');
    expect(getRuntimeArch()).toBe('wasm64');

    setRuntimeArch('wasm32');
    expect(getRuntimeArch()).toBe('wasm32');
  });
});
