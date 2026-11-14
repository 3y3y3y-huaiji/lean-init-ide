#!/usr/bin/env node
/**
 * 构建期静态预渲染（SSG）：
 * 为所有已知公开路由生成完整首屏 HTML，消除空白 #app 与串行模块瀑布造成的 LCP 延迟。
 */
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const templatePath = resolve(dist, 'index.html');
const manifestPath = resolve(dist, '.vite', 'manifest.json');

const preloadsFor = (manifest, route) => {
  const keys = [`src/i18n/${route.locale}.ts`];
  if (route.page === 'lesson') keys.push('src/views/lesson.ts');
  else if (route.page === 'playground') keys.push('src/views/playground.ts');
  else if (route.page === 'reference') keys.push('src/views/reference.ts');

  const files = new Set();
  for (const key of keys) {
    const entry = manifest?.[key];
    if (entry?.file) files.add(`/${entry.file}`);
    for (const imp of entry?.imports ?? []) {
      const imported = manifest?.[imp];
      if (imported?.file) files.add(`/${imported.file}`);
    }
  }
  return [...files];
};

const tempDir = await mkdtemp(join(tmpdir(), 'lean-ssg-'));
try {
  const ssrBundle = join(tempDir, 'prerender.mjs');
  await build({
    stdin: {
      contents: `
        export { loadLocale } from './src/i18n/index.ts';
        export { allStaticRoutes, injectPrerenderedHtml, outputRelPath } from './src/prerender.ts';
      `,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: ssrBundle,
    logLevel: 'silent',
    plugins: [
      {
        name: 'stub-client-only',
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /components\/lean-panel$/ }, () => ({
            path: 'lean-panel-stub',
            namespace: 'stub',
          }));
          pluginBuild.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'export const createLeanPanel = () => {};',
            loader: 'js',
          }));
        },
      },
    ],
  });

  const ssr = await import(pathToFileURL(ssrBundle).href);
  await Promise.all([ssr.loadLocale('zh'), ssr.loadLocale('en')]);

  const templateHtml = await readFile(templatePath, 'utf8');
  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    manifest = null;
  }

  const routes = ssr.allStaticRoutes(['zh', 'en']);
  for (const route of routes) {
    const rel = ssr.outputRelPath(route);
    const outPath = resolve(dist, rel);
    await mkdir(dirname(outPath), { recursive: true });
    const html = ssr.injectPrerenderedHtml(templateHtml, route, preloadsFor(manifest, route));
    await writeFile(outPath, html, 'utf8');
  }

  await rm(resolve(dist, '.vite'), { recursive: true, force: true });
  console.log(`SSG 预渲染完成：生成 ${routes.length} 个静态页面`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
