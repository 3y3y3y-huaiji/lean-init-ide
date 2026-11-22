import { afterEach, describe, expect, it, vi } from 'vitest';
import { zh } from '../../i18n/zh';
import type { CrashRecoveryController } from './crash-recovery';
import type { DiagnosticsView } from './diagnostics-view';
import { createSessionController } from './session-controller';
import type { SwBridge } from './sw-bridge';

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

const createFakeTransport = () => {
  let listener: ((msg: unknown) => void) | undefined;
  const written: unknown[] = [];
  return {
    written,
    server: {
      transport: {
        reader: {
          onClose: () => ({ dispose: () => {} }),
          onError: () => ({ dispose: () => {} }),
          onPartialMessage: () => ({ dispose: () => {} }),
          listen: (cb: (msg: unknown) => void) => {
            listener = cb;
            return { dispose: () => {} };
          },
          dispose: () => {},
        },
        writer: {
          onClose: () => ({ dispose: () => {} }),
          onError: () => ({ dispose: () => {} }),
          write: async (msg: Record<string, unknown>) => {
            written.push(msg);
            if (msg.method === 'initialize') {
              listener?.({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } });
            }
          },
          end: () => {},
          dispose: () => {},
        },
      },
      dispose: vi.fn(),
    },
  };
};

describe('createSessionController', () => {
  const t = zh.playground;
  const originalSharedArrayBuffer = globalThis.SharedArrayBuffer;

  afterEach(() => {
    vi.useRealTimers();
    if (originalSharedArrayBuffer) {
      (globalThis as Record<string, unknown>).SharedArrayBuffer = originalSharedArrayBuffer;
    } else {
      delete (globalThis as Record<string, unknown>).SharedArrayBuffer;
    }
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, configurable: true });
  });

  const makeHarness = (crossOriginIsolated = true) => {
    Object.defineProperty(globalThis, 'crossOriginIsolated', {
      value: crossOriginIsolated,
      configurable: true,
    });
    if (crossOriginIsolated && typeof SharedArrayBuffer === 'undefined') {
      (globalThis as Record<string, unknown>).SharedArrayBuffer = class {};
    }
    const startEl = document.createElement('button');
    const statementEl = document.createElement('div');
    const logs: string[] = [];
    const statuses: string[] = [];
    let code = 'example : True := trivial';
    const transport = createFakeTransport();
    let onMemoryBytesCb: ((b: number) => void) | undefined;
    let onStatusCb: ((s: { state: string; message?: string }) => void) | undefined;

    const crashRecovery = {
      isRecoveryPending: () => false,
      getLastCrashAt: () => 0,
      getLastCrashMessage: () => '',
      clearCrashedCode: vi.fn(),
      handleCrash: vi.fn(),
      onStartSucceeded: vi.fn(),
      onStartFailed: vi.fn(),
      cancelAutoRecover: vi.fn(),
      reset: vi.fn(),
      prepareManualRestart: vi.fn(),
      dispose: vi.fn(),
    } as unknown as CrashRecoveryController;

    const diagnosticsView = {
      renderDiagnostics: vi.fn(),
      handleFileProgress: vi.fn(),
      onContentChanged: vi.fn(),
      showLoadFailure: vi.fn(),
      hideLoadFailure: vi.fn(),
      handleCrashDiagnostics: vi.fn(),
      resetRunOk: vi.fn(),
      resetForStart: vi.fn(),
      resetForStop: vi.fn(),
      skipRunBarrier: vi.fn(),
      isFileProcessing: () => false,
      dispose: vi.fn(),
    } as unknown as DiagnosticsView;

    const swBridge = {
      resetProgressState: vi.fn(),
      hasAssetProgress: () => false,
      getLastAssetFallback: () => null,
      clearLastAssetFallback: vi.fn(),
      dispose: vi.fn(),
    } as unknown as SwBridge;

    const controller = createSessionController({
      t,
      memoryTier: 'standard',
      startEl,
      statementEl,
      getCode: () => code,
      setCodeSilently: (next) => {
        code = next;
      },
      log: (m) => logs.push(m),
      setStatus: (s) => statuses.push(s),
      setProgress: vi.fn(),
      setGoalText: vi.fn(),
      getSelectedArch: () => 'wasm32',
      getActiveExtensions: () => [],
      getExtensionPacks: () => ({}),
      persistSession: vi.fn(),
      restoreSavedExtensions: async () => {},
      drainExtensionSelections: async () => {},
      swBridge,
      diagnosticsView,
      getCrashRecovery: () => crashRecovery,
      onBumpGoalSeq: vi.fn(),
      onResetGoalSupport: vi.fn(),
      onScheduleGoal: vi.fn(),
      onUpdateStatement: vi.fn(),
      createConnection: () =>
        ({
          listen: vi.fn(),
          onNotification: vi.fn(),
          onRequest: vi.fn(),
          sendNotification: vi.fn(),
          sendRequest: vi.fn(async () => ({})),
          dispose: vi.fn(),
        }) as never,
      createRuntime: async (opts) => {
        onMemoryBytesCb = opts.onMemoryBytes;
        onStatusCb = opts.onStatus;
        opts.onStatus({ state: 'loading' });
        opts.onStatus({ state: 'ready' });
        return {
          arch: opts.arch,
          server: transport.server as never,
          sampleMemoryBytes: async () => 500_000_000,
        };
      },
    });

    return {
      controller,
      crashRecovery,
      diagnosticsView,
      logs,
      statuses,
      setCodeValue: (v: string) => {
        code = v;
      },
      emitMemory: (b: number) => onMemoryBytesCb?.(b),
      emitErrorStatus: (msg: string) => onStatusCb?.({ state: 'error', message: msg }),
    };
  };

  it('不支持跨源隔离时直接展示兼容性错误并拒绝 run', async () => {
    const { controller, diagnosticsView } = makeHarness(false);
    expect(await controller.start()).toBe(false);
    expect(diagnosticsView.showLoadFailure).toHaveBeenCalledWith(t.compatibilityError, true);
    await expect(controller.run('example : True := trivial')).rejects.toThrow(t.compatibilityError);
    controller.dispose();
  });

  it('启动后响应 L1 内存预警、import 变更触发高水位回收、崩溃与手动重启', async () => {
    const h = makeHarness(true);
    expect(await h.controller.start()).toBe(true);
    expect(h.controller.isReady()).toBe(true);

    // wasm32 1 GiB 上限 -> L1 60% = 644 MB 触发预警日志；L2 72% 后改 import 触发平滑重建。
    h.emitMemory(650 * 1024 * 1024);
    expect(h.logs.some((m) => m.includes('650 / 1024 MB'))).toBe(true);

    h.setCodeValue('import Std\nexample : True := trivial');
    h.emitMemory(750 * 1024 * 1024);
    vi.useFakeTimers();
    h.controller.onContentChange();
    await vi.advanceTimersByTimeAsync(350);
    await flush();
    expect(h.logs.some((m) => m.includes('import'))).toBe(true);
    vi.useRealTimers();

    // 已就绪后再收到 error 状态交由 crashRecovery。
    h.emitErrorStatus('oom');
    expect(h.crashRecovery.handleCrash).toHaveBeenCalledWith('oom');

    h.controller.stop();
    expect(h.controller.isReady()).toBe(false);
    h.controller.dispose();
  });
});
