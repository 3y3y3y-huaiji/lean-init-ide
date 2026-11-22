import { beforeEach, describe, expect, it, vi } from 'vitest';
import { zh } from '../../i18n/zh';
import { createExtensionController } from './extension-controller';

const buildHost = () => {
  const host = document.createElement('div');
  host.innerHTML = `
    <span data-role="runtime-arch-label"></span>
    <span data-role="runtime-arch-note"></span>
    <button data-runtime-arch="wasm32"></button>
    <button data-runtime-arch="wasm64"></button>
    <div data-extension-row>
      <input type="checkbox" data-library-default="std" data-extension-arch="wasm32" />
      <button data-library="std" data-extension-arch="wasm32"></button>
    </div>
    <div data-extension-row>
      <input type="checkbox" data-library-default="batteries" data-extension-arch="wasm32" />
      <button data-library="batteries" data-extension-arch="wasm32"></button>
    </div>
    <button data-role="release-all-libraries"></button>
  `;
  return host;
};

describe('createExtensionController', () => {
  const t = zh.playground;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('课程需要 wasm32 扩展时自动把已存的 wasm64 偏好切回 wasm32 并持久化', async () => {
    localStorage.setItem('lean:runtime-arch', 'wasm64');
    const host = buildHost();
    const loadPacks = vi.fn().mockResolvedValue({ 'lean-std.index.json': new ArrayBuffer(4) });
    const controller = createExtensionController({
      host,
      t,
      requiredExtensions: ['std'],
      log: () => {},
      setStatus: () => {},
      closeMenus: () => {},
      isSessionActive: () => false,
      restartSession: async () => {},
      loadPacks,
      probeMemory64: () => true,
      isWasm64Published: () => true,
    });

    expect(controller.getSelectedArch()).toBe('wasm32');
    expect(controller.wasAutoSwitchedFromWasm64()).toBe(true);
    expect(localStorage.getItem('lean:runtime-arch')).toBe('wasm32');

    await controller.restoreSavedExtensions();
    expect(loadPacks).toHaveBeenCalledWith(['std']);
    expect(controller.getActiveExtensions()).toEqual(['std']);
  });

  it('切换运行时架构触发 onArchChanged 与重启，并支持 quick-fix 回切加载扩展', async () => {
    const host = buildHost();
    const onArchChanged = vi.fn();
    const restartSession = vi.fn(async () => {});
    const loadPacks = vi.fn().mockResolvedValue({ 'lean-std.index.json': new ArrayBuffer(8) });
    const logs: string[] = [];

    const controller = createExtensionController({
      host,
      t,
      requiredExtensions: [],
      log: (m) => logs.push(m),
      setStatus: () => {},
      closeMenus: () => {},
      isSessionActive: () => true,
      restartSession,
      onArchChanged,
      loadPacks,
      probeMemory64: () => true,
      isWasm64Published: () => true,
    });

    host.querySelector<HTMLButtonElement>('[data-runtime-arch="wasm64"]')!.click();
    expect(controller.getSelectedArch()).toBe('wasm64');
    expect(onArchChanged).toHaveBeenCalledWith('wasm64');
    expect(restartSession).toHaveBeenCalledTimes(1);

    controller.enableFromQuickFix('std');
    await Promise.resolve();
    await controller.drainExtensionSelections();
    expect(controller.getSelectedArch()).toBe('wasm32');
    expect(onArchChanged).toHaveBeenLastCalledWith('wasm32');
    expect(controller.getActiveExtensions()).toEqual(['std']);
  });

  it('勾选默认库同步依赖并支持释放全部及加载失败回滚', async () => {
    const host = buildHost();
    let failLoad = false;
    const loadPacks = vi.fn(async (ids) => {
      if (failLoad) throw new Error('download error');
      return { [`${ids[0]}.pack`]: new ArrayBuffer(4) };
    });
    const controller = createExtensionController({
      host,
      t,
      requiredExtensions: [],
      log: () => {},
      setStatus: () => {},
      closeMenus: () => {},
      isSessionActive: () => false,
      restartSession: async () => {},
      loadPacks,
      probeMemory64: () => false,
      isWasm64Published: () => false,
    });

    // 默认选中 batteries 会联动选中 std。
    const batDefault = host.querySelector<HTMLInputElement>('[data-library-default="batteries"]')!;
    const stdDefault = host.querySelector<HTMLInputElement>('[data-library-default="std"]')!;
    batDefault.checked = true;
    batDefault.dispatchEvent(new Event('change'));
    expect(stdDefault.checked).toBe(true);

    // 点击加载 std 后再点释放全部。
    host.querySelector<HTMLButtonElement>('[data-library="std"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.getActiveExtensions()).toEqual(['std']);

    host.querySelector<HTMLButtonElement>('[data-role="release-all-libraries"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.getActiveExtensions()).toEqual([]);

    // 加载失败应保持先前状态。
    failLoad = true;
    host.querySelector<HTMLButtonElement>('[data-library="std"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.getActiveExtensions()).toEqual([]);
  });
});
