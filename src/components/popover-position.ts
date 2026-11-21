/**
 * 计算弹出浮层（菜单/提示面板）相对当前视口的水平纠正位移（px）。
 *
 * 手机端工具栏会换到左侧或居中排列，固定写死的 `right-0` 会把宽浮层推向视口左侧外。
 * 在基于 `left-0` / `right-0` 的 CSS 基础定位之上，再叠一层运行时视口夹紧位移，
 * 确保任意视口宽度下浮层完整可见。
 */
export type HorizontalRect = {
  left: number;
  right: number;
  width: number;
};

export const computePopoverShift = (
  rect: HorizontalRect,
  viewportWidth: number,
  margin = 12,
): number => {
  if (
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0 ||
    !Number.isFinite(rect.width) ||
    rect.width <= 0 ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.right)
  ) {
    return 0;
  }

  const available = viewportWidth - margin * 2;
  if (available <= 0 || rect.width >= available) {
    return margin - rect.left;
  }

  if (rect.left < margin) {
    return margin - rect.left;
  }
  if (rect.right > viewportWidth - margin) {
    return viewportWidth - margin - rect.right;
  }
  return 0;
};
