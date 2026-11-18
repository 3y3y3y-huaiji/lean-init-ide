import { describe, expect, it, vi } from 'vitest';
import {
  createWasm64Supervisor,
  type LeanProcess,
  type LeanProcessCallbacks,
  type LspMessage,
  type Wasm64SupervisorOptions,
} from './lean-wasm64-supervisor';

class FakeProcess implements LeanProcess {
  readonly sent: LspMessage[] = [];
  disposed = false;
  readonly ready: Promise<void>;
  constructor(
    readonly args: readonly string[],
    readonly callbacks: LeanProcessCallbacks,
    ready: Promise<void> = Promise.resolve(),
  ) {
    this.ready = ready;
  }
  send(message: LspMessage): void {
    this.sent.push(message);
  }
  dispose(): void {
    this.disposed = true;
  }
}

const harness = (readyFor?: (args: readonly string[]) => Promise<void>) => {
  const processes: FakeProcess[] = [];
  const factory = (args: readonly string[], callbacks: LeanProcessCallbacks): LeanProcess => {
    const process = new FakeProcess(args, callbacks, readyFor?.(args));
    processes.push(process);
    return process;
  };
  return { processes, factory };
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const connect = async (options?: Wasm64SupervisorOptions) => {
  const h = harness();
  const server = await createWasm64Supervisor(h.factory, options);
  const received: LspMessage[] = [];
  server.transport.reader.listen((message) => received.push(message as unknown as LspMessage));
  const send = async (message: LspMessage): Promise<void> => {
    await server.transport.writer.write(message as never);
    await flush();
  };
  return { ...h, server, received, send };
};

const URI = 'file:///workspace/Main.lean';
const openMessage = (text = 'example : 1 + 1 = 2 := rfl'): LspMessage => ({
  jsonrpc: '2.0',
  method: 'textDocument/didOpen',
  params: { textDocument: { uri: URI, languageId: 'lean4', version: 1, text } },
});

describe('createWasm64Supervisor', () => {
  it('启动时先起 bootstrap 进程，initialize 响应去掉 watchdog 能力后转交客户端并释放它', async () => {
    const { processes, send, received } = await connect();
    const bootstrap = processes[0]!;
    expect(bootstrap.args).toEqual(['-j2', '--server']);

    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    expect(bootstrap.sent[0]?.method).toBe('initialize');

    bootstrap.callbacks.onMessage({
      jsonrpc: '2.0',
      id: 1,
      result: {
        capabilities: { hoverProvider: true, referencesProvider: true, experimental: {} },
      },
    });
    expect(received[0]?.result?.capabilities).toEqual({ hoverProvider: true });
    expect(bootstrap.disposed).toBe(true);
  });

  it('didOpen 起 --worker 文件进程，先重放 initialize 再 didOpen，之后的请求直接转发', async () => {
    const { processes, send } = await connect();
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    processes[0]!.callbacks.onMessage({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } });

    await send(openMessage());
    const file = processes[1]!;
    expect(file.args).toEqual(['-j4', '--worker', URI]);
    expect(file.sent.map((m) => m.method)).toEqual(['initialize', 'textDocument/didOpen']);

    await send({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/hover',
      params: { textDocument: { uri: URI.toLowerCase().replace('main', 'main') } },
    });
    expect(file.sent.at(-1)?.method).toBe('textDocument/hover');
  });

  it('退出码 2 视为 FileWorker 请求重启：用最新文本重开进程', async () => {
    const { processes, send } = await connect();
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    processes[0]!.callbacks.onMessage({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } });
    await send(openMessage('import Init'));
    await send({
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri: URI, version: 2 },
        contentChanges: [{ text: 'import Init\nexample : True := trivial' }],
      },
    });

    processes[1]!.callbacks.onExit(2);
    await flush();

    expect(processes[1]!.disposed).toBe(true);
    const restarted = processes[2]!;
    expect(restarted.args).toEqual(['-j4', '--worker', URI]);
    const didOpen = restarted.sent.find((m) => m.method === 'textDocument/didOpen');
    expect(didOpen?.params?.textDocument).toMatchObject({
      text: 'import Init\nexample : True := trivial',
      version: 2,
    });
  });

  it('文件进程的 initialize 响应只是内部握手，不转发给客户端', async () => {
    const { processes, send, received } = await connect();
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    processes[0]!.callbacks.onMessage({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } });
    await send(openMessage());

    processes[1]!.callbacks.onMessage({
      jsonrpc: '2.0',
      id: 'lean-browser:init',
      result: { capabilities: { hoverProvider: true } },
    });

    expect(received.some((message) => message.id === 'lean-browser:init')).toBe(false);
  });

  it('文件进程 initialize 失败时上报终态错误，而不是静默丢弃', async () => {
    const onError = vi.fn();
    const { processes, send } = await connect({ onError });
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    processes[0]!.callbacks.onMessage({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } });
    await send(openMessage());

    processes[1]!.callbacks.onMessage({
      jsonrpc: '2.0',
      id: 'lean-browser:init',
      error: { code: -32603, message: 'bad params' },
    });

    expect(onError).toHaveBeenCalledWith('Lean document process failed to initialize: bad params');
  });

  it('服务端请求 ID 重写后，客户端响应与 $/cancelRequest 都映射回原始 ID', async () => {
    const { processes, send, received } = await connect();
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    processes[0]!.callbacks.onMessage({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } });
    await send(openMessage());
    const file = processes[1]!;

    file.callbacks.onMessage({
      jsonrpc: '2.0',
      id: 7,
      method: '$/lean/plainGoal',
      params: {},
    });
    const rewritten = received.find((message) => message.method === '$/lean/plainGoal');
    expect(rewritten?.id).toBe('lean-browser:1');

    await send({
      jsonrpc: '2.0',
      method: '$/cancelRequest',
      params: { id: 'lean-browser:1' },
    });
    expect(file.sent.at(-1)).toMatchObject({
      method: '$/cancelRequest',
      params: { id: 7 },
    });

    file.callbacks.onMessage({
      jsonrpc: '2.0',
      id: 8,
      method: '$/lean/plainGoal',
      params: {},
    });
    const second = received.filter((message) => message.method === '$/lean/plainGoal').at(-1);
    await send({ jsonrpc: '2.0', id: second!.id!, result: { goals: [] } });
    expect(file.sent.at(-1)).toMatchObject({ id: 8, result: { goals: [] } });
  });

  it('时间窗内反复以退出码 2 重启会判定为重启风暴并停止重开', async () => {
    const onError = vi.fn();
    const { processes, send } = await connect({
      onError,
      now: () => 0,
      maxRestarts: 2,
      restartWindowMs: 1000,
    });
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    processes[0]!.callbacks.onMessage({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } });
    await send(openMessage());

    processes[1]!.callbacks.onExit(2);
    await flush();
    expect(processes[2]?.args).toEqual(['-j4', '--worker', URI]);

    processes[2]!.callbacks.onExit(2);
    await flush();
    expect(processes[3]?.args).toEqual(['-j4', '--worker', URI]);

    processes[3]!.callbacks.onExit(2);
    await flush();

    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('restarted 2 times within 1s; giving up'),
    );
    expect(processes[3]!.disposed).toBe(true);
    expect(processes).toHaveLength(4);
  });

  it('运行足够久的正常重启不计入风暴，只有启动后立即退出才计数', async () => {
    const onError = vi.fn();
    let clock = 0;
    const { processes, send } = await connect({
      onError,
      now: () => clock,
      maxRestarts: 1,
      restartWindowMs: 60_000,
    });
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    processes[0]!.callbacks.onMessage({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } });
    await send(openMessage());

    // 运行 20s 后改 header：不计数。
    clock = 20_000;
    processes[1]!.callbacks.onExit(2);
    await flush();
    expect(processes[2]?.args).toEqual(['-j4', '--worker', URI]);
    expect(onError).not.toHaveBeenCalled();

    // 新进程立即退出：计数 1。
    processes[2]!.callbacks.onExit(2);
    await flush();
    expect(processes[3]?.args).toEqual(['-j4', '--worker', URI]);
    expect(onError).not.toHaveBeenCalled();

    // 再立即退出：超过 maxRestarts=1。
    processes[3]!.callbacks.onExit(2);
    await flush();
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('restarted 1 times within 60s; giving up'),
    );
  });

  it('超过 8 MiB UTF-8 的文档在创建进程前就被拒绝', async () => {
    const onError = vi.fn();
    const { processes, send } = await connect({ onError });
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    processes[0]!.callbacks.onMessage({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } });

    await send(openMessage('a'.repeat(8 * 1024 ** 2 + 1)));

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('8 MiB (UTF-8)'));
    expect(processes).toHaveLength(1);
  });

  it('非 2 的退出码是致命错误：上报并让未完成请求以错误结算', async () => {
    const onError = vi.fn();
    const { processes, send, received } = await connect({ onError });
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    processes[0]!.callbacks.onMessage({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } });
    await send(openMessage());
    await send({
      jsonrpc: '2.0',
      id: 7,
      method: 'textDocument/hover',
      params: { textDocument: { uri: URI } },
    });

    processes[1]!.callbacks.onExit(139);

    expect(onError).toHaveBeenCalledWith('Lean document process exited with code 139.');
    const settled = received.find((m) => m.id === 7);
    expect(settled?.error?.code).toBe(-32801);
  });

  it('需要原生 watchdog 的请求直接返回 -32601', async () => {
    const { send, received } = await connect();
    await send({ jsonrpc: '2.0', id: 3, method: 'workspace/symbol', params: {} });
    expect(received.find((m) => m.id === 3)?.error?.code).toBe(-32601);
  });

  it('didClose 释放文件进程并取消未完成请求', async () => {
    const { processes, send, received } = await connect();
    await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { rootUri: null } });
    processes[0]!.callbacks.onMessage({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } });
    await send(openMessage());
    await send({
      jsonrpc: '2.0',
      id: 5,
      method: 'textDocument/hover',
      params: { textDocument: { uri: URI } },
    });
    await send({
      jsonrpc: '2.0',
      method: 'textDocument/didClose',
      params: { textDocument: { uri: URI } },
    });

    expect(processes[1]!.disposed).toBe(true);
    expect(received.find((m) => m.id === 5)?.error?.message).toBe('Lean document was closed.');
  });

  it('bootstrap 起不来时 create 抛错并释放资源', async () => {
    const h = harness(() => Promise.reject(new Error('boom')));
    await expect(createWasm64Supervisor(h.factory)).rejects.toThrow('boom');
    expect(h.processes[0]?.disposed).toBe(true);
  });

  it('dispose 之后写入被拒绝，close 事件只触发一次', async () => {
    const { server } = await connect();
    const onClose = vi.fn();
    server.transport.reader.onClose(onClose);
    server.dispose();
    server.dispose();
    expect(onClose).toHaveBeenCalledTimes(1);
    await expect(
      server.transport.writer.write({ jsonrpc: '2.0', method: 'x' } as never),
    ).rejects.toThrow('closed');
  });
});
