import { afterEach, describe, expect, it, vi } from 'vitest';
import { zh } from '../../i18n/zh';
import { createCrashRecoveryController } from './crash-recovery';

const buildHost = () => {
  const host = document.createElement('div');
  host.innerHTML = `
    <div data-role="crash" hidden>
      <div data-role="crash-title"></div>
      <div data-role="crash-detail"></div>
      <button data-role="crash-restart"></button>
      <button data-role="crash-copy"></button>
    </div>
    <button data-source="mirror"></button>
    <button data-source="auto"></button>
    <button data-role="retry-load"></button>
  `;
  return host;
};

describe('createCrashRecoveryController', () => {
  const t = zh.playground;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('首次运行时崩溃显示恢复横幅并在延时后自动重启成功', async () => {
    vi.useFakeTimers();
    const host = buildHost();
    const onCrashTeardown = vi.fn();
    const logs: string[] = [];
    const controller = createCrashRecoveryController({
      host,
      t,
      variant: 'full',
      getCode: () => 'example : True := trivial',
      log: (m) => logs.push(m),
      setStatus: () => {},
      setProgress: () => {},
      onCrashTeardown,
      onStartSession: async () => true,
      cancelAutoStart: () => {},
      showLoadFailure: () => {},
      hideLoadFailure: () => {},
    });

    controller.handleCrash('worker died');
    expect(controller.isRecoveryPending()).toBe(true);
    expect(controller.getLastCrashMessage()).toBe('worker died');
    expect(host.querySelector<HTMLElement>('[data-role="crash"]')!.hidden).toBe(false);
    expect(onCrashTeardown).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1500);
    controller.onStartSucceeded();
    expect(controller.isRecoveryPending()).toBe(false);
    expect(host.querySelector<HTMLElement>('[data-role="crash"]')!.hidden).toBe(true);
    controller.dispose();
  });

  it('同代码重复崩溃关闭自动重启，交由用户手动重启或切换下载源重试', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const host = buildHost();
    const startMock = vi.fn(async () => false);
    const showLoadFailure = vi.fn();
    const controller = createCrashRecoveryController({
      host,
      t,
      variant: 'full',
      getCode: () => 'def loop := loop',
      log: () => {},
      setStatus: () => {},
      setProgress: () => {},
      onCrashTeardown: () => {},
      onStartSession: startMock,
      cancelAutoStart: () => {},
      showLoadFailure,
      hideLoadFailure: () => {},
    });

    // 启动失败走 loadFailure；若已在恢复态再失败则显示自动重启失败提示。
    controller.onStartFailed('network timeout', new Error('network timeout'));
    expect(showLoadFailure).toHaveBeenCalledWith('network timeout');

    controller.handleCrash('stack overflow');
    await vi.advanceTimersByTimeAsync(2500);
    // 同一份代码 60 秒内再次崩溃不再自动重启。
    controller.handleCrash('RuntimeError: memory access out of bounds');
    expect(controller.getLastCrashMessage()).toContain('RuntimeError');

    host.querySelector<HTMLButtonElement>('[data-role="retry-load"]')!.click();
    await Promise.resolve();
    expect(startMock).toHaveBeenCalledTimes(1);

    host.querySelector<HTMLButtonElement>('[data-source="mirror"]')!.click();
    await vi.advanceTimersByTimeAsync(10);
    expect(startMock).toHaveBeenCalledTimes(2);
    controller.dispose();
  });
});
