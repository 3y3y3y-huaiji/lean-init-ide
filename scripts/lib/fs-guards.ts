// 路径校验：脚本里不再出现「路径为空 → 静默读到 cwd」这种事故。
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CliError } from './cli.ts';

export const requireDir = (path: string, label: string): string => {
  if (path.trim() === '') throw new CliError(`${label} 不能为空`);
  const absolute = resolve(path);
  const stat = statSync(absolute, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) throw new CliError(`${label} 不是目录: ${absolute}`);
  return absolute;
};

export const requireFile = (path: string, label: string): string => {
  if (path.trim() === '') throw new CliError(`${label} 不能为空`);
  const absolute = resolve(path);
  const stat = statSync(absolute, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new CliError(`${label} 不是文件: ${absolute}`);
  return absolute;
};

export const optionalDir = (path: string | undefined, label: string): string | undefined =>
  path === undefined ? undefined : requireDir(path, label);
