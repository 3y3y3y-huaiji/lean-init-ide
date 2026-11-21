#!/usr/bin/env node
/**
 * CI 变更分类：按改动类型决定门禁重量。
 *
 * - 纯文档 / 纯工作流改动：只跑轻量检查，不进 install / build / e2e。
 * - 纯 wasm64 / spike 脚本改动（scripts/*.ts）：跑静态检查 + spike 单测，不触发前端 build / E2E / 部署。
 * - 纯课程或挑战内容改动：只跑改动到的那几节课程（增量），不跑全量。
 * - 课程 / 挑战视图改动：跑轻量多视口 UI E2E + 对应金丝雀课/挑战 E2E，不跑全量。
 * - 纯 UI / 样式 / 英文课程 / SEO 改动：跑轻量多视口 UI E2E，不启动 102MB WASM。
 * - 运行时、资产、LSP、网关等关键路径改动：才跑全量课程 E2E + 启动冒烟。
 * - 依赖（package.json / pnpm-lock.yaml 等）改动：触发依赖审计与冒烟。
 *
 * 输出同时写到 $GITHUB_OUTPUT，并打印一份可读摘要。
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** 课程内容源：E2E 只访问 /zh/learn/*，所以英文课程不触发浏览器 E2E。 */
export const LESSON_SOURCE = 'src/i18n/lessons-zh.ts';
/** 挑战内容源：E2E 只访问 /zh/challenges/*。 */
export const CHALLENGE_SOURCE = 'src/challenges.ts';
/** 课程 E2E 的硬编码清单；新增/删除课程时必须同步，否则全量跑也测不到新条目。 */
export const E2E_SCRIPT = 'scripts/e2e-lessons.mjs';

/** 课程页 / 挑战页结构变化时，用单条稳定金丝雀条目做真实 LSP 回归，不至于漏测交互又不拖慢全量。 */
export const CANARY_LESSON = 'first-proof';
export const CANARY_CHALLENGE = 'add-comm';

const TEST_FILE = /\.test\.(?:ts|mjs)$/;

const DEPS_FILES = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']);

const SPIKE_CONFIG_FILES = new Set([
  'tsconfig.spike.json',
  'eslint.spike.config.mjs',
  'vitest.spike.config.ts',
]);

const isDocFile = (file) =>
  file.startsWith('docs/') ||
  /^[^/]+\.md$/i.test(file) ||
  file.startsWith('LICENSE') ||
  /(?:^|\/)AGENTS\.md$/i.test(file);

const isSpikeScriptFile = (file) =>
  (file.startsWith('scripts/') && file.endsWith('.ts')) || SPIKE_CONFIG_FILES.has(file);

/** 只有这些路径的改动才需要全量课程 E2E：它们决定 Lean 运行时、资产分发或 LSP 行为。 */
const RUNTIME_EXACT = new Set([
  'index.html',
  'vite.config.ts',
  'wrangler.toml',
  'src/sw.ts',
  'src/sw-assemble.ts',
  'src/asset-sources.mjs',
  'src/asset-source.ts',
  'src/cdn-range.ts',
  'src/device.ts',
  'src/runtime-extensions.ts',
  'src/lean-session.ts',
  'src/lean-recovery.ts',
  'src/lean-memory-guard.ts',
  'src/lean-wasm64-available.ts',
  'src/lean-wasm64-frames.ts',
  'src/lean-wasm64-runtime.ts',
  'src/lean-wasm64-server.ts',
  'src/lean-wasm64-supervisor.ts',
  'scripts/e2e-lean.mjs',
  'scripts/e2e-lessons.mjs',
  'scripts/local-gateway.mjs',
  'scripts/fetch-assets.mjs',
]);
const RUNTIME_PREFIXES = ['config/', 'functions/', 'patches/', 'public/'];

/** E2E 准备流程本身变了，必须全量验证，否则可能用坏掉的编排跑出一片绿。 */
const E2E_HARNESS = '.github/actions/e2e-prepare/action.yml';

const isRuntimeFile = (file) =>
  RUNTIME_EXACT.has(file) ||
  RUNTIME_PREFIXES.some((prefix) => file.startsWith(prefix)) ||
  /^src\/lsp-/.test(file);

