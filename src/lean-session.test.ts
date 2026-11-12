import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageConnection } from 'vscode-jsonrpc/browser';
import {
  LeanSession,
  type LeanSessionOptions,
  type LeanSessionServer,
  type LspDiagnostic,
} from './lean-session';

type DiagnosticParams = { uri: string; version?: number; diagnostics: LspDiagnostic[] };

const diagnostic = (message: string): LspDiagnostic => ({
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  },
  message,
});

const makeHarness = (overrides: Partial<LeanSessionOptions> = {}) => {
  let publishDiagnostics: ((params: DiagnosticParams) => void) | undefined;
  const notifications: Array<{ method: string; params: unknown }> = [];
  const documentSymbolResolvers: Array<() => void> = [];
  const handlers: string[] = [];
  const connection = {
    onNotification: vi.fn((method: string, handler: (params: DiagnosticParams) => void) => {
      handlers.push(method);
      if (method === 'textDocument/publishDiagnostics') publishDiagnostics = handler;
      return { dispose: vi.fn() };
    }),
    onRequest: vi.fn((method: string) => {
      handlers.push(method);
      return { dispose: vi.fn() };
    }),
    sendNotification: vi.fn((method: string, params: unknown) => {
      notifications.push({ method, params });
    }),
    sendRequest: vi.fn((method: string) => {
      if (method === 'initialize') return Promise.resolve({});
      if (method === 'textDocument/documentSymbol') {
        return new Promise((resolve) => {
          documentSymbolResolvers.push(() => resolve([]));
        });
      }
      return Promise.resolve(null);
    }),
    listen: vi.fn(),
    dispose: vi.fn(),
  };
  const server: LeanSessionServer = {
    transport: {
      reader: {} as LeanSessionServer['transport']['reader'],
      writer: {} as LeanSessionServer['transport']['writer'],
    },
    dispose: vi.fn(),
  };
  const states: string[] = [];
  const createServer = vi.fn(async () => server);
  const session = new LeanSession({
    createServer,
    createConnection: () => connection as unknown as MessageConnection,
    onDiagnostics: vi.fn(),
    onLog: vi.fn(),
    onStateChange: (state) => states.push(state),
    readyTimeoutMs: 1000,
    diagnosticTimeoutMs: 1000,
    reopenDelayMs: 300,
    ...overrides,
  });

  return {
    session,
    server,
    createServer,
    connection,
    states,
    handlers,
    publish: (params: DiagnosticParams) => publishDiagnostics?.(params),
    completeRun: () => documentSymbolResolvers.shift()?.(),
    sent: (method: string) =>
      connection.sendNotification.mock.calls.filter(([name]) => name === method),
  };
};

