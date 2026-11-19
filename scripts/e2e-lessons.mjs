#!/usr/bin/env node
/* global document */
/**
 * 逐课运行全部代码块：课程页是用户主路径，单测覆盖不到真实 LSP 的行为。
 *
 * 依赖 scripts/local-gateway.mjs 已在 LEAN_GATEWAY_PORT（默认 4174）上服务 dist。
 * 新增或删除课程时同步下面的 SLUGS（与 src/i18n/zh.ts 保持一致）；
 * 新增或删除挑战题时同步 CHALLENGE_SLUGS（与 src/challenges.ts 保持一致）。
 *
 * 挑战题不只看骨架能否编译：脚本会展开「参考解法」并载入编辑器，
 * 只有 Lean 对参考解法给出零 error 级诊断、run-ok 重新出现才算通过。
 *
 * 默认开两个页面并行跑不同的课，缩短浏览器 E2E 的墙钟时间。工程课会加载
 * Std / Batteries 扩展包，CI 用 LEAN_E2E_WORKERS=1 避免 runner 内存不足。
 * 需要进一步提速时用 LEAN_E2E_SHARDS / LEAN_E2E_SHARD 把课程拆到多个 CI runner；
 * LEAN_E2E_LESSONS / LEAN_E2E_CHALLENGES 可只跑改动到的条目（CI 增量门禁用）。
 * 同一 context 共享 Service Worker 与运行时缓存。
 */
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const port = Number(process.env.LEAN_GATEWAY_PORT ?? 4174);
const origin = `http://127.0.0.1:${port}`;
const channel =
  process.env.LEAN_E2E_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome');
const executablePath = process.env.LEAN_E2E_EXECUTABLE || undefined;
const workers = Math.max(1, Math.min(4, Number(process.env.LEAN_E2E_WORKERS ?? 2) || 2));
// 分片用于把整批课程拆到多个 CI runner 上并行；本地默认不分片。
const shards = Math.max(1, Math.min(8, Number(process.env.LEAN_E2E_SHARDS ?? 1) || 1));
const shard = Math.min(shards, Math.max(1, Number(process.env.LEAN_E2E_SHARD ?? 1) || 1));

const SLUGS = [
  'what-is-lean',
  'first-proof',
  'implication',
  'connectives',
  'induction',
  'rewrite',
  'simp',
  'quantifiers',
  'list-structure',
  'math-proof-style',
  'math-divisibility',
  'math-parity',
  'math-gcd',
  'math-primes',
  'math-sets',
  'math-functions',
  'math-relations',
  'math-strong-induction',
  'code-sorting',
  'code-sum',
  'math-axioms',
  'math-mathlib',
  'eng-hashmap',
  'eng-bitvec',
  'eng-rbmap',
  'eng-array-bounds',
  'eng-state-machine',
];

