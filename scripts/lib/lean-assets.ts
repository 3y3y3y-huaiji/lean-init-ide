// Lean 库文件（olean / ir / ilean）的识别与遍历，worker 与握手脚本共用。
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const LIBRARY_ASSET = /[.](olean|olean[.]server|olean[.]private|ilean|ir|ir[.]sig)$/;

export const isLibraryAsset = (fileName: string): boolean => LIBRARY_ASSET.test(fileName);

export const walkLibrary = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkLibrary(path));
    else if (isLibraryAsset(entry.name)) out.push(path);
  }
  return out;
};
