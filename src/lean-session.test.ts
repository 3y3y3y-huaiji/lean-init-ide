import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageConnection } from 'vscode-jsonrpc/browser';
import { LeanSession, type LeanSessionServer, type LspDiagnostic } from './lean-session';

type DiagnosticParams = { uri: string; diagnostics: LspDiagnostic[] };

const diagnostic = (message: string): LspDiagnostic => ({
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  },
  message,
});

const makeHarness = () => {
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

  it('run 在启动期间等待就绪，重开文档后返回匹配 URI 的诊断', async () => {
    const h = makeHarness();
    const sync = vi.fn();

    const running = h.session.run('#eval 1 + 1', sync);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.sent('textDocument/didClose')).toHaveLength(0);

    await h.session.start('initial');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sent('textDocument/didClose')).toHaveLength(1);
    expect(sync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(h.sent('textDocument/didOpen').at(-1)?.[1]).toMatchObject({
      textDocument: { version: 2, text: '#eval 1 + 1' },
    });
    expect(sync).toHaveBeenCalledOnce();

    const list = [diagnostic('2')];
    h.publish({ uri: 'file:///workspace/Main.lean', diagnostics: list });
    h.completeRun();

    await expect(running).resolves.toEqual(list);
  });

  it('重开期间的空诊断和渐进诊断不会提前结束 run', async () => {
    const h = makeHarness();
    await h.session.start('initial');

    const received = vi.fn();
    const running = h.session.run('#check Nat.add\n#eval 2 + 3', vi.fn());
    void running.then(received);
    await vi.advanceTimersByTimeAsync(0);
    h.publish({ uri: 'file:///workspace/Main.lean', diagnostics: [] });
    await vi.advanceTimersByTimeAsync(300);

    expect(h.sent('textDocument/didOpen')).toHaveLength(2);
    const list = [diagnostic('Nat.add : Nat → Nat → Nat'), diagnostic('5')];
    h.publish({ uri: 'file:///workspace/Main.lean', diagnostics: [] });
    h.publish({ uri: 'file:///workspace/Main.lean', diagnostics: [list[0]!] });
    h.publish({ uri: 'file:///workspace/Main.lean', diagnostics: list });
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
    await vi.advanceTimersByTimeAsync(300);
    h.publish({ uri: 'file:///workspace/Main.lean', diagnostics: [] });
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

    expect(h.sent('textDocument/didClose')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(300);
    h.publish({ uri: 'file:///workspace/Main.lean', diagnostics: [diagnostic('first result')] });
    h.completeRun();
    await expect(first).resolves.toEqual([diagnostic('first result')]);

    await vi.advanceTimersByTimeAsync(0);
    expect(h.sent('textDocument/didClose')).toHaveLength(2);
    expect(secondSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(secondSync).toHaveBeenCalledOnce();
    h.publish({ uri: 'file:///workspace/Main.lean', diagnostics: [diagnostic('second result')] });
    h.completeRun();

    await expect(second).resolves.toEqual([diagnostic('second result')]);
  });

  it('忽略其他文档的诊断，等待就绪与等待诊断超时都返回空数组', async () => {
    const h = makeHarness();
    const sync = vi.fn();

    const waiting = h.session.run('never ready', sync);
    await vi.advanceTimersByTimeAsync(1001);
    await expect(waiting).resolves.toEqual([]);

    await h.session.start('initial');
    const running = h.session.run('no diagnostics', sync);
    await vi.advanceTimersByTimeAsync(300);
    h.publish({ uri: 'file:///workspace/Other.lean', diagnostics: [diagnostic('other')] });
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
