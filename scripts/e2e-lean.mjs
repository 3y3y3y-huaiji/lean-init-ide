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
  try {
    // 固定英文环境：让 Service Worker 走同源 /cdn/ 网关，避免本机中文环境优先命中外部镜像。
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const page = await context.newPage();
    const startedAt = Date.now();
    const stamp = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

    await page.goto(`${origin}/zh/playground?debug`, { waitUntil: 'domcontentloaded' });

    // 慢 runner 上 Service Worker 的注册与激活可能超过 1s；等 ready 再断言，避免固定等待造成偶发失败。
    const env = await page.evaluate(async () => {
      const registration =
        'serviceWorker' in navigator
          ? await Promise.race([
              navigator.serviceWorker.ready,
              new Promise((resolve) => setTimeout(() => resolve(null), 30_000)),
            ])
          : null;
      const worker = registration?.active ?? null;
      // ready 之后 active worker 可能还停在 activating，再等一次状态切换。
      if (worker && worker.state !== 'activated') {
        await Promise.race([
          new Promise((resolve) => {
            worker.addEventListener('statechange', () => {
              if (worker.state === 'activated') resolve(null);
            });
          }),
          new Promise((resolve) => setTimeout(resolve, 10_000)),
        ]);
      }
      return {
        crossOriginIsolated: globalThis.crossOriginIsolated,
        worker: worker?.state ?? null,
        controlled: Boolean(navigator.serviceWorker.controller),
      };
    });
    if (!env.crossOriginIsolated) throw new Error('page is not cross-origin isolated');
    if (env.worker !== 'activated') throw new Error(`service worker state: ${env.worker}`);

    // 首次加载时 active 可能已 activated，但页面还没被 controller 接管；
    // 这时 /wasm-lean4/* 会绕过 SW 直接落到静态资源/SPA 回退，导致假失败。
    if (!env.controlled) {
      const controlled = await page.evaluate(
        () =>
          new Promise((resolve) => {
            if (navigator.serviceWorker.controller) return resolve(true);
            const timer = setTimeout(() => resolve(false), 10_000);
            navigator.serviceWorker.addEventListener(
              'controllerchange',
              () => {
                clearTimeout(timer);
                resolve(true);
              },
              { once: true },
            );
          }),
      );
      if (!controlled) throw new Error('page is not controlled by the service worker');
    }

    // 设置面板里可以直接选下载源，四个选项都要在，且默认回显「自动」。
    await page.click('#settings-toggle');
    const sourceSetting = await page.evaluate(() => {
      const select = globalThis.document.querySelector('#asset-source');
      return {
        value: select?.value ?? null,
        options: select ? [...select.options].map((option) => option.value) : [],
      };
    });
    if (
      sourceSetting.value !== 'auto' ||
      ['auto', 'cdn', 'mirror', 'github'].some((mode) => !sourceSetting.options.includes(mode))
    ) {
      throw new Error(`设置里的下载源不完整: ${JSON.stringify(sourceSetting)}`);
    }
    await page.click('#settings-toggle');
    console.log(`[${stamp()}] 设置里的下载源正常`);

    await page.click('[data-role="start"]');
    console.log(`[${stamp()}] 启动 Lean（默认示例）`);

    const read = () =>
      page.evaluate(() => {
        const runOk = globalThis.document.querySelector('[data-role="run-ok"]');
        return {
          state: globalThis.document.querySelector('[data-role="status"]')?.dataset.state,
          status: globalThis.document.querySelector('[data-role="status"]')?.textContent ?? '',
          log: globalThis.document.querySelector('[data-role="log"]')?.textContent ?? '',
          runOk: {
            visible: Boolean(runOk) && !runOk.hidden,
            text: (runOk?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          },
          diagnostics: [
            ...globalThis.document.querySelectorAll('[data-role="diagnostics"] li'),
          ].map((node) => (node.textContent ?? '').trim()),
        };
      });

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

    if (!result?.ok) {
      throw new Error(result?.reason ?? '等待诊断超时');
    }
    if (final.runOk.visible) {
      throw new Error('有错误的示例不应显示运行通过');
    }

    // 第二阶段：换成无错误代码，确认界面上出现「运行通过」提示框，而不是只在日志里。
    let successText = '';
    await page.evaluate(() => {
      const editor = globalThis.__editor;
      if (!editor) throw new Error('debug editor handle missing');
      editor.setValue('example : 2 + 2 = 4 := rfl');
    });
    const successDeadline = Date.now() + Math.min(timeoutMs, 60_000);
    while (Date.now() < successDeadline) {
      await page.waitForTimeout(500);
      const snapshot = await read();
      if (snapshot.runOk.visible && snapshot.runOk.text.includes('运行通过')) {
        successText = snapshot.runOk.text;
        break;
      }
      if (badLogPattern.test(snapshot.log)) break;
    }
    if (!successText) throw new Error('无错误代码没有显示运行通过提示框');
    console.log(`[${stamp()}] 成功提示框: ${successText}`);

    // 第三阶段：左右分栏可拖拽，日志面板可从「面板显示」里隐藏。
    const aside = page.locator('[data-role="aside"]');
    const before = await aside.evaluate((node) => node.getBoundingClientRect().width);
    const box = await page.locator('[data-role="split"]').boundingBox();
    if (!box) throw new Error('找不到左右分栏拖拽条');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const after = await aside.evaluate((node) => node.getBoundingClientRect().width);
    if (after < before + 60) throw new Error(`分栏拖拽无效: ${before} -> ${after}`);
    const splitWidth = Math.round(after);
    console.log(`[${stamp()}] 分栏宽度: ${Math.round(before)} -> ${splitWidth}`);

    await page.click('[data-role="panels"] summary');
    await page.locator('[data-panel-toggle="log"]').click();
    const logHidden = await page.evaluate(
      () => globalThis.document.querySelector('[data-panel="log"]')?.hidden ?? false,
    );
    if (!logHidden) throw new Error('取消勾选后日志面板没有隐藏');
    console.log(`[${stamp()}] 日志面板已隐藏`);

    // 第四阶段：Goal 面板不能把 plainGoal 返回的 ```lean 围栏当成正文显示。
    let goalText = '';
    await page.evaluate(() => {
      const editor = globalThis.__editor;
      editor.setValue('theorem goal_demo (a : Nat) : a + 0 = a := by\n  sorry');
      editor.setPosition({ lineNumber: 2, column: 3 });
      editor.focus();
    });
    const goalDeadline = Date.now() + Math.min(timeoutMs, 30_000);
    while (Date.now() < goalDeadline) {
      await page.waitForTimeout(500);
      goalText = await page.evaluate(
        () => globalThis.document.querySelector('[data-role="goal"]')?.textContent ?? '',
      );
      if (goalText.includes('⊢') && goalText.includes('a + 0 = a')) break;
    }
    if (goalText.includes('```')) {
      throw new Error(`Goal 面板显示了 Markdown 围栏: ${goalText}`);
    }
    if (!goalText.includes('⊢')) {
      throw new Error(`Goal 面板没有显示目标: ${goalText}`);
    }
    console.log(`[${stamp()}] Goal: ${goalText.replace(/\s+/g, ' ').trim()}`);

    // 第五阶段：反斜杠缩写候选的每一行都要标出对应的 Unicode 符号，而不是只有选中行。
    await page.evaluate(() => {
      const editor = globalThis.__editor;
      editor.setValue('');
      editor.setPosition({ lineNumber: 1, column: 1 });
      editor.focus();
    });
    await page.keyboard.type('\\');
    await page.waitForSelector('.suggest-widget .monaco-list-row', { timeout: 15_000 });
    const rows = await page.evaluate(() =>
      [...globalThis.document.querySelectorAll('.suggest-widget .monaco-list-row')]
        .slice(0, 6)
        .map((row) => (row.textContent ?? '').replace(/\s+/g, ' ').trim()),
    );
    const unannotated = rows.filter((row) => !row.includes('Unicode 缩写'));
    if (rows.length === 0 || unannotated.length > 0) {
      throw new Error(`缩写候选缺少 Unicode 标注: ${JSON.stringify(rows)}`);
    }
    console.log(`[${stamp()}] 缩写候选: ${JSON.stringify(rows.slice(0, 3))}`);

    // 第六阶段：成功提示必须等整个文件处理完；早到的空诊断不能先亮，晚到的错误要立即收起。
    await page.evaluate(() => {
      globalThis.__editor.setValue('example : 2 + 2 = 4 := rfl');
    });
    await page.waitForSelector('[data-role="run-ok"]:not([hidden])', { timeout: 60_000 });
    await page.evaluate(() =>
      globalThis.__renderDiagnostics({ uri: 'file:///workspace/Main.lean', diagnostics: [] }),
    );
    const hiddenAfterEarly = await page.evaluate(
      () => globalThis.document.querySelector('[data-role="run-ok"]')?.hidden ?? false,
    );
    if (!hiddenAfterEarly) throw new Error('早到的空诊断直接显示了运行通过');
    await page.waitForSelector('[data-role="run-ok"]:not([hidden])', { timeout: 30_000 });
    await page.evaluate(() =>
      globalThis.__renderDiagnostics({
        uri: 'file:///workspace/Main.lean',
        diagnostics: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            severity: 1,
            message: 'late error',
          },
        ],
      }),
    );
    await page.waitForTimeout(600);
    const hiddenAfterLateError = await page.evaluate(
      () => globalThis.document.querySelector('[data-role="run-ok"]')?.hidden ?? false,
    );
    if (!hiddenAfterLateError) throw new Error('晚到的错误没有收起运行通过');
    console.log(`[${stamp()}] 成功提示只在诊断结算后显示`);

    // 屏障不可用（documentSymbol 失败/超时）时不能永远不亮：退化结算后仍要显示运行通过。
    await page.evaluate(() => globalThis.__skipRunBarrier());
    await page.evaluate(() => globalThis.__editor.setValue('example : 3 + 3 = 6 := rfl'));
    const fallbackDeadline = Date.now() + 30_000;
    let fallbackText = '';
    while (Date.now() < fallbackDeadline) {
      await page.waitForTimeout(500);
      const snapshot = await read();
      if (snapshot.runOk.visible && snapshot.runOk.text.includes('运行通过')) {
        fallbackText = snapshot.runOk.text;
        break;
      }
    }
    if (!fallbackText) throw new Error('屏障不可用时运行通过提示没有出现');
    console.log(`[${stamp()}] 屏障不可用时的退化提示: ${fallbackText}`);

    // 第七阶段：资产下载失败时给出可换源的恢复入口。
    await page.evaluate(() =>
      globalThis.__showLoadFailure('Failed to load runtime asset lean-init-00.pack.gz.bin'),
    );
    const failureUi = await page.evaluate(() => {
      const card = globalThis.document.querySelector('[data-role="load-failure"]');
      return {
        visible: !!card && !card.hidden,
        text: card?.textContent ?? '',
        sources: [...(card?.querySelectorAll('[data-source]') ?? [])].map(
          (button) => button.dataset.source,
        ),
      };
    });
    if (
      !failureUi.visible ||
      !failureUi.text.includes('运行时资产下载失败') ||
      !failureUi.text.includes('lean-init-00.pack.gz.bin') ||
      ['cdn', 'mirror', 'github', 'auto'].some((mode) => !failureUi.sources.includes(mode))
    ) {
      throw new Error(`资产失败恢复入口不完整: ${JSON.stringify(failureUi)}`);
    }
    console.log(`[${stamp()}] 资产失败换源入口正常`);
    await page.evaluate(() => globalThis.__hideLoadFailure());

    // 第八阶段：练习通过后写入完成进度，而不只是显示一次徽章。
    await page.goto(`${origin}/zh/playground?lesson=math-parity&debug`, {
      waitUntil: 'domcontentloaded',
    });
    await page.click('[data-role="start"]');
    await page.waitForSelector('[data-role="status"][data-state="ready"]', { timeout: 240_000 });
    await page.evaluate(() => {
      globalThis.__editor.setValue(
        'def Even (n : Nat) : Prop := ∃ k, n = 2 * k\n\ntheorem even_mul (a b : Nat) (h : Even a) : Even (a * b) := by\n  rcases h with ⟨k, rfl⟩\n  exact ⟨k * b, by rw [Nat.mul_assoc]⟩\n',
      );
    });
    let completionOk = false;
    const completionDeadline = Date.now() + 30_000;
    while (Date.now() < completionDeadline) {
      await page.waitForTimeout(500);
      completionOk = await page.evaluate(() => {
        const badge = globalThis.document.querySelector('[data-role="passed"]');
        const raw = globalThis.localStorage.getItem('lean:progress:completed') ?? '[]';
        try {
          return !badge?.hidden && JSON.parse(raw).includes('math-parity');
        } catch {
          return false;
        }
      });
      if (completionOk) break;
    }
    if (!completionOk) throw new Error('练习通过后没有写入完成进度');
    console.log(`[${stamp()}] 完成进度已写入 math-parity`);

    // 第九阶段：模拟 worker 崩溃，确认自动重启且编辑内容不丢。
    await page.evaluate(() => {
      globalThis.__leanCrash(
        'Lean pthread failed: Uncaught RangeError: Maximum call stack size exceeded',
      );
    });
    const crashVisible = await page.evaluate(() => {
      const el = globalThis.document.querySelector('[data-role="crash"]');
      return !!el && !el.hidden;
    });
    if (!crashVisible) throw new Error('崩溃恢复提示没有出现');
    await page.waitForSelector('[data-role="crash"]', { state: 'hidden', timeout: 240_000 });
    const preserved = await page.evaluate(() =>
      globalThis.__editor.getValue().includes('theorem even_mul'),
    );
    if (!preserved) throw new Error('崩溃重启后编辑内容丢失');
    console.log(`[${stamp()}] 崩溃自动重启完成，编辑内容保留`);

    // 第十阶段：速查表与英文路由可正常按需加载语言包并渲染，遥测端点返回 204。
    await page.goto(`${origin}/zh/reference`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1');
    const referenceOk = await page.evaluate(() => {
      const title = globalThis.document.querySelector('h1')?.textContent ?? '';
      const text = globalThis.document.body.textContent ?? '';
      return title.includes('速查') && text.includes('grind') && text.includes('type mismatch');
    });
    if (!referenceOk) throw new Error('速查表页面没有正确渲染');

    await page.goto(`${origin}/en/reference`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1');
    const enOk = await page.evaluate(() => {
      const title = globalThis.document.querySelector('h1')?.textContent ?? '';
      const text = globalThis.document.body.textContent ?? '';
      return title.includes('Tactics') && text.includes('grind') && text.includes('type mismatch');
    });
    if (!enOk) throw new Error('英文速查表页面没有正确渲染');

    const telemetryStatus = await page.evaluate(async () => {
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v: 1, events: [{ name: 'boot', ts: Date.now() }] }),
      });
      return res.status;
    });
    if (telemetryStatus !== 204) {
      throw new Error(`/api/telemetry 期望 204，实际 ${telemetryStatus}`);
    }
    console.log(`[${stamp()}] 速查表 / 英文路由 / 遥测端点正常`);
    console.log(`E2E PASS: ${result.initializeLine?.trim()}`);
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error('E2E ERROR:', error instanceof Error ? error.message : String(error));
  process.exit(2);
});