describe('LeanSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('启动时完成 LSP 握手、注册处理器并打开文档', async () => {
    const h = makeHarness();

    await h.session.start('#check Nat');

    expect(h.states).toEqual(['starting', 'ready']);
    expect(h.session.isReady).toBe(true);
    expect(h.connection.listen).toHaveBeenCalledOnce();
    expect(h.handlers).toEqual(
      expect.arrayContaining([
        'textDocument/publishDiagnostics',
        'window/logMessage',
        'window/workDoneProgress/create',
        'client/registerCapability',
        'workspace/configuration',
        'workspace/workspaceFolders',
      ]),
    );
    expect(h.connection.sendRequest).toHaveBeenCalledWith(
      'initialize',
      expect.objectContaining({ rootUri: 'file:///workspace' }),
    );
    expect(h.sent('initialized')).toHaveLength(1);
    expect(h.sent('textDocument/didOpen')[0]?.[1]).toMatchObject({
      textDocument: { languageId: 'lean4', version: 1, text: '#check Nat' },
    });
  });

  it('并发启动复用同一次初始化，停止时释放连接与 Worker', async () => {
    const h = makeHarness();

    await Promise.all([h.session.start('one'), h.session.start('two')]);
    h.session.stop();

    expect(
      h.connection.sendRequest.mock.calls.filter(([name]) => name === 'initialize'),
    ).toHaveLength(1);
    expect(h.sent('textDocument/didOpen')).toHaveLength(1);
    expect(h.connection.dispose).toHaveBeenCalledOnce();
    expect(h.server.dispose).toHaveBeenCalledOnce();
    expect(h.session.isReady).toBe(false);
    expect(h.states.at(-1)).toBe('idle');
  });

  it('启动途中停止会释放晚到的 Worker，不再继续握手', async () => {
    const h = makeHarness();
    let finishServer!: () => void;
    h.createServer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishServer = () => resolve(h.server);
        }),
    );

    const starting = h.session.start('one');
    h.session.stop();
    finishServer();

    await expect(starting).rejects.toThrow('Lean session stopped');
    expect(h.server.dispose).toHaveBeenCalledOnce();
    expect(h.connection.listen).not.toHaveBeenCalled();
    expect(h.states).toEqual(['starting', 'idle']);
  });

  it('启动失败后进入 error 并释放已创建的资源', async () => {
    const h = makeHarness();
    h.connection.sendRequest.mockRejectedValueOnce(new Error('initialize failed'));

    await expect(h.session.start('bad')).rejects.toThrow('initialize failed');

    expect(h.states).toEqual(['starting', 'error']);
    expect(h.connection.dispose).toHaveBeenCalledOnce();
    expect(h.server.dispose).toHaveBeenCalledOnce();
    expect(h.sent('textDocument/didOpen')).toHaveLength(0);
  });

  it('未就绪请求返回 null，就绪后转发 RPC，文档修改递增版本', async () => {
    const h = makeHarness();

    await expect(h.session.request('textDocument/hover', {})).resolves.toBeNull();
    await h.session.start('one');
    h.connection.sendRequest.mockResolvedValueOnce({ contents: 'Nat' });
    await expect(h.session.request('textDocument/hover', {})).resolves.toEqual({
      contents: 'Nat',
    });

    h.session.change('two');
    h.session.change('three');

    expect(h.sent('textDocument/didChange').map(([, params]) => params)).toEqual([
      {
        textDocument: { uri: 'file:///workspace/Main.lean', version: 2 },
        contentChanges: [{ text: 'two' }],
      },
      {
        textDocument: { uri: 'file:///workspace/Main.lean', version: 3 },
        contentChanges: [{ text: 'three' }],
      },
    ]);
  });

  it('whenReady 未启动立即返回 false，启动中等到握手完成', async () => {
    const h = makeHarness();
    await expect(h.session.whenReady()).resolves.toBe(false);

    let finishServer!: () => void;
    h.createServer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishServer = () => resolve(h.server);
        }),
    );

    const starting = h.session.start('one');
    const waiting = h.session.whenReady();
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    finishServer();
    await starting;
    await expect(waiting).resolves.toBe(true);
  });

  it('run 在启动期间等待就绪，复用文档进程并返回匹配版本的诊断', async () => {
    const h = makeHarness();
    const sync = vi.fn();

    const running = h.session.run('#eval 1 + 1', sync);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.sent('textDocument/didClose')).toHaveLength(0);

    await h.session.start('initial');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sent('textDocument/didClose')).toHaveLength(0);
    expect(sync).toHaveBeenCalledOnce();
    expect(h.sent('textDocument/didChange').at(-1)?.[1]).toMatchObject({
      textDocument: { version: 2 },
      contentChanges: [{ text: '#eval 1 + 1' }],
    });

    const list = [diagnostic('2')];
    h.publish({ uri: 'file:///workspace/Main.lean', version: 2, diagnostics: list });
    h.completeRun();

    await expect(running).resolves.toEqual(list);
  });

  it('documentSymbol 之后等待静默窗口，接住迟到的 #check 诊断', async () => {
    const h = makeHarness({ diagnosticSettleMs: 300 });
    await h.session.start('initial');
    const running = h.session.run('#check Nat.add', vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    h.publish({ uri: 'file:///workspace/Main.lean', version: 2, diagnostics: [] });
    h.completeRun();
    await vi.advanceTimersByTimeAsync(100);
    const list = [diagnostic('Nat.add : Nat → Nat → Nat')];
    h.publish({ uri: 'file:///workspace/Main.lean', version: 2, diagnostics: list });

    await vi.advanceTimersByTimeAsync(400);
    await expect(running).resolves.toEqual(list);
  });

  it('复用文档期间的空诊断和渐进诊断不会提前结束 run', async () => {
    const h = makeHarness();
    await h.session.start('initial');

    const received = vi.fn();
    const running = h.session.run('#check Nat.add\n#eval 2 + 3', vi.fn());
    void running.then(received);
    await vi.advanceTimersByTimeAsync(0);
    h.publish({ uri: 'file:///workspace/Main.lean', version: 2, diagnostics: [] });

    expect(h.sent('textDocument/didOpen')).toHaveLength(1);
    expect(h.sent('textDocument/didChange')).toHaveLength(1);
    const list = [diagnostic('Nat.add : Nat → Nat → Nat'), diagnostic('5')];
    h.publish({ uri: 'file:///workspace/Main.lean', version: 2, diagnostics: [] });
    h.publish({ uri: 'file:///workspace/Main.lean', version: 2, diagnostics: [list[0]!] });
    h.publish({ uri: 'file:///workspace/Main.lean', version: 2, diagnostics: list });
    await vi.advanceTimersByTimeAsync(0);
    expect(received).not.toHaveBeenCalled();

    h.completeRun();
    await expect(running).resolves.toEqual(list);
  });

  it('无诊断代码也等待处理完成屏障，而不是提前或超时返回', async () => {
    const h = makeHarness();
    await h.session.start('initial');

    const received = vi.fn();
    const running = h.session.run('def answer := 42', vi.fn());
    void running.then(received);
    await vi.advanceTimersByTimeAsync(0);
    h.publish({ uri: 'file:///workspace/Main.lean', version: 2, diagnostics: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(received).not.toHaveBeenCalled();

    h.completeRun();
    await expect(running).resolves.toEqual([]);
  });

  it('run 按调用顺序串行执行，不互相覆盖诊断等待者', async () => {
    const h = makeHarness();
    await h.session.start('initial');
    const firstSync = vi.fn();
    const secondSync = vi.fn();

    const first = h.session.run('first', firstSync);
    const second = h.session.run('second', secondSync);
    await vi.advanceTimersByTimeAsync(0);

    expect(h.sent('textDocument/didClose')).toHaveLength(0);
    expect(firstSync).toHaveBeenCalledOnce();
    h.publish({
      uri: 'file:///workspace/Main.lean',
      version: 2,
      diagnostics: [diagnostic('first result')],
    });
    h.completeRun();
    await expect(first).resolves.toEqual([diagnostic('first result')]);

    await vi.advanceTimersByTimeAsync(0);
    expect(h.sent('textDocument/didClose')).toHaveLength(0);
    expect(secondSync).toHaveBeenCalledOnce();
    expect(h.sent('textDocument/didChange').at(-1)?.[1]).toMatchObject({
      textDocument: { version: 3 },
      contentChanges: [{ text: 'second' }],
    });
    h.publish({
      uri: 'file:///workspace/Main.lean',
      version: 3,
      diagnostics: [diagnostic('second result')],
    });
    h.completeRun();

    await expect(second).resolves.toEqual([diagnostic('second result')]);
  });

  it('同一份代码再次 run 直接复用上次诊断，不再请求 Lean', async () => {
    const h = makeHarness();
    await h.session.start('initial');
    const first = h.session.run('def answer := 42', vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    h.publish({ uri: 'file:///workspace/Main.lean', version: 2, diagnostics: [] });
    h.completeRun();
    await expect(first).resolves.toEqual([]);

    const sync = vi.fn();
    const second = h.session.run('def answer := 42', sync);
    await expect(second).resolves.toEqual([]);
    expect(sync).toHaveBeenCalledOnce();
    expect(h.sent('textDocument/didChange')).toHaveLength(1);
    expect(
      h.connection.sendRequest.mock.calls.filter(
        ([name]) => name === 'textDocument/documentSymbol',
      ),
    ).toHaveLength(1);
  });

  it('import 变化时重开文档，让 Lean 重建进程', async () => {
    const h = makeHarness();
    const sync = vi.fn();
    await h.session.start('initial');

    const running = h.session.run('import Init.Data.List\n#check List', sync);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sent('textDocument/didClose')).toHaveLength(1);
    expect(sync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(h.sent('textDocument/didOpen').at(-1)?.[1]).toMatchObject({
      textDocument: { version: 2, text: 'import Init.Data.List\n#check List' },
    });
    expect(sync).toHaveBeenCalledOnce();

    const list = [diagnostic('List : Type u → Type u')];
    h.publish({ uri: 'file:///workspace/Main.lean', version: 2, diagnostics: list });
    h.completeRun();
    await expect(running).resolves.toEqual(list);
  });

  it('忽略旧版本文档的迟到诊断', async () => {
    const h = makeHarness();
    await h.session.start('initial');
    const running = h.session.run('new code', vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    h.publish({
      uri: 'file:///workspace/Main.lean',
      version: 1,
      diagnostics: [diagnostic('stale')],
    });
    h.completeRun();

    await expect(running).resolves.toEqual([]);
  });

  it('忽略其他文档的诊断，等待就绪与等待诊断超时都返回空数组', async () => {
    const h = makeHarness();
    const sync = vi.fn();

    const waiting = h.session.run('never ready', sync);
    await vi.advanceTimersByTimeAsync(1001);
    await expect(waiting).resolves.toEqual([]);

    await h.session.start('initial');
    const running = h.session.run('no diagnostics', sync);
    await vi.advanceTimersByTimeAsync(0);
    h.publish({
      uri: 'file:///workspace/Other.lean',
      version: 2,
      diagnostics: [diagnostic('other')],
    });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(running).resolves.toEqual([]);
    expect(sync).toHaveBeenCalledOnce();
  });

  it('停止会结束等待中的 run，延迟重开不会写入已停止的连接', async () => {
    const h = makeHarness();
    await h.session.start('initial');

    const running = h.session.run('stop me', vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    h.session.stop();
    await expect(running).resolves.toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(h.sent('textDocument/didOpen')).toHaveLength(1);
  });
});
