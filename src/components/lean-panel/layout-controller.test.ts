import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLayoutController } from './layout-controller';

const buildHost = () => {
  const host = document.createElement('div');
  host.innerHTML = `
    <div data-role="workspace" style="padding-left:0;padding-right:0">
      <div data-role="editor-wrap"></div>
      <div data-role="resize"></div>
      <div data-role="split"></div>
      <aside data-role="aside"></aside>
    </div>
    <input type="checkbox" data-panel-toggle="goal" />
    <section data-panel="goal"></section>
    <input type="checkbox" data-panel-toggle="log" />
    <section data-panel="log"></section>
    <details data-role="libraries">
      <summary>Libs</summary>
      <div data-role="menu-popover"></div>
    </details>
    <details data-role="panels">
      <summary>Panels</summary>
      <div data-role="menu-popover"></div>
    </details>
  `;
  return host;
};

describe('createLayoutController', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('恢复布局与面板开关状态，并持久化面板显隐切换', () => {
    localStorage.setItem(
      'lean-panel:layout',
      JSON.stringify({ editorRatio: 0.6, panelWidth: 380 }),
    );
    localStorage.setItem('lean-panel:panels', JSON.stringify({ log: true }));

    const host = buildHost();
    const matchListeners: Array<() => void> = [];
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: (_: string, cb: () => void) => matchListeners.push(cb),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    const workspace = host.querySelector<HTMLElement>('[data-role="workspace"]')!;
    Object.defineProperty(workspace, 'clientWidth', { value: 1200, configurable: true });

    const controller = createLayoutController(host, 'compact');
    expect(host.querySelector<HTMLElement>('[data-role="editor-wrap"]')!.style.flex).toContain(
      '60%',
    );
    expect(workspace.style.gridTemplateColumns).toContain('380px');

    const logToggle = host.querySelector<HTMLInputElement>('[data-panel-toggle="log"]')!;
    const logPanel = host.querySelector<HTMLElement>('[data-panel="log"]')!;
    expect(logToggle.checked).toBe(true);
    expect(logPanel.hidden).toBe(false);

    logToggle.checked = false;
    logToggle.dispatchEvent(new Event('change'));
    expect(logPanel.hidden).toBe(true);
    expect(JSON.parse(localStorage.getItem('lean-panel:panels')!)).toMatchObject({ log: false });

    controller.dispose();
  });

  it('互斥控制 <details> 菜单、支持同步点击与 Escape/外部点击收起', () => {
    const host = buildHost();
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    const libs = host.querySelector<HTMLDetailsElement>('details[data-role="libraries"]')!;
    const panels = host.querySelector<HTMLDetailsElement>('details[data-role="panels"]')!;
    const popover = libs.querySelector<HTMLElement>('[data-role="menu-popover"]')!;
    vi.spyOn(popover, 'getBoundingClientRect').mockReturnValue({
      left: -20,
      right: 300,
      top: 0,
      bottom: 100,
      width: 320,
      height: 100,
      x: -20,
      y: 0,
      toJSON: () => ({}),
    });

    const controller = createLayoutController(host, 'full');
    libs.querySelector('summary')!.click();
    expect(libs.open).toBe(true);
    expect(popover.style.transform).toContain('translateX(');

    panels.querySelector('summary')!.click();
    expect(panels.open).toBe(true);
    expect(libs.open).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panels.open).toBe(false);

    libs.querySelector('summary')!.click();
    expect(libs.open).toBe(true);
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(libs.open).toBe(false);

    controller.dispose();
  });

  it('支持拖拽高度与宽度并在存储损坏时安全回退', () => {
    localStorage.setItem('lean-panel:layout', '{broken');
    const host = buildHost();
    const wrap = host.querySelector<HTMLElement>('[data-role="editor-wrap"]')!;
    Object.defineProperty(wrap.parentElement!, 'clientHeight', { value: 500, configurable: true });
    const workspace = host.querySelector<HTMLElement>('[data-role="workspace"]')!;
    Object.defineProperty(workspace, 'clientWidth', { value: 1200, configurable: true });
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    const controller = createLayoutController(host, 'compact');
    expect(wrap.style.flex).toContain('45%');

    const resize = host.querySelector<HTMLElement>('[data-role="resize"]')!;
    const down = new Event('pointerdown', { cancelable: true }) as PointerEvent;
    Object.defineProperty(down, 'clientY', { value: 100 });
    resize.dispatchEvent(down);
    const move = new Event('pointermove') as PointerEvent;
    Object.defineProperty(move, 'clientY', { value: 200 });
    window.dispatchEvent(move);
    window.dispatchEvent(new Event('pointerup'));
    expect(wrap.style.flex).toContain('65%');

    const split = host.querySelector<HTMLElement>('[data-role="split"]')!;
    const aside = host.querySelector<HTMLElement>('[data-role="aside"]')!;
    vi.spyOn(aside, 'getBoundingClientRect').mockReturnValue({
      width: 340,
      height: 500,
      top: 0,
      left: 0,
      right: 340,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const sDown = new Event('pointerdown', { cancelable: true }) as PointerEvent;
    Object.defineProperty(sDown, 'clientX', { value: 500 });
    split.dispatchEvent(sDown);
    const sMove = new Event('pointermove') as PointerEvent;
    Object.defineProperty(sMove, 'clientX', { value: 440 });
    window.dispatchEvent(sMove);
    window.dispatchEvent(new Event('pointerup'));
    expect(workspace.style.gridTemplateColumns).toContain('400px');

    controller.dispose();
  });
});
