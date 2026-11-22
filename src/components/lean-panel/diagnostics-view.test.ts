import { afterEach, describe, expect, it, vi } from 'vitest';
import { zh } from '../../i18n/zh';
import { createDiagnosticsView } from './diagnostics-view';

const URI = 'file:///workspace/Main.lean';

const buildHost = () => {
  const host = document.createElement('div');
  host.innerHTML = `
    <ul data-role="diagnostics"></ul>
    <span data-role="count">0</span>
    <div data-role="run-ok" hidden>
      <div data-role="run-ok-title"></div>
      <div data-role="run-ok-detail"></div>
    </div>
    <div data-role="load-failure" hidden>
      <div data-role="load-failure-title"></div>
      <div data-role="load-failure-detail"></div>
      <div data-role="load-failure-error"></div>
      <div data-role="load-failure-actions"></div>
    </div>
    <span data-role="passed" hidden></span>
  `;
  return host;
};

describe('createDiagnosticsView', () => {
  const t = zh.playground;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('渲染诊断列表、触发缺库一键修复与 onDiagnostics，并通过 documentSymbol 屏障显示通过提示', async () => {
    vi.useFakeTimers();
    const host = buildHost();
    let code = 'import Std\ntheorem t : True := trivial\n';
    const onDiagnostics = vi.fn();
    const onQuickFixLibrary = vi.fn();
    const revealLocation = vi.fn();
    const setMarkers = vi.fn();

    const view = createDiagnosticsView({
      host,
      uri: URI,
      variant: 'full',
      starterCode: 'theorem t : True := sorry',
      t,
      getCode: () => code,
      setModelMarkers: setMarkers,
      revealLocation,
      isSessionReady: () => true,
      requestDocumentSymbol: async () => [{ name: 't' }],
      getSelectedArch: () => 'wasm32',
      getRunStartedAt: () => 10,
      getLastEditAt: () => 20,
      log: () => {},
      setStatus: () => {},
      onProcessingChange: () => {},
      onRunPassed: () => {},
      onQuickFixLibrary,
      getLastAssetFallback: () => null,
      onDiagnostics,
      trackEvent: vi.fn(),
      perfNow: () => 50,
    });

    // 先触发一次缺库报错与一键修复。
    view.renderDiagnostics({
      uri: URI,
      diagnostics: [
        {
          severity: 1,
          message: "unknown module prefix 'Std'",
          range: { start: { line: 4, character: 0 }, end: { line: 4, character: 3 } },
        },
      ],
    });
    expect(setMarkers).toHaveBeenCalledTimes(1);
    expect(onDiagnostics).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-role="count"]')!.textContent).toBe('1');

    host.querySelector<HTMLButtonElement>('[data-role="diagnostics"] button')!.click();
    expect(revealLocation).toHaveBeenCalledWith(1, 8);

    const fixBtn = host.querySelector<HTMLButtonElement>('[data-role="library-quick-fix"]')!;
    fixBtn.click();
    expect(onQuickFixLibrary).toHaveBeenCalledWith('std');
    expect(fixBtn.disabled).toBe(true);

    // 清零诊断后等待 200ms 屏障 + 150ms 静默窗，亮起运行通过横幅和通关徽章。
    view.renderDiagnostics({ uri: URI, diagnostics: [] });
    expect(host.querySelector<HTMLElement>('[data-role="passed"]')!.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(150);
    expect(host.querySelector<HTMLElement>('[data-role="run-ok"]')!.hidden).toBe(false);

    // 代码重新变成 sorry 时立即收起通关徽章与通过提示。
    code = 'theorem t : True := sorry';
    view.onContentChanged(code);
    expect(host.querySelector<HTMLElement>('[data-role="passed"]')!.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('[data-role="run-ok"]')!.hidden).toBe(true);

    view.dispose();
  });

  it('处理 fileProgress 兜底定时器、屏障超时回退、loadFailure 分支与崩溃诊断保留/清空', async () => {
    vi.useFakeTimers();
    const host = buildHost();
    const statuses: string[] = [];
    const processingChanges: boolean[] = [];

    const view = createDiagnosticsView({
      host,
      uri: URI,
      variant: 'full',
      starterCode: 'example : True := trivial',
      t,
      getCode: () => 'example : True := trivial',
      setModelMarkers: () => {},
      revealLocation: () => {},
      isSessionReady: () => true,
      requestDocumentSymbol: async () => null,
      getSelectedArch: () => 'wasm32',
      getRunStartedAt: () => 0,
      getLastEditAt: () => 0,
      log: () => {},
      setStatus: (text) => statuses.push(text),
      onProcessingChange: (active) => processingChanges.push(active),
      onRunPassed: () => {},
      onQuickFixLibrary: () => {},
      getLastAssetFallback: () => ({ name: 'init-00.pack', message: 'timeout' }),
    });

    view.handleFileProgress({ uri: URI, processingCount: 1 });
    expect(view.isFileProcessing()).toBe(true);
    expect(processingChanges).toEqual([true]);

    // 在处理期间收到无诊断后触发 2000ms 兜底结束处理态，随后屏障返回 null 进入 unconfirmed。
    view.renderDiagnostics({ uri: URI, diagnostics: [] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(view.isFileProcessing()).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();
    expect(statuses.at(-1)).toBe(t.statusRunUnconfirmed);

    // showLoadFailure 区分兼容模式、资产错误（带回退标签）与通用启动错误。
    view.showLoadFailure('no sab', true);
    expect(host.querySelector<HTMLElement>('[data-role="load-failure-title"]')!.textContent).toBe(
      t.compatibilityTitle,
    );
    view.showLoadFailure('fetch HTTP 503', false);
    expect(
      host.querySelector<HTMLElement>('[data-role="load-failure-error"]')!.textContent,
    ).toContain('init-00.pack');

    // 无错误诊断时崩溃清空列表，有错误时保留诊断。
    view.handleCrashDiagnostics();
    expect(host.querySelector('[data-role="diagnostics"]')!.textContent).toContain(
      t.crashDiagnostics,
    );
    view.renderDiagnostics({
      uri: URI,
      diagnostics: [
        {
          severity: 1,
          message: 'err',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      ],
    });
    view.handleCrashDiagnostics();
    expect(host.querySelector('[data-role="count"]')!.textContent).toBe('1');
    view.dispose();
  });
});
