import { beforeEach, describe, expect, it } from 'vitest';
import { getAutoStart, setAutoStart } from './settings';

describe('auto-start setting', () => {
  beforeEach(() => {
    localStorage.clear();
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