/** 需要启动真实 102MB Lean WASM 冒烟的非 runtime 应用文件（排除纯视图/样式/i18n）。 */
const SMOKE_EXACT = new Set([
  'src/main.ts',
  'src/monaco-contrib.ts',
  'src/telemetry.ts',
  'src/components/lean-panel.ts',
  'src/components/lean-markup.ts',
  'src/views/playground.ts',
  'src/exercise.ts',
  'src/draft.ts',
  'src/progress.ts',
  'src/settings.ts',
  'src/runtime-cache.ts',
]);

const isSmokeFile = (file) =>
  SMOKE_EXACT.has(file) ||
  DEPS_FILES.has(file) ||
  file.startsWith('src/lean-') ||
  file.startsWith('src/wasm64-');

/** 课程 / 挑战的加载或目录结构变化时，无法可靠缩小范围，按全量处理。 */
const LESSON_INFRA = new Set(['src/i18n/lesson-catalog.ts', 'src/i18n/index.ts']);

const LESSON_VIEW_FILES = new Set(['src/views/lesson.ts', 'src/components/lean-panel.ts']);
const CHALLENGE_VIEW_FILES = new Set([
  'src/views/challenge.ts',
  'src/challenge-goal.ts',
  'src/components/lean-panel.ts',
]);

/** 会进入构建产物的非 src/ 关键路径（需要 build + 产物校验）。 */
const SHIPPED_EXACT = new Set([
  ...DEPS_FILES,
  'vite.config.ts',
  'index.html',
  'wrangler.toml',
  'scripts/generate-seo.mjs',
  'scripts/prerender.mjs',
  'scripts/verify-build.mjs',
]);

const UI_ONLY_SCRIPTS = new Set(['scripts/e2e-ui.mjs']);

const isShippedFile = (file) =>
  file.startsWith('src/') || SHIPPED_EXACT.has(file) || UI_ONLY_SCRIPTS.has(file);

const isDeployableFile = (file) => {
  if (isDocFile(file) || file.startsWith('.github/') || TEST_FILE.test(file)) return false;
  if (isSpikeScriptFile(file) || UI_ONLY_SCRIPTS.has(file)) return false;
  return (
    file.startsWith('src/') ||
    file.startsWith('functions/') ||
    file.startsWith('public/') ||
    file.startsWith('config/') ||
    file.startsWith('patches/') ||
    SHIPPED_EXACT.has(file) ||
    file.startsWith('scripts/assets/') ||
    file === 'scripts/fetch-assets.mjs'
  );
};

/**
 * 纯函数：把文件列表归类成 CI 需要执行的档位。
 */
export const classifyFiles = (paths) => {
  const files = [...new Set(paths.filter(Boolean))];
  const hasFiles = files.length > 0;
  const docsOnly = hasFiles && files.every(isDocFile);
  const workflows = files.some((file) => file.startsWith('.github/'));
  const workflowsOnly =
    workflows && files.every((file) => isDocFile(file) || file.startsWith('.github/'));
  const flags = {
    runtime: false,
    lessons: false,
    lessonsAll: false,
    challenges: false,
    app: false,
    smoke: false,
    deps: false,
    spikeScripts: false,
    deployable: false,
    canaryLesson: false,
    canaryChallenge: false,
  };

  for (const file of files) {
    if (isDocFile(file)) continue;
    if (file === E2E_HARNESS) {
      flags.runtime = true;
      continue;
    }
    if (file.startsWith('.github/')) continue;
    if (DEPS_FILES.has(file)) flags.deps = true;
    if (isSpikeScriptFile(file)) {
      flags.spikeScripts = true;
      continue;
    }
    if (isDeployableFile(file)) flags.deployable = true;
    if (TEST_FILE.test(file)) continue;

    if (isRuntimeFile(file)) {
      flags.runtime = true;
      flags.smoke = true;
    } else if (file === LESSON_SOURCE) {
      flags.lessons = true;
    } else if (LESSON_INFRA.has(file)) {
      flags.lessons = true;
      flags.lessonsAll = true;
    } else if (file === CHALLENGE_SOURCE) {
      flags.challenges = true;
    } else if (isShippedFile(file)) {
      flags.app = true;
      if (isSmokeFile(file)) flags.smoke = true;
      if (LESSON_VIEW_FILES.has(file)) flags.canaryLesson = true;
      if (CHALLENGE_VIEW_FILES.has(file)) flags.canaryChallenge = true;
    }
  }

  // 没有可识别的改动（例如手动重跑同一个提交）时按全量处理，宁可多跑不漏跑。
  if (!hasFiles) {
    flags.runtime = true;
    flags.lessonsAll = true;
    flags.smoke = true;
    flags.deps = true;
    flags.spikeScripts = true;
    flags.deployable = true;
  }

  const content = flags.lessons || flags.challenges || flags.canaryLesson || flags.canaryChallenge;
  const fullLessons = flags.runtime || flags.lessonsAll;
  const build = flags.runtime || content || flags.app;
  return {
    docsOnly,
    workflows,
    workflowsOnly,
    static: !docsOnly && !workflowsOnly,
    test: !docsOnly && !workflowsOnly,
    build,
    ui: build,
    smoke: flags.runtime || flags.smoke,
    fullLessons,
    content,
    ...flags,
  };
};

