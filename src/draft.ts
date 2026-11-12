/**
 * 练习草稿：按课时把编辑器内容存进 localStorage，刷新后恢复。
 *
 * 只存代码，不做账号同步；写入失败（隐私模式、配额满）时静默忽略。
 */
const PREFIX = 'lean:draft:';

export type Draft = {
  code: string;
  /** 毫秒时间戳，便于以后做「最近练习」入口。 */
  updatedAt: number;
};

/** 同一节课在中英文下共用草稿；自由编辑器单独一个 key。 */
export const draftKeyFor = (lessonSlug?: string): string =>
  `${PREFIX}${lessonSlug && lessonSlug.length > 0 ? lessonSlug : 'playground'}`;

export const readDraft = (key: string): Draft | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { code, updatedAt } = parsed as Partial<Draft>;
    if (typeof code !== 'string' || !Number.isFinite(updatedAt)) return null;
    return { code, updatedAt: updatedAt as number };
  } catch {
    return null;
  }
};

export const saveDraft = (key: string, code: string): void => {
  try {
    localStorage.setItem(key, JSON.stringify({ code, updatedAt: Date.now() }));
  } catch {
    // 隐私模式下写不了，忽略即可。
  }
};

export const clearDraft = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // 同上。
  }
};
