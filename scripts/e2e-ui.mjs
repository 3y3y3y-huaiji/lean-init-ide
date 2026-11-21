/**
 * 轻量多视口 UI 契约 E2E（不下载、不启动 102MB Lean WASM）。
 *
 * 覆盖手机（390×844）、平板竖屏（820×1180）、平板横屏（1024×768 / 1180×820 触屏）与桌面（1440×900），
 * 校验：页面零运行时错误、无根文档横向溢出、主标题唯一性、设置及编辑器下拉浮层不越界、触控工具栏显隐、下载源与 SSG/CLS。
 */
import { chromium } from 'playwright-core';

const port = Number(process.env.LEAN_GATEWAY_PORT ?? 4174);
const origin = `http://127.0.0.1:${port}`;
const channel =
  process.env.LEAN_E2E_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome');
const executablePath = process.env.LEAN_E2E_EXECUTABLE || undefined;

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, hasTouch: true },
  { name: 'tablet-portrait', width: 820, height: 1180, hasTouch: true },
  { name: 'tablet-landscape', width: 1024, height: 768, hasTouch: true },
  { name: 'tablet-landscape-wide', width: 1180, height: 820, hasTouch: true },
  { name: 'desktop', width: 1440, height: 900, hasTouch: false },
];

const ROUTES = [
  '/',
  '/zh/',
  '/zh/learn/what-is-lean',
  '/zh/challenges',
  '/zh/playground',
  '/zh/reference',
  '/en/reference',
];

const SSG_CHECK_PATHS = [
  '/zh/learn/what-is-lean',
  '/zh/playground',
  '/en/learn/what-is-lean',
  '/en/playground',
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

/**
 * 校验弹窗/浮层元素完整落在当前视口内部且宽度可见。
 * PR 2 修复 Playground 下拉菜单定位后，直接复用本函数断言 runtime-arch / libraries / panels。
 */
export const assertWithinViewport = async (page, selector, label) => {
  const box = await page.evaluate((sel) => {
    const el = globalThis.document.querySelector(sel);
    if (!el || el.hidden) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      vw: globalThis.window.innerWidth,
      vh: globalThis.window.innerHeight,
    };
  }, selector);

  if (!box) throw new Error(`${label} (${selector}) 未展开或不可见`);
  if (box.width <= 100 || box.height <= 0) {
    throw new Error(`${label} 尺寸异常: ${JSON.stringify(box)}`);
  }
  if (box.left < -1 || box.right > box.vw + 1) {
    throw new Error(`${label} 水平越出视口: ${JSON.stringify(box)}`);
  }
};

const assertRootLayout = async (page, label) => {
  const layout = await page.evaluate(() => {
    const doc = globalThis.document;
    const h1s = [...doc.querySelectorAll('h1')];
    return {
      scrollWidth: doc.documentElement.scrollWidth,
      innerWidth: globalThis.window.innerWidth,
      h1Count: h1s.length,
      h1Text: h1s[0]?.textContent?.trim() ?? '',
    };
  });
  if (layout.scrollWidth > layout.innerWidth + 1) {
    throw new Error(
      `${label} 出现横向溢出: scrollWidth=${layout.scrollWidth} > innerWidth=${layout.innerWidth}`,
    );
  }
  if (layout.h1Count !== 1 || !layout.h1Text) {
    throw new Error(`${label} 主标题异常: ${JSON.stringify(layout)}`);
  }
};

