/**
 * 浏览器端到端门禁：启动真实 Lean 引擎，确认诊断返回且没有资产回退/trap。
 *
 * 依赖 scripts/local-gateway.mjs 已在 LEAN_GATEWAY_PORT（默认 4174）上服务 dist。
 * 浏览器通道默认 Windows 用系统 Edge、其他平台用 Chrome；可用 LEAN_E2E_CHANNEL 覆盖。
 */
import { chromium } from 'playwright-core';

const port = Number(process.env.LEAN_GATEWAY_PORT ?? 4174);
const origin = `http://127.0.0.1:${port}`;
const timeoutMs = Number(process.env.LEAN_E2E_TIMEOUT_MS ?? 300_000);
const channel =
  process.env.LEAN_E2E_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome');
const executablePath = process.env.LEAN_E2E_EXECUTABLE || undefined;

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

const badLogPattern =
  /分片回退|Failed to fetch|运行时错误|Runtime error|RuntimeError|pthread failed/i;

const main = async () => {
  await waitForGateway();
  const browser = await chromium.launch({ channel, executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const startedAt = Date.now();
  const stamp = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  await page.goto(`${origin}/zh/playground`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const env = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      crossOriginIsolated: globalThis.crossOriginIsolated,
      worker: registration?.active?.state ?? null,
      controlled: Boolean(navigator.serviceWorker.controller),
    };
  });
  if (!env.crossOriginIsolated) throw new Error('page is not cross-origin isolated');
  if (env.worker !== 'activated') throw new Error(`service worker state: ${env.worker}`);

  await page.click('[data-role="start"]');
  console.log(`[${stamp()}] 启动 Lean（默认示例）`);

  const read = () =>
    page.evaluate(() => ({
      state: globalThis.document.querySelector('[data-role="status"]')?.dataset.state,
      status: globalThis.document.querySelector('[data-role="status"]')?.textContent ?? '',
      log: globalThis.document.querySelector('[data-role="log"]')?.textContent ?? '',
      diagnostics: [...globalThis.document.querySelectorAll('[data-role="diagnostics"] li')].map(
        (node) => (node.textContent ?? '').trim(),
      ),
    }));

  const deadline = Date.now() + timeoutMs;
  let result;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    const snapshot = await read();
    if (badLogPattern.test(snapshot.log)) {
      result = { ok: false, reason: '日志出现资产回退或运行时错误', snapshot };
      break;
    }
    const initializeLine = snapshot.log
      .split('\n')
      .find((line) => line.includes('initialize 完成'));
    const hasTypeError = snapshot.diagnostics.some((item) => item.includes('Type mismatch'));
    const hasCheck = snapshot.diagnostics.some((item) => item.includes('Nat.add'));
    if (snapshot.state === 'ready' && initializeLine && hasTypeError && hasCheck) {
      result = { ok: true, snapshot, initializeLine };
      break;
    }
  }

  const final = await read();
  console.log(`[${stamp()}] 状态: ${final.status} (${final.state})`);
  console.log('诊断:', JSON.stringify(final.diagnostics));
  console.log('日志:\n' + final.log);

  await browser.close();

  if (!result?.ok) {
    console.error(`E2E FAIL: ${result?.reason ?? '等待诊断超时'}`);
    process.exit(1);
  }
  console.log(`E2E PASS: ${result.initializeLine?.trim()}`);
};

main().catch((error) => {
  console.error('E2E ERROR:', error instanceof Error ? error.message : String(error));
  process.exit(2);
});