/** 解析 `git diff --unified=0` 里新文件侧的行区间（1-based，闭区间）。 */
export const parseHunkRanges = (diff) => {
  const ranges = [];
  for (const line of diff.split('\n')) {
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    ranges.push({ start, end: count === 0 ? start : start + count - 1 });
  }
  return ranges;
};

const slugLines = (source) =>
  [...source.split('\n').entries()]
    .map(([index, line]) => {
      const match = /^\s{4}slug:\s*'([^']+)'/.exec(line);
      return match ? { slug: match[1], index } : null;
    })
    .filter(Boolean);

/** 把每个 slug 扩展成它所属对象的行区间，便于把 diff 归到具体课程。 */
export const slugRanges = (source) => {
  const lines = source.split('\n');
  const entries = slugLines(source);
  return entries.map((entry, index) => {
    let start = entry.index;
    for (let cursor = entry.index - 1; cursor >= 0 && cursor >= entry.index - 4; cursor -= 1) {
      if (/^\s*\{\s*$/.test(lines[cursor])) {
        start = cursor;
        break;
      }
    }
    return {
      slug: entry.slug,
      start: start + 1,
      end: index + 1 < entries.length ? entries[index + 1].index : lines.length,
    };
  });
};

/**
 * 找出落在改动行区间里的课程 / 挑战。
 * `outside` 表示有改动落在任何对象之外（导入、辅助函数、导出等），
 * 这时无法判断影响范围，调用方应回退到全量。
 */
export const slugsForHunks = (source, hunks) => {
  const ranges = slugRanges(source);
  const hit = new Set();
  let outside = false;
  for (const hunk of hunks) {
    const owners = ranges.filter((range) => hunk.start <= range.end && hunk.end >= range.start);
    if (owners.length === 0) outside = true;
    for (const owner of owners) hit.add(owner.slug);
  }
  return { slugs: ranges.map((range) => range.slug).filter((slug) => hit.has(slug)), outside };
};

/** 从 `const NAME = [...]` 数组字面量里取出所有字符串项。 */
export const listFromArray = (source, name) => {
  const start = source.indexOf(`const ${name} = [`);
  if (start === -1) return null;
  const end = source.indexOf('];', start);
  if (end === -1) return null;
  return [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1]);
};

/** 比较内容源与 E2E 清单；任一方向不一致都返回出来。 */
export const listMismatch = (expected, actual) => {
  if (!actual) return { unknown: true, missing: [], extra: [] };
  return {
    unknown: false,
    missing: expected.filter((slug) => !actual.includes(slug)),
    extra: actual.filter((slug) => !expected.includes(slug)),
  };
};

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const showFile = (rev, file) => {
  try {
    return git(['show', `${rev}:${file}`]);
  } catch {
    return null;
  }
};

/**
 * 对比基线与当前提交，得出改动了哪些课程 / 挑战。
 * 结构无法可靠对齐时返回 `{ all: true }`。
 */
export const changedSlugs = ({ file, base, head }) => {
  const headSource = showFile(head, file);
  const baseSource = showFile(base, file);
  if (baseSource === null || headSource === null) return { all: true, slugs: [] };
  const baseSlugs = slugLines(baseSource).map((entry) => entry.slug);
  const headSlugs = slugLines(headSource).map((entry) => entry.slug);
  if (baseSlugs.join('\n') !== headSlugs.join('\n')) return { all: true, slugs: [] };
  if (base === head) return { all: false, slugs: [] };

  const diff = git(['diff', '--unified=0', base, head, '--', file]);
  const { slugs, outside } = slugsForHunks(headSource, parseHunkRanges(diff));
  if (outside) return { all: true, slugs: [] };
  return { all: false, slugs };
};