const main = async () => {
  await waitForGateway();
  const browser = await chromium.launch({ channel, executablePath, headless: true });
  const startedAt = Date.now();
  const stamp = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  try {
    for (const vp of VIEWPORTS) {
      const errors = [];
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: vp.hasTouch,
        locale: 'en-US',
        timezoneId: 'UTC',
        extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      });

      // 强制省流模式 + 禁止自动下载，确保不会在轻量 UI E2E 里触发 102MB WASM 拉取。
      await context.addInitScript(() => {
        try {
          Object.defineProperty(globalThis.navigator, 'connection', {
            configurable: true,
            get: () => ({ saveData: true }),
          });
        } catch {
          // 忽略不可重定义的浏览器实现
        }
      });

      const page = await context.newPage();
      if (vp.hasTouch) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      }
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });

      for (const route of ROUTES) {
        await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('h1');
        // 给 async 挂载的视图（如 playground / lesson）一小段稳定窗口，避免只测到静态骨架。
        await page.waitForTimeout(150);
        await assertRootLayout(page, `${vp.name} ${route}`);

        // 校验设置弹出面板在当前视口下完整可见、不越界。
        await page.click('#settings-toggle');
        await assertWithinViewport(page, '#settings-panel', `${vp.name} ${route} 设置面板`);
        await page.click('#settings-toggle');

        if (route === '/zh/playground') {
          await page.waitForSelector('[data-role="editor"]');
          await page.waitForTimeout(100);

          for (const menuRole of ['runtime-arch', 'libraries', 'panels']) {
            await page.click(`[data-role="${menuRole}"] summary`);
            await assertWithinViewport(
              page,
              `[data-role="${menuRole}"] [data-role="menu-popover"]`,
              `${vp.name} ${menuRole} 菜单`,
            );
          }
          // 再次点击当前打开的 panels 收起，保持页面初始清洁状态。
          await page.click('[data-role="panels"] summary');

          const pgState = await page.evaluate(() => {
            const doc = globalThis.document;
            const mobileActions = doc.querySelector('[data-role="mobile-actions"]');
            const mobileActionsDisplay = mobileActions
              ? globalThis.getComputedStyle(mobileActions).display
              : null;
            const assetOptions = [...doc.querySelectorAll('#asset-source option')].map(
              (option) => option.value,
            );
            const failureSources = [
              ...doc.querySelectorAll('[data-role="load-failure-actions"] [data-source]'),
            ].map((btn) => btn.dataset.source);
            return { mobileActionsDisplay, assetOptions, failureSources };
          });

          const expectMobileActions = vp.hasTouch || vp.width <= 1024;
          if (expectMobileActions && pgState.mobileActionsDisplay === 'none') {
            throw new Error(
              `${vp.name} 期望显示触控剪贴板栏 mobile-actions，实际 display=${pgState.mobileActionsDisplay}`,
            );
          }
          if (!expectMobileActions && pgState.mobileActionsDisplay !== 'none') {
            throw new Error(
              `${vp.name} 期望隐藏 mobile-actions，实际 display=${pgState.mobileActionsDisplay}`,
            );
          }
          if (JSON.stringify(pgState.assetOptions) !== JSON.stringify(['auto', 'cdn', 'mirror'])) {
            throw new Error(
              `${vp.name} 下载源下拉选项异常: ${JSON.stringify(pgState.assetOptions)}`,
            );
          }
          if (
            JSON.stringify(pgState.failureSources) !== JSON.stringify(['cdn', 'mirror', 'auto'])
          ) {
            throw new Error(
              `${vp.name} 失败恢复源按钮异常: ${JSON.stringify(pgState.failureSources)}`,
            );
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`${vp.name} 发现浏览器错误:\n${errors.join('\n')}`);
      }
      console.log(`[${stamp()}] ${vp.name} (${vp.width}x${vp.height}) ${ROUTES.length} 条路由通过`);
      await context.close();
    }

    // 桌面端额外校验 SSG 水合标记、语言属性、根路径规范入口及 CLS < 0.05。
    const ssgContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      timezoneId: 'UTC',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    await ssgContext.addInitScript(() => {
      globalThis.__uiCls = 0;
      new globalThis.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) globalThis.__uiCls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const ssgPage = await ssgContext.newPage();

    for (const checkPath of SSG_CHECK_PATHS) {
      await ssgPage.goto(`${origin}${checkPath}`, { waitUntil: 'load' });
      await ssgPage.waitForTimeout(300);
      const perf = await ssgPage.evaluate(() => ({
        lang: globalThis.document.documentElement.lang,
        ssg:
          globalThis.document.head
            .querySelector('meta[name="lean-ssg"]')
            ?.getAttribute('content') ?? '',
        cls: globalThis.__uiCls ?? 0,
      }));
      const expectedLang = checkPath.startsWith('/en/') ? 'en' : 'zh-CN';
      if (perf.lang !== expectedLang) {
        throw new Error(`${checkPath} <html lang> 期望 ${expectedLang}，实际为 "${perf.lang}"`);
      }
      if (perf.ssg !== checkPath) {
        throw new Error(`${checkPath} 缺少匹配的 SSG 标记，实际为 "${perf.ssg}"`);
      }
      if (perf.cls >= 0.05) {
        throw new Error(`${checkPath} 累积布局偏移过大: CLS=${perf.cls.toFixed(4)}`);
      }
    }

    await ssgPage.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await ssgPage.waitForSelector('h1');
    const root = await ssgPage.evaluate(() => ({
      path: globalThis.location.pathname,
      lang: globalThis.document.documentElement.lang,
      canonical: globalThis.document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    }));
    if (root.path !== '/') {
      throw new Error(`根路径不应被改写，实际路径为 ${root.path}`);
    }
    if (root.lang !== 'en') {
      throw new Error(`根路径 <html lang> 期望 en，实际为 "${root.lang}"`);
    }
    if (root.canonical !== 'https://criticalthinking.de5.net/') {
      throw new Error(
        `根路径 canonical 期望 https://criticalthinking.de5.net/，实际为 "${root.canonical}"`,
      );
    }
    await ssgContext.close();
    console.log(`[${stamp()}] SSG 标记 / 根路径规范入口 / CLS 校验通过`);
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error('E2E UI ERROR:', error instanceof Error ? error.message : String(error));
  process.exit(2);
});
