#!/usr/bin/env node
/* global document */
/**
 * 逐课运行全部代码块：课程页是用户主路径，单测覆盖不到真实 LSP 的行为。
 *
 * 依赖 scripts/local-gateway.mjs 已在 LEAN_GATEWAY_PORT（默认 4174）上服务 dist，
 * 与 e2e-lean.mjs 共用同一个网关和浏览器通道；CI 里两个脚本跑在同一个 job。
 * 新增或删除课程时同步下面的 SLUGS（与 src/i18n/zh.ts 保持一致）。
 *
 * 默认开两个页面并行跑不同的课，缩短浏览器 E2E 的墙钟时间；CI 用
 * LEAN_E2E_WORKERS=3。同一 context 共享 Service Worker 与运行时缓存。
 */
import { chromium } from 'playwright-core';

const port = Number(process.env.LEAN_GATEWAY_PORT ?? 4174);
const origin = `http://127.0.0.1:${port}`;
const channel =
  process.env.LEAN_E2E_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome');
const executablePath = process.env.LEAN_E2E_EXECUTABLE || undefined;
const workers = Math.max(1, Math.min(4, Number(process.env.LEAN_E2E_WORKERS ?? 2) || 2));

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
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const browser = await chromium.launch({ channel, executablePath, headless: true });
  // 固定英文环境：让 Service Worker 走同源 /cdn/ 网关，避免本机中文环境优先命中外部镜像。
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const pages = await Promise.all(Array.from({ length: workers }, () => context.newPage()));
  const failures = [];

  const runLesson = async (page, slug, worker) => {
    const startedAt = Date.now();
    const prefix = `[w${worker}]`;
    await page.goto(`${origin}/zh/learn/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-role="status"][data-state="ready"]', { timeout: 240_000 });

    const count = await page.locator('button[data-run-index]').count();
    if (count === 0) {
      failures.push(`${slug}: 没有可运行的代码块`);
      return;
    }

    for (let index = 0; index < count; index += 1) {
      await page.locator('button[data-run-index]').nth(index).click();
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

      const errors = await page.locator(`[data-output="${index}"] .text-err`).allTextContents();
      if (errors.length > 0) {
        failures.push(
          `${slug} 第 ${index + 1} 块：${errors.map((text) => text.trim()).join(' | ')}`,
        );
      }

      // 课程里每块都应该有可见结果；#check / #eval 显示「没有输出」说明诊断丢了。
      const output = (await page.locator(`[data-output="${index}"]`).innerText()).trim();
      if (!output || output.includes('没有错误，也没有输出')) {
        failures.push(`${slug} 第 ${index + 1} 块：没有可见输出`);
      }
    }

    console.log(
      `ok   ${prefix} ${slug}（${count} 块，${((Date.now() - startedAt) / 1000).toFixed(1)}s）`,
    );
  };

  try {
    await Promise.all(
      pages.map(async (page, workerIndex) => {
        for (let index = workerIndex; index < SLUGS.length; index += workers) {
          const slug = SLUGS[index];
          try {
            await runLesson(page, slug, workerIndex + 1);
          } catch (error) {
            failures.push(`${slug}: ${error.message ?? error}`);
            console.error(`fail [w${workerIndex + 1}] ${slug}: ${error.message ?? error}`);
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
  console.log(`课程代码块全部通过：${SLUGS.length} 节，${workers} 路并行`);
};

main().catch((error) => {
  console.error('E2E lessons error:', error);
  process.exit(1);
});