const CHALLENGE_SLUGS = [
  'even-plus-even',
  'odd-plus-odd',
  'even-plus-odd',
  'add-comm',
  'not-even-and-odd',
  'double-induction',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 1-based 分片：按取模均匀分配，保证各分片条目数最多相差 1。 */
export const selectShard = (items, shardIndex, shardCount) =>
  items.filter((_, index) => index % shardCount === shardIndex - 1);

/**
 * 增量筛选：`raw` 是逗号分隔的 slug 列表。
 * 未设置时跑全部；`-` 表示一条都不跑；出现未知 slug 直接报错，避免增量门禁假通过。
 */
export const pickSlugs = (all, raw) => {
  const text = (raw ?? '').trim();
  if (text === '-') return { slugs: [], unknown: [] };
  const wanted = text
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
  if (wanted.length === 0) return { slugs: all, unknown: [] };
  return {
    slugs: all.filter((slug) => wanted.includes(slug)),
    unknown: wanted.filter((slug) => !all.includes(slug)),
  };
};

/**
 * 等 Lean 就绪。低内存设备（CI 容器常被判定为 low）不会自动启动，这里模拟一次
 * 「启动 Lean」点击；正常档位 400ms 后会自动开始，先等一拍再判断，避免把启动点成停止。
 */
const ensureLeanReady = async (page) => {
  await page.waitForSelector('[data-role="status"]', { timeout: 30_000 });
  await sleep(1200);
  const state = await page.evaluate(
    () => globalThis.document.querySelector('[data-role="status"]')?.dataset.state,
  );
  if (state === 'idle') {
    // 课程页的面板是 sr-only，普通 click 会被正文遮挡；直接派发事件等价于真实点击。
    await page.locator('[data-role="start"]').first().dispatchEvent('click');
  }
  await page.waitForSelector('[data-role="status"][data-state="ready"]', { timeout: 240_000 });
};

const waitForGateway = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${origin}/__health`);
      if (response.ok) return;
    } catch {
      // 网关还没起来，继续等。
    }
    await sleep(200);
  }
  throw new Error(`gateway did not become ready on ${origin}`);
};

const main = async () => {
  await waitForGateway();
  const lessons = pickSlugs(SLUGS, process.env.LEAN_E2E_LESSONS);
  const challenges = pickSlugs(CHALLENGE_SLUGS, process.env.LEAN_E2E_CHALLENGES);
  const unknown = [...lessons.unknown, ...challenges.unknown];
  if (unknown.length > 0) {
    throw new Error(`增量门禁收到未知 slug：${unknown.join(', ')}；请同步 SLUGS / CHALLENGE_SLUGS`);
  }
  const slugs = selectShard(lessons.slugs, shard, shards);
  const challengeSlugs = selectShard(challenges.slugs, shard, shards);
  if (slugs.length + challengeSlugs.length === 0) {
    throw new Error('没有需要运行的课程或挑战；检查 LEAN_E2E_LESSONS / LEAN_E2E_SHARD');
  }
  console.log(
    `分片 ${shard}/${shards}：${slugs.length} 节课程，${challengeSlugs.length} 道挑战，${workers} 路并行`,
  );
  const browser = await chromium.launch({ channel, executablePath, headless: true });
  // 固定海外英文环境：让 Service Worker 走同源 /cdn/ 网关，避免本机中文/中国时区优先命中外部镜像。
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'UTC',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const pages = await Promise.all(Array.from({ length: workers }, () => context.newPage()));
  const failures = [];

  const runLesson = async (page, slug, worker) => {
    const startedAt = Date.now();
    const prefix = `[w${worker}]`;
    await page.goto(`${origin}/zh/learn/${slug}`, { waitUntil: 'domcontentloaded' });

    const count = await page.locator('button[data-run-index]').count();
    if (count === 0) {
      failures.push(`${slug}: 没有可运行的代码块`);
      return;
    }

    // 低内存档下课程页不会自动装配编辑器（sr-only runner 也没有 SSR 标记），
    // 点第一块代码的「运行」按需加载面板——这同时是真实用户路径。
    const bootstrapped = (await page.locator('[data-role="status"]').count()) === 0;
    if (bootstrapped) {
      // bindLesson 是异步装配的，早到的点击可能丢；以输出块出现为准重试几次。
      const runButton = page.locator('button[data-run-index]').first();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await runButton.dispatchEvent('click');
        const started = await page.evaluate(() => {
          const output = globalThis.document.querySelector('[data-output="0"]');
          return Boolean(output && !output.hidden);
        });
        if (started) break;
        await sleep(250);
      }
    }
    await ensureLeanReady(page);

    for (let index = 0; index < count; index += 1) {
      if (!(bootstrapped && index === 0)) {
        await page.locator('button[data-run-index]').nth(index).click();
      }
      await page.waitForFunction(
        (idx) => {
          const el = document.querySelector('[data-output="' + idx + '"]');
          return el && !el.hidden && (el.textContent ?? '').trim().length > 0;
        },
        index,
        { timeout: 120_000 },
      );
      await page.waitForFunction(
        () => [...document.querySelectorAll('button[data-run-index]')].every((b) => !b.disabled),
        null,
        { timeout: 120_000 },
      );
      // 运行屏障已经结算；留一点时间接住迟到的诊断，但不必等满 500ms。
      await sleep(200);

      const readOutput = async () =>
        (await page.locator(`[data-output="${index}"]`).innerText()).trim();
      let output = await readOutput();
      // documentSymbol 屏障偶发提前结算，#check / #eval 的信息会晚一拍到达；
      // 先补等一轮，仍为空才判失败，避免把无关的偶发竞态当成课程错误。
      if (!output || output.includes('没有错误，也没有输出')) {
        await sleep(1500);
        output = await readOutput();
      }

      const errors = await page.locator(`[data-output="${index}"] .text-err`).allTextContents();
      if (errors.length > 0) {
        failures.push(
          `${slug} 第 ${index + 1} 块：${errors.map((text) => text.trim()).join(' | ')}`,
        );
      }

      // 课程里每块都应该有可见结果；#check / #eval 显示「没有输出」说明诊断丢了。
      if (!output || output.includes('没有错误，也没有输出')) {
        failures.push(`${slug} 第 ${index + 1} 块：没有可见输出`);
      }
    }

    console.log(
      `ok   ${prefix} ${slug}（${count} 块，${((Date.now() - startedAt) / 1000).toFixed(1)}s）`,
    );
  };

  const runChallenge = async (page, slug, worker) => {
    const startedAt = Date.now();
    const prefix = `[w${worker}]`;
    await page.goto(`${origin}/zh/challenges/${slug}`, { waitUntil: 'domcontentloaded' });
    await ensureLeanReady(page);

    const solution = page.locator('details[data-role="solution"]');
    if ((await solution.count()) === 0) {
      failures.push(`challenge/${slug}: 没有参考解法面板`);
      return;
    }
    await solution.locator('summary').click();
    await solution.locator('[data-role="load-solution"]').click();
    await page.waitForSelector('[data-role="challenge-panel"][data-mode="solution"]', {
      timeout: 30_000,
    });
    // setCode 会先清掉旧的 run-ok；等它重新出现，说明参考解法的诊断已经结算且零 error。
    await page
      .waitForSelector('[data-role="run-ok"][hidden]', { timeout: 10_000 })
      .catch(() => undefined);
    await page.waitForSelector('[data-role="run-ok"]:not([hidden])', { timeout: 120_000 });
    await sleep(200);

    const errors = await page.locator('[data-role="diagnostics"] .text-err').allTextContents();
    if (errors.length > 0) {
      failures.push(`challenge/${slug} 参考解法：${errors.map((text) => text.trim()).join(' | ')}`);
    }

    console.log(
      `ok   ${prefix} challenge/${slug}（${((Date.now() - startedAt) / 1000).toFixed(1)}s）`,
    );
  };

  try {
    await Promise.all(
      pages.map(async (page, workerIndex) => {
        for (let index = workerIndex; index < slugs.length; index += workers) {
          const slug = slugs[index];
          try {
            await runLesson(page, slug, workerIndex + 1);
          } catch (error) {
            failures.push(`${slug}: ${error.message ?? error}`);
            console.error(`fail [w${workerIndex + 1}] ${slug}: ${error.message ?? error}`);
          }
        }
        for (let index = workerIndex; index < challengeSlugs.length; index += workers) {
          const slug = challengeSlugs[index];
          try {
            await runChallenge(page, slug, workerIndex + 1);
          } catch (error) {
            failures.push(`challenge/${slug}: ${error.message ?? error}`);
            console.error(
              `fail [w${workerIndex + 1}] challenge/${slug}: ${error.message ?? error}`,
            );
          }
        }
      }),
    );
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error(`\n课程代码块失败：${failures.length}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `课程与挑战全部通过：分片 ${shard}/${shards}，${slugs.length} 节课程，${challengeSlugs.length} 道挑战，${workers} 路并行`,
  );
};

// 作为脚本执行时才启动浏览器；被单测 import 时只暴露纯函数。
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error('E2E lessons error:', error);
    process.exit(1);
  });
}
