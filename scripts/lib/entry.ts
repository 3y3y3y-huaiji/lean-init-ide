// 判断当前模块是否是被 `node script.ts` 直接执行的入口（而不是被单测 import）。
import { pathToFileURL } from 'node:url';

export const isMainModule = (importMetaUrl: string, argv1: string | undefined): boolean => {
  if (argv1 === undefined) return false;
  return pathToFileURL(argv1).href === importMetaUrl;
};
