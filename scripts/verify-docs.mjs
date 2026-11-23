#!/usr/bin/env node
/**
 * Docs-as-Code 不变量门禁（零外部依赖，Node 24 原生执行；严格二元判定，不发 warn 噪声）：
 * 1. 断链与仓内幽灵路径拦截（排除 docs/archive 与构建期临时目录）；
 * 2. 幽灵 pnpm run <cmd> 命令拦截；
 * 3. 工作流列表（.github/workflows <-> docs/CI.md）、Lean 版本与课时总数 SSOT 强同步；
 * 4. AGENTS.md 防失控底线（根 <= 200 行，子目录 <= 120 行）与 docs 定位头校验（首个 H2 之前或前 25 行内）；
 * 5. 已废弃过期表述黑名单拦截。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT_AGENTS_MAX_LINES = 200;
const SUB_AGENTS_MAX_LINES = 120;
const DOC_HEADER_MIN_LINES = 25;

const GENERATED_PREFIXES = ['dist/', 'coverage/', 'work/', 'public/sw.js', 'public/wasm-lean4/'];

const REPO_PATH_PREFIX = /^(?:\.github|src|scripts|functions|config|public|docs|patches)\//;

const STALE_PHRASES = [
  'spike/std-batteries',
  '课程内容只能落在 Init 范围内',
  '尚未合并到主工作流；生产默认只加载 Init',
  '默认仍只加载 Init',
];

const stripCodeFences = (markdown) => markdown.replace(/```[\s\S]*?```/g, '');

const countLines = (text) =>
  text.length === 0 ? 0 : text.replace(/\r\n/g, '\n').split('\n').length;

const collectSubAgents = (dir, out) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      collectSubAgents(full, out);
    } else if (entry.name === 'AGENTS.md') {
      out.push(full);
    }
  }
};

/** 收集受 Docs-as-Code 校验的活文档（相对路径，正斜杠，排除 docs/archive）。 */
export const collectLiveDocs = (rootDir) => {
  const files = [];
  for (const name of ['AGENTS.md', 'README.md', 'README.en.md']) {
    const full = resolve(rootDir, name);
    if (existsSync(full)) files.push(full);
  }

  const docsDir = resolve(rootDir, 'docs');
  if (existsSync(docsDir)) {
    for (const entry of readdirSync(docsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(resolve(docsDir, entry.name));
      }
    }
  }

  for (const subRoot of ['src', 'scripts']) {
    collectSubAgents(resolve(rootDir, subRoot), files);
  }

  return files.map((file) => relative(rootDir, file).replace(/\\/g, '/')).sort();
};

const isIgnoredRepoPath = (candidate) => {
  if (!REPO_PATH_PREFIX.test(candidate)) return true;
  if (/[*<>{}$|]/.test(candidate) || candidate.includes('...')) return true;
  return GENERATED_PREFIXES.some(
    (prefix) => candidate === prefix.replace(/\/$/, '') || candidate.startsWith(prefix),
  );
};

const checkLinksAndPaths = (rootDir, relFile, content, errors) => {
  const proseOnly = stripCodeFences(content);
  const baseDir = dirname(resolve(rootDir, relFile));

  for (const match of proseOnly.matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
    const rawTarget = match[1];
    if (
      rawTarget.startsWith('http://') ||
      rawTarget.startsWith('https://') ||
      rawTarget.startsWith('mailto:') ||
      rawTarget.startsWith('#')
    ) {
      continue;
    }
    const [targetPath] = rawTarget.split('#');
    if (!targetPath) continue;
    const resolved = resolve(baseDir, targetPath);
    if (!existsSync(resolved)) {
      errors.push(`${relFile}: 存在断链 (${rawTarget})`);
    }
  }

  for (const match of proseOnly.matchAll(/`([^`\n]+)`/g)) {
    const candidate = match[1].trim().replace(/^\.\//, '');
    if (isIgnoredRepoPath(candidate)) continue;
    const trimmed = candidate.endsWith('/') ? candidate.slice(0, -1) : candidate;
    const resolved = resolve(rootDir, trimmed);
    if (!existsSync(resolved)) {
      errors.push(`${relFile}: 引用了不存在的仓内路径 \`${match[1]}\``);
    } else if (candidate.endsWith('/') && !statSync(resolved).isDirectory()) {
      errors.push(`${relFile}: \`${match[1]}\` 标注为目录但实际不是目录`);
    }
  }
};

const checkCommands = (relFile, content, knownScripts, errors) => {
  for (const match of content.matchAll(/\bpnpm\s+run\s+([A-Za-z0-9:_-]+)/g)) {
    const scriptName = match[1];
    if (!knownScripts.has(scriptName)) {
      errors.push(`${relFile}: 引用了不存在的 package.json 脚本 \`pnpm run ${scriptName}\``);
    }
  }
};

const extractHeaderWindow = (content) => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const firstH2 = lines.findIndex((line) => /^##\s+/.test(line));
  const end = firstH2 >= 0 ? Math.max(DOC_HEADER_MIN_LINES, firstH2) : DOC_HEADER_MIN_LINES;
  return lines.slice(0, end).join('\n');
};

