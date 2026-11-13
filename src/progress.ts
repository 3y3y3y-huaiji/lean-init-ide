/**
 * 课程进度：记录「读过哪几节」与「哪几节练习已通过」，只存在 localStorage。
 *
 * 不记录代码、不做账号；清空浏览器数据即重置。首页与目录只读这里的数据，
 * 不引入额外的状态管理。
 */
const VISITED_KEY = 'lean:progress';
const COMPLETED_KEY = 'lean:progress:completed';

const readSlugs = (key: string): string[] => {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

const writeSlugs = (key: string, slugs: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(slugs));
  } catch {
    // 隐私模式下写不了，忽略即可。
  }
};

export const readProgress = (): ReadonlySet<string> => new Set(readSlugs(VISITED_KEY));

/** 练习已通过的课时；只在练习真正解除 sorry 且无错误时写入。 */
export const readCompleted = (): ReadonlySet<string> => new Set(readSlugs(COMPLETED_KEY));

export const markLessonVisited = (slug: string): void => {
  if (!slug) return;
  const visited = readSlugs(VISITED_KEY);
  if (visited.includes(slug)) return;
  writeSlugs(VISITED_KEY, [...visited, slug]);
};

/** 完成练习时同时记已读，保证从 playground 直接进入也能在目录里留下记录。 */
export const markLessonCompleted = (slug: string): void => {
  if (!slug) return;
  markLessonVisited(slug);
  const completed = readSlugs(COMPLETED_KEY);
  if (completed.includes(slug)) return;
  writeSlugs(COMPLETED_KEY, [...completed, slug]);
};

/** 返回第一节还没读过的课；全部读过时回到第一节。 */
export const firstUnvisitedLesson = (
  slugs: readonly string[],
  visited: ReadonlySet<string>,
): string | undefined => slugs.find((slug) => !visited.has(slug)) ?? slugs[0];

/** 返回第一节还没完成的课；全部完成时回到第一节。 */
export const firstUncompletedLesson = (
  slugs: readonly string[],
  completed: ReadonlySet<string>,
): string | undefined => slugs.find((slug) => !completed.has(slug)) ?? slugs[0];
