import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesFor } from '../i18n';

const { createLeanPanel } = vi.hoisted(() => ({ createLeanPanel: vi.fn() }));

vi.mock('../components/lean-panel', () => ({ createLeanPanel }));

const { mountPlayground, renderPlayground } = await import('./playground');

const makePanel = () => ({ setCode: vi.fn(), getCode: vi.fn(() => ''), dispose: vi.fn() });

describe('playground 页面', () => {
  beforeEach(() => {
    createLeanPanel.mockReset();
    createLeanPanel.mockReturnValue(makePanel());
    history.replaceState(null, '', '/zh/playground');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('渲染出包含编辑器壳层和标题的容器，不依赖 Monaco', () => {
    const html = renderPlayground('zh');
    expect(html).toContain('data-role="playground"');
    expect(html).toContain('data-ssr-markup="full"');
    expect(html).toContain(`>${messagesFor('zh').playground.title}</h1>`);
  });

  it('挂载时按需加载编辑器并用全屏变体与默认示例代码', async () => {
    document.body.innerHTML = renderPlayground('zh');

    await mountPlayground(document.body, 'zh');

    expect(createLeanPanel).toHaveBeenCalledTimes(1);
    const [host, options] = createLeanPanel.mock.calls[0] as [
      HTMLElement,
      { variant: string; code: string; locale: string; autoStart: boolean },
    ];
    expect(host.dataset.role).toBe('playground');
    expect(options.variant).toBe('full');
    expect(options.locale).toBe('zh');
    expect(options.code).toContain('theorem');
    expect(typeof options.autoStart).toBe('boolean');
  });

  it('带 ?lesson= 参数时载入对应课时练习 starter 与 draftKey', async () => {
    history.replaceState(null, '', '/en/playground?lesson=math-parity');
    document.body.innerHTML = renderPlayground('en');

    await mountPlayground(document.body, 'en');

    const [, options] = createLeanPanel.mock.calls[0] as [
      HTMLElement,
      { code: string; lessonSlug?: string; draftKey?: string },
    ];
    expect(options.lessonSlug).toBe('math-parity');
    expect(options.draftKey).toContain('math-parity');
    expect(options.code).toContain('even_mul');
  });

  it('低内存设备即使开启自动启动也强制关闭 autoStart', async () => {
    localStorage.setItem('lean:auto-start', '1');
    Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true });
    document.body.innerHTML = renderPlayground('zh');

    await mountPlayground(document.body, 'zh');

    const [, options] = createLeanPanel.mock.calls[0] as [HTMLElement, { autoStart: boolean }];
    expect(options.autoStart).toBe(false);
    delete (navigator as { deviceMemory?: number }).deviceMemory;
    localStorage.clear();
  });

  it('主包加载前点击启动 Lean 会在挂载后立即触发启动，不丢点击', async () => {
    document.body.innerHTML = renderPlayground('zh');
    const mountPromise = mountPlayground(document.body, 'zh');

    document.body.querySelector<HTMLButtonElement>('[data-role="start"]')!.click();
    expect(document.body.querySelector<HTMLElement>('[data-role="status"]')?.dataset.state).toBe(
      'loading',
    );

    await mountPromise;

    const [, options] = createLeanPanel.mock.calls[0] as [
      HTMLElement,
      { startImmediately?: boolean },
    ];
    expect(options.startImmediately).toBe(true);
  });

  it('容器缺失时安全退出，不创建编辑器', async () => {
    document.body.innerHTML = '<div></div>';

    await mountPlayground(document.body, 'en');

    expect(createLeanPanel).not.toHaveBeenCalled();
  });
});
