import { describe, expect, it } from 'vitest';
import { computePopoverShift } from './popover-position';

describe('computePopoverShift', () => {
  it('浮层完整落在安全边距内时不偏移', () => {
    expect(computePopoverShift({ left: 40, right: 328, width: 288 }, 390)).toBe(0);
    expect(computePopoverShift({ left: 12, right: 378, width: 366 }, 390)).toBe(0);
  });

  it('浮层向左侧溢出时返回向右纠正的正位移', () => {
    expect(computePopoverShift({ left: -98, right: 190, width: 288 }, 390)).toBe(110);
    expect(computePopoverShift({ left: 4, right: 204, width: 200 }, 390)).toBe(8);
  });

  it('浮层向右侧溢出时返回向左纠正的负位移', () => {
    expect(computePopoverShift({ left: 200, right: 488, width: 288 }, 390)).toBe(-110);
    expect(computePopoverShift({ left: 150, right: 382, width: 232 }, 390)).toBe(-4);
  });

  it('浮层宽于可用视口时左边缘对齐安全边距', () => {
    expect(computePopoverShift({ left: -40, right: 340, width: 380 }, 360)).toBe(52);
    expect(computePopoverShift({ left: 30, right: 410, width: 380 }, 360)).toBe(-18);
  });

  it('视口宽度或浮层尺寸非法时安全返回 0', () => {
    expect(computePopoverShift({ left: 0, right: 0, width: 0 }, 390)).toBe(0);
    expect(computePopoverShift({ left: -20, right: 100, width: 120 }, 0)).toBe(0);
    expect(computePopoverShift({ left: Number.NaN, right: 100, width: 120 }, 390)).toBe(0);
  });
});
