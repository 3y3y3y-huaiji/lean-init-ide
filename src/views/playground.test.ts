import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createLeanPanel } = vi.hoisted(() => ({ createLeanPanel: vi.fn() }));

vi.mock('../components/lean-panel', () => ({ createLeanPanel }));

const { mountPlayground, renderPlayground } = await import('./playground');

const makePanel = () => ({ setCode: vi.fn(), getCode: vi.fn(() => ''), dispose: vi.fn() });

describe('playground 页面', () => {
  beforeEach(() => {
    createLeanPanel.mockReset();
    createLeanPanel.mockReturnValue(makePanel());
  });

  it('渲染出供编辑器挂载的容器', () => {
    expect(renderPlayground()).toContain('data-role="playground"');
  });

  it('挂载时用全屏变体并带上默认示例代码', () => {
    document.body.innerHTML = renderPlayground();

    mountPlayground(document.body, 'zh');

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

  it('容器缺失时安全退出，不创建编辑器', () => {
    document.body.innerHTML = '<div></div>';

    mountPlayground(document.body, 'en');

    expect(createLeanPanel).not.toHaveBeenCalled();
  });
});
