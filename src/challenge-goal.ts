/**
 * 从 Lean 的 plainGoal 文本里数出待证目标数量。
 *
 * Lean 每个目标都以 `⊢` 开头，多个目标之间用空行分隔。这里只做纯文本计数，
 * 不解析 Goal 的结构，视图层拿到数量后可以给非程序员一句易懂的进度提示。
 */
const GOAL_TURNSTILE = '⊢';

export const countGoalTargets = (goalText: string): number => {
  let count = 0;
  for (const char of goalText) {
    if (char === GOAL_TURNSTILE) count += 1;
  }
  return count;
};