const checkWorkflowsParity = (rootDir, readDoc, errors) => {
  const wfDir = resolve(rootDir, '.github/workflows');
  const ciDoc = readDoc('docs/CI.md');
  if (!existsSync(wfDir) || ciDoc === null) return;

  const actualWorkflows = readdirSync(wfDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  const documentedWorkflows = [
    ...new Set(
      [...ciDoc.matchAll(/\.\.\/\.github\/workflows\/([A-Za-z0-9_.-]+\.ya?ml)/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();

  for (const wf of actualWorkflows) {
    if (!documentedWorkflows.includes(wf)) {
      errors.push(`docs/CI.md: 缺少工作流登记 (${wf})`);
    }
  }
  for (const wf of documentedWorkflows) {
    if (!actualWorkflows.includes(wf)) {
      errors.push(`docs/CI.md: 引用了已不存在的工作流 (${wf})`);
    }
  }
};

const checkSingleSourcesOfTruth = (rootDir, readDoc, errors) => {
  checkWorkflowsParity(rootDir, readDoc, errors);

  const runtimePath = resolve(rootDir, 'config/lean4-runtime.json');
  if (existsSync(runtimePath)) {
    const manifest = JSON.parse(readFileSync(runtimePath, 'utf8'));
    const version = /\b(\d+\.\d+\.\d+)\b/.exec(manifest.runtime ?? '')?.[1];
    if (version) {
      for (const file of ['README.md', 'README.en.md', 'docs/README.md']) {
        const text = readDoc(file);
        if (text !== null && !text.includes(version)) {
          errors.push(`${file}: 未与 config/lean4-runtime.json 版本 ${version} 同步`);
        }
      }
    }
  }

  const catalogPath = resolve(rootDir, 'src/i18n/lesson-catalog.ts');
  if (existsSync(catalogPath)) {
    const catalog = readFileSync(catalogPath, 'utf8');
    const lessonCount = (catalog.match(/slug:\s*'[^']+'/g) ?? []).length;
    if (lessonCount > 0) {
      const needle = String(lessonCount);
      for (const file of ['README.md', 'README.en.md', 'docs/README.md']) {
        const text = readDoc(file);
        if (text !== null && !text.includes(needle)) {
          errors.push(`${file}: 未体现当前课程总数 ${lessonCount}`);
        }
      }
    }
  }
};

/** 校验仓内文档不变量，返回人类可读的错误列表。 */
export const verifyDocs = (rootDir) => {
  const errors = [];
  const pkgPath = resolve(rootDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return ['缺少 package.json，无法校验脚本与文档不变量'];
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const knownScripts = new Set(Object.keys(pkg.scripts ?? {}));

  const liveDocs = collectLiveDocs(rootDir);
  const docCache = new Map();
  const readDoc = (relPath) => {
    if (docCache.has(relPath)) return docCache.get(relPath);
    const full = resolve(rootDir, relPath);
    const value = existsSync(full) ? readFileSync(full, 'utf8') : null;
    docCache.set(relPath, value);
    return value;
  };

  for (const relFile of liveDocs) {
    const content = readDoc(relFile);
    if (content === null) continue;

    checkLinksAndPaths(rootDir, relFile, content, errors);
    checkCommands(relFile, content, knownScripts, errors);

    if (relFile === 'AGENTS.md') {
      const lines = countLines(content);
      if (lines > ROOT_AGENTS_MAX_LINES) {
        errors.push(`AGENTS.md 超出上限（${lines} > ${ROOT_AGENTS_MAX_LINES} 行）`);
      }
    } else if (relFile.endsWith('/AGENTS.md')) {
      const lines = countLines(content);
      if (lines > SUB_AGENTS_MAX_LINES) {
        errors.push(`${relFile} 超出上限（${lines} > ${SUB_AGENTS_MAX_LINES} 行）`);
      }
    }

    if (relFile.startsWith('docs/') && relFile.endsWith('.md')) {
      const headerWindow = extractHeaderWindow(content);
      for (const marker of ['**何时读我**', '**单一事实来源**', '**维护边界**']) {
        if (!headerWindow.includes(marker)) {
          errors.push(`${relFile}: 顶部缺少 AI 定位头标记 ${marker}`);
        }
      }
    }

    for (const stale of STALE_PHRASES) {
      if (content.includes(stale)) {
        errors.push(`${relFile}: 仍包含已废弃表述「${stale}」`);
      }
    }
  }

  checkSingleSourcesOfTruth(rootDir, readDoc, errors);
  return errors;
};

const main = () => {
  const rootDir = resolve('.');
  const errors = verifyDocs(rootDir);
  if (errors.length > 0) {
    console.error('文档不变量校验失败：');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const checked = collectLiveDocs(rootDir);
  console.log(`文档不变量校验通过（检查 ${checked.length} 份活文档）`);
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