const NONE = '-';

const parseArgs = (argv) => {
  const args = { base: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--base') args.base = argv[index + 1] ?? '';
  }
  return args;
};

const main = () => {
  const { base: rawBase } = parseArgs(process.argv.slice(2));
  const head = 'HEAD';
  // PR 的 base.sha 是基线分支 tip；push 的 before 是上一次提交；手动触发退回 HEAD^。
  let base = 'HEAD^';
  if (rawBase && !/^0+$/.test(rawBase)) {
    try {
      base = git(['merge-base', rawBase, head]) || rawBase;
    } catch {
      base = rawBase;
    }
  }

  let files = [];
  try {
    files = git(['diff', '--name-only', '--no-renames', base, head]).split('\n').filter(Boolean);
  } catch {
    // 基线不可用（例如浅克隆）时保持空列表，交给 classifyFiles 按全量处理。
  }

  const result = classifyFiles(files);

  // 新增 / 删除课程或挑战时，E2E 的硬编码清单必须同步；
  // 否则即使回退到全量，新条目也不会被真正跑到。
  const e2eSource = showFile(head, E2E_SCRIPT) ?? '';
  const parity = [
    ['课程', slugLines(showFile(head, LESSON_SOURCE) ?? ''), listFromArray(e2eSource, 'SLUGS')],
    [
      '挑战',
      slugLines(showFile(head, CHALLENGE_SOURCE) ?? ''),
      listFromArray(e2eSource, 'CHALLENGE_SLUGS'),
    ],
  ];
  for (const [label, sourceSlugs, listedSlugs] of parity) {
    const mismatch = listMismatch(
      sourceSlugs.map((entry) => entry.slug),
      listedSlugs,
    );
    if (mismatch.unknown || mismatch.missing.length > 0 || mismatch.extra.length > 0) {
      console.error(`${label}清单与 ${E2E_SCRIPT} 不一致：`);
      if (mismatch.unknown) console.error(`  无法解析 ${label} 的 E2E 清单`);
      if (mismatch.missing.length > 0) console.error(`  缺少：${mismatch.missing.join(', ')}`);
      if (mismatch.extra.length > 0) console.error(`  多余：${mismatch.extra.join(', ')}`);
      console.error('请同步 SLUGS / CHALLENGE_SLUGS 后再提 PR。');
      process.exit(1);
    }
  }

  let lessonSlugs = NONE;
  let challengeSlugs = NONE;

  if (result.lessons) {
    const changed = changedSlugs({ file: LESSON_SOURCE, base, head });
    if (changed.all || changed.slugs.length === 0) result.lessonsAll = true;
    else lessonSlugs = changed.slugs.join(',');
  }
  if (!result.lessonsAll && lessonSlugs === NONE && result.canaryLesson) {
    lessonSlugs = CANARY_LESSON;
  }

  if (result.challenges) {
    const changed = changedSlugs({ file: CHALLENGE_SOURCE, base, head });
    // 挑战只有 6 道，无法细分时直接全跑（空字符串在脚本里表示不过滤）。
    challengeSlugs = changed.all ? '' : changed.slugs.join(',') || NONE;
  }
  if (challengeSlugs === NONE && result.canaryChallenge) {
    challengeSlugs = CANARY_CHALLENGE;
  }

  const fullLessons = result.runtime || result.lessonsAll;
  const outputs = {
    docs_only: String(result.docsOnly),
    workflows: String(result.workflows),
    static: String(result.static),
    test: String(result.test),
    deps: String(result.deps),
    spike_scripts: String(result.spikeScripts),
    build: String(result.build),
    ui: String(result.ui),
    smoke: String(result.smoke),
    full_lessons: String(fullLessons),
    content: String(result.content),
    lessons: String(result.lessons),
    challenges: String(result.challenges),
    deployable: String(result.deployable),
    lesson_slugs: fullLessons ? '' : lessonSlugs,
    challenge_slugs: challengeSlugs,
  };

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}\n`,
    );
  }

  console.log(`变更文件 ${files.length} 个（${base.slice(0, 8)}...${head}）：`);
  for (const file of files) console.log(`  ${file}`);
  console.log('\n分类结果：', JSON.stringify(outputs, null, 2));
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
