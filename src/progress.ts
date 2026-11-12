/**
 * 课程进度：只记录「读过哪几节」，存在 localStorage。
 *
 * 不记录代码、不做账号；清空浏览器数据即重置。首页与目录只读这里的数据，
 * 不引入额外的状态管理。
 */
const STORAGE_KEY = 'lean:progress';

const readVisited = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

export const readProgress = (): ReadonlySet<string> => new Set(readVisited());

export const markLessonVisited = (slug: string): void => {
  if (!slug) return;
  const visited = readVisited();
  if (visited.includes(slug)) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited, slug]));
  } catch {
    // 隐私模式下写不了，忽略即可。
  }
};

/** 返回第一节还没读过的课；全部读过时回到第一节。 */
export const firstUnvisitedLesson = (
  slugs: readonly string[],
  visited: ReadonlySet<string>,
): string | undefined => slugs.find((slug) => !visited.has(slug)) ?? slugs[0];
