/**
 * `$/lean/plainGoal` 的 rendered 字段是 ```lean 围栏的 Markdown；
 * 直接塞进 <pre> 会把围栏也当成目标正文显示。这里只保留围栏内的文本。
 */
export const stripGoalFence = (rendered: string): string => {
  const lines = rendered.replace(/\r\n/g, '\n').trim().split('\n');
  if (lines[0]?.startsWith('```')) lines.shift();
  if (lines.at(-1)?.trim() === '```') lines.pop();
  return lines.join('\n').trim();
};
