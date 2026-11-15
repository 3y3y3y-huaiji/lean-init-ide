/**
 * Lean 运行时 stderr 的规范化层。
 *
 * Lean 通过 Emscripten 的 printErr 输出纯文本；这里只做与宿主无关的最小归一化：
 * 按行切分、识别 wasi-logging 同名的四级（error/warning/info/debug）、去掉级别前缀。
 * 不涉及任何 wasm 指针或 iovec 解码——那属于 WASI 宿主的事，当前 Emscripten 产物用不到。
 */
export type LeanLogLevel = 'error' | 'warning' | 'info' | 'debug';

export interface LeanLogLine {
  level: LeanLogLevel;
  message: string;
}

const LEVEL_PATTERN = /^(error|warning|info|debug)(?::|\s+)/i;

/** 把一行 Lean stderr 归一化为级别 + 正文；无前缀的按 info 处理。 */
export const classifyLeanStderrLine = (line: string): LeanLogLine => {
  const message = line.trim();
  const match = LEVEL_PATTERN.exec(message);
  if (!match) return { level: 'info', message };
  const level = (match[1] ?? 'info').toLowerCase() as LeanLogLevel;
  return {
    level,
    message: message.slice(match[0].length).trim(),
  };
};

/** 把一段 stderr 文本切成非空行并归一化；保留原始顺序。 */
export const parseLeanStderr = (chunk: string): LeanLogLine[] =>
  chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(classifyLeanStderrLine);
