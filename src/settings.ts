const AUTO_START_KEY = 'lean:auto-start';

/**
 * 打开编辑器页时是否自动下载并启动 Lean。
 * 默认关闭：首次下载约 102MB，应由用户主动决定。
 */
export const getAutoStart = (): boolean => {
  try {
    return localStorage.getItem(AUTO_START_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setAutoStart = (value: boolean) => {
  try {
    localStorage.setItem(AUTO_START_KEY, String(value));
  } catch {
    // 忽略隐私模式下的写入失败，当前页面仍然生效。
  }
};
