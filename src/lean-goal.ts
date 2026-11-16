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

const METHOD_NOT_FOUND = -32601;
const REQUEST_CANCELLED = -32800;
const CONTENT_MODIFIED = -32801;
const INTERNAL_ERROR = -32603;

type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

const errorCode = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const code = (error as ErrorLike).code;
  return typeof code === 'number' ? code : null;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const message = (error as ErrorLike).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
};

/** LSP 用 -32601 表示服务器没有实现该方法；只有这种错误才能判定“不支持 Goal”。 */
export const isGoalMethodNotFound = (error: unknown): boolean =>
  errorCode(error) === METHOD_NOT_FOUND;

/**
 * 进程被替换、请求取消、内容已修改等错误都是瞬态的：引擎重启期间按一次
 * plainGoal 很可能撞上旧连接被释放，不能据此把 Goal 面板永久判成不支持。
 */
export const isTransientGoalError = (error: unknown): boolean => {
  if (isGoalMethodNotFound(error)) return false;
  const code = errorCode(error);
  if (code === REQUEST_CANCELLED || code === CONTENT_MODIFIED || code === INTERNAL_ERROR) {
    return true;
  }
  return /process was replaced|document process|request (?:was )?cancelled|request (?:was )?canceled|content modified|connection (?:is )?disposed|not connected|session stopped|worker terminated/i.test(
    errorMessage(error),
  );
};
