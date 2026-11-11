import { describe, expect, it } from 'vitest';
import { buttonClass, ghostButtonClass, ghostButtonLgClass } from './ui';

describe('共享按钮样式', () => {
  it('大号幽灵按钮在基础类上追加尺寸', () => {
    expect(ghostButtonLgClass.startsWith(ghostButtonClass)).toBe(true);
    expect(ghostButtonLgClass).not.toBe(ghostButtonClass);
  });

  it('主按钮保留禁用态与指针反馈', () => {
    expect(buttonClass).toContain('cursor-pointer');
    expect(buttonClass).toContain('disabled:');
  });

  it('按钮都是行内弹性布局，避免在导航里塌陷', () => {
    for (const value of [buttonClass, ghostButtonClass]) {
      expect(value).toContain('inline-flex');
    }
  });
});
