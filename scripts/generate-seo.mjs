#!/usr/bin/env node
/**
 * 构建期生成 dist/sitemap.xml 与 dist/robots.txt。
 *
 * 路由从课程数据源经 allStaticRoutes 枚举，不在仓库里维护课程清单；
 * lastmod 取对应源文件的最后一次 git 提交日期，浅克隆或无 git 历史时才退到文件 mtime。
 * 输出只写 dist/，仓库工作区不会因此变脏。
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

const today = () => new Date().toISOString().slice(0, 10);

/** 最近一次改动这些文件的提交日期；路径不存在或没有历史时返回 null。 */
const gitLastModified = (paths) => {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...paths], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
};

/**
 * 浅克隆里 git log 看不到更早的提交，退到文件 mtime；
 * CI 的 checkout 会把 mtime 刷成构建当天，这与任务允许的降级行为一致。
 */
const fileModified = (paths) => {
  for (const path of paths) {
    const file = resolve(root, path);
    if (existsSync(file)) return new Date(statSync(file).mtimeMs).toISOString().slice(0, 10);
  }
  return null;
};

const lastModifiedFor = (route, routeSourceFiles) =>
  gitLastModified(routeSourceFiles(route)) ?? fileModified(routeSourceFiles(route)) ?? today();

const tempDir = await mkdtemp(join(tmpdir(), 'lean-seo-'));
try {
  const ssrBundle = join(tempDir, 'seo.mjs');
  await build({
    stdin: {
      contents: `
        export { loadLocale } from './src/i18n/index.ts';
        export { allStaticRoutes } from './src/prerender.ts';
        export { buildAiCatalogJson, buildLlmsTxt, buildRobotsTxt, buildSitemapXml, routeSourceFiles } from './src/seo.ts';
        export { canonicalRoutePath } from './src/router.ts';
        export { SITE_ORIGIN } from './src/meta.ts';
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
        // 与 prerender.mjs 一样跳过 Monaco 装配层，SEO 生成不需要浏览器环境。
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

  const routes = ssr.allStaticRoutes(['zh', 'en']);
  const entries = routes.map((route) => ({
    loc: `${ssr.SITE_ORIGIN}${ssr.canonicalRoutePath(route)}`,
    lastmod: lastModifiedFor(route, ssr.routeSourceFiles),
  }));

  await mkdir(dist, { recursive: true });
  const wellKnownDir = resolve(dist, '.well-known');
  await mkdir(wellKnownDir, { recursive: true });
  const sitemapPath = resolve(dist, 'sitemap.xml');
  const robotsPath = resolve(dist, 'robots.txt');
  const llmsPath = resolve(dist, 'llms.txt');
  const aiCatalogPath = resolve(wellKnownDir, 'ai-catalog.json');
  await Promise.all([
    writeFile(sitemapPath, ssr.buildSitemapXml(entries), 'utf8'),
    writeFile(robotsPath, ssr.buildRobotsTxt(), 'utf8'),
    writeFile(llmsPath, ssr.buildLlmsTxt(), 'utf8'),
    writeFile(aiCatalogPath, ssr.buildAiCatalogJson(), 'utf8'),
  ]);

  // 构建日志里带上数量，便于发现课程数据源与产物不一致。
  const lessons = routes.filter((route) => route.page === 'lesson').length;
  console.log(`SEO 生成完成：${entries.length} 条 URL（含 ${lessons} 节中英文课程）`);
  console.log(`  - ${sitemapPath}`);
  console.log(`  - ${robotsPath}`);
  console.log(`  - ${llmsPath}`);
  console.log(`  - ${aiCatalogPath}`);
  if (!(await readFile(sitemapPath, 'utf8')).includes('<urlset')) {
    throw new Error('sitemap.xml 写入后校验失败');
  }
  if (!(await readFile(llmsPath, 'utf8')).startsWith('# ')) {
    throw new Error('llms.txt 写入后校验失败');
  }
  JSON.parse(await readFile(aiCatalogPath, 'utf8'));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
