import type { getLean4LanguageServer } from '@wasm-idle/lsp/lean4';
import type { MessageConnection } from 'vscode-jsonrpc/browser';

export type LeanSessionServer = Awaited<ReturnType<typeof getLean4LanguageServer>>;
export type LeanSessionState = 'idle' | 'starting' | 'ready' | 'error';

export type LspDiagnostic = {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number;
  message: string;
  source?: string;
};

export type LeanSessionOptions = {
  createServer: () => Promise<LeanSessionServer>;
  createConnection: (server: LeanSessionServer) => MessageConnection;
  uri?: string;
  languageId?: string;
  onDiagnostics?: (params: { uri: string; diagnostics: LspDiagnostic[] }) => void;
  onLog?: (message: string) => void;
  onStateChange?: (state: LeanSessionState) => void;
  readyTimeoutMs?: number;
  diagnosticTimeoutMs?: number;
  reopenDelayMs?: number;
  /**
   * documentSymbol 返回后再等多久没有新诊断才结算（毫秒）。默认 0 表示立刻结算。
   * Lean 的 #check 信息可能比 documentSymbol 晚几十毫秒到达，留一个小窗口避免丢输出。
   */
  diagnosticSettleMs?: number;
};

type ActiveRun = {
  resolve: (diagnostics: LspDiagnostic[]) => void;
  timer: number | undefined;
  /** 静默等待定时器，结算时清理。 */
  quietTimer: number | undefined;
  /** 最近一次收到该文档诊断的时间，用于判断静默。 */
  lastPublishAt: number;
  opened: boolean;
  diagnostics: LspDiagnostic[];
};

type ReadyWaiter = {
  resolve: (ready: boolean) => void;
  timer: number;
};

/**
 * Lean Worker 与 JSON-RPC 的所有权边界。Monaco 只通过这里访问语言服务器，
 * 因而启动竞态、文档版本和 run 的诊断等待可以不依赖 DOM 单独测试。
 */
export class LeanSession {
  private connection: MessageConnection | null = null;
  private server: LeanSessionServer | null = null;
  private startPromise: Promise<void> | null = null;
  private stateValue: LeanSessionState = 'idle';
  private version = 1;
  private generation = 0;
  private activeRun: ActiveRun | null = null;
  private runTail: Promise<void> = Promise.resolve();
  private readonly readyWaiters = new Set<ReadyWaiter>();
  private readonly uri: string;
  private readonly languageId: string;
  private readonly readyTimeoutMs: number;
  private readonly diagnosticTimeoutMs: number;
  private readonly reopenDelayMs: number;
  private readonly diagnosticSettleMs: number;

  constructor(private readonly options: LeanSessionOptions) {
    this.uri = options.uri ?? 'file:///workspace/Main.lean';
    this.languageId = options.languageId ?? 'lean4';
    this.readyTimeoutMs = options.readyTimeoutMs ?? 180_000;
    this.diagnosticTimeoutMs = options.diagnosticTimeoutMs ?? 25_000;
    this.reopenDelayMs = options.reopenDelayMs ?? 300;
    this.diagnosticSettleMs = options.diagnosticSettleMs ?? 0;
  }

  get state(): LeanSessionState {
    return this.stateValue;
  }

  get isReady(): boolean {
    return this.stateValue === 'ready' && this.connection !== null;
  }

  async start(code: string): Promise<void> {
    if (this.isReady) return;
    if (this.startPromise) return this.startPromise;

    const generation = this.generation;
    const starting = this.initialize(code, generation);
    this.startPromise = starting;
    try {
      await starting;
    } finally {
      if (this.startPromise === starting) this.startPromise = null;
    }
  }

  stop(): void {
    this.generation += 1;
    this.releaseResources();
    this.settleRun([]);
    this.setState('idle');
  }

  async request<T>(method: string, params: unknown): Promise<T | null> {
    if (!this.isReady || !this.connection) return null;
    return this.connection.sendRequest<T>(method, params);
  }

  /**
   * 等待会话可用：启动中则等到握手结束，未启动或已失败立即返回 false。
   * 补全/悬停可能在运行时就绪后、LSP 初始化完成前被触发，需要这个窗口。
   */
  whenReady(): Promise<boolean> {
    if (this.isReady) return Promise.resolve(true);
    if (this.stateValue !== 'starting') return Promise.resolve(false);
    return this.waitForReady();
  }

  change(code: string): void {
    if (!this.isReady || !this.connection) return;
    this.version += 1;
    this.connection.sendNotification('textDocument/didChange', {
      textDocument: { uri: this.uri, version: this.version },
      contentChanges: [{ text: code }],
    });
  }

  /** didClose/didOpen 是一个事务；串行排队避免并发 run 抢走彼此的诊断。 */
  run(code: string, syncEditor: () => void): Promise<LspDiagnostic[]> {
    const generation = this.generation;
    const result = this.runTail.then(() =>
      generation === this.generation ? this.runWhenReady(code, syncEditor, generation) : [],
    );
    this.runTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async initialize(code: string, generation: number): Promise<void> {
    this.setState('starting');
    try {
      const server = await this.options.createServer();
      if (generation !== this.generation) {
        server.dispose();
        throw new Error('Lean session stopped');
      }
      this.server = server;
      const connection = this.options.createConnection(server);
      this.connection = connection;

      connection.onNotification(
        'textDocument/publishDiagnostics',
        (params: { uri: string; diagnostics: LspDiagnostic[] }) => {
          if (params.uri.toLowerCase() === this.uri.toLowerCase() && this.activeRun?.opened) {
            this.activeRun.diagnostics = params.diagnostics;
            this.activeRun.lastPublishAt = Date.now();
          }
          this.options.onDiagnostics?.(params);
        },
      );
      connection.onNotification('window/logMessage', (params: { message: string }) =>
        this.options.onLog?.(`server: ${params.message}`),
      );
      connection.onRequest('window/workDoneProgress/create', () => null);
      connection.onRequest('client/registerCapability', () => null);
      connection.onRequest('workspace/configuration', (params: { items: unknown[] }) =>
        (params.items ?? []).map(() => null),
      );
      connection.onRequest('workspace/workspaceFolders', () => [
        { uri: 'file:///workspace', name: 'workspace' },
      ]);
      connection.listen();

      await connection.sendRequest('initialize', {
        processId: null,
        clientInfo: { name: 'lean-init-ide', version: '0.1.0' },
        rootUri: 'file:///workspace',
        rootPath: '/workspace',
        workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
        capabilities: {
          workspace: { workspaceFolders: true },
          textDocument: {
            synchronization: { dynamicRegistration: false, didSave: false },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            completion: { completionItem: { snippetSupport: true } },
            definition: {},
            publishDiagnostics: { relatedInformation: true },
          },
        },
      });
      if (generation !== this.generation || this.connection !== connection) {
        throw new Error('Lean session stopped');
      }
      connection.sendNotification('initialized', {});
      // didOpen 先于 ready 发出：isReady 为真时文档一定已经打开，补全不会打到空文档。
      connection.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri: this.uri,
          languageId: this.languageId,
          version: this.version,
          text: code,
        },
      });
      this.setState('ready');
    } catch (error) {
      if (generation === this.generation) {
        this.releaseResources();
        this.setState('error');
      }
      throw error;
    }
  }

  private async runWhenReady(
    code: string,
    syncEditor: () => void,
    generation: number,
  ): Promise<LspDiagnostic[]> {
    const ready = await this.waitForReady();
    if (!ready || generation !== this.generation || !this.connection) return [];

    this.options.onLog?.(`[run] 开始，长度 ${code.length}`);
    return new Promise<LspDiagnostic[]>((resolve) => {
      const active: ActiveRun = {
        resolve,
        timer: undefined,
        quietTimer: undefined,
        lastPublishAt: Date.now(),
        opened: false,
        diagnostics: [],
      };
      this.activeRun = active;
      active.timer = window.setTimeout(() => this.settleRun([], active), this.diagnosticTimeoutMs);

      const connection = this.connection!;
      connection.sendNotification('textDocument/didClose', { textDocument: { uri: this.uri } });
      window.setTimeout(() => {
        if (
          this.activeRun !== active ||
          generation !== this.generation ||
          !this.isReady ||
          !this.connection
        ) {
          return;
        }
        this.version += 1;
        active.opened = true;
        this.connection.sendNotification('textDocument/didOpen', {
          textDocument: {
            uri: this.uri,
            languageId: this.languageId,
            version: this.version,
            text: code,
          },
        });
        syncEditor();
        // Lean 会渐进发布诊断；documentSymbol 作为处理屏障，随后再留一个静默窗口，
        // 避免 #check 这类比屏障晚几十毫秒到达的信息被丢掉。
        void connection
          .sendRequest('textDocument/documentSymbol', { textDocument: { uri: this.uri } })
          .then(
            () => this.settleAfterQuiet(active),
            (error: unknown) => {
              this.options.onLog?.(
                `[run] documentSymbol 失败：${error instanceof Error ? error.message : String(error)}`,
              );
              this.settleRun(active.diagnostics, active);
            },
          );
      }, this.reopenDelayMs);
    });
  }

  /**
   * documentSymbol 之后再等一小段静默时间：Lean 的 #check 信息可能晚于屏障到达。
   * 期间只要有新诊断就重新计时，最长不超过 1 秒，避免慢机器上无限等待。
   */
  private settleAfterQuiet(active: ActiveRun): void {
    const quietMs = this.diagnosticSettleMs;
    if (quietMs <= 0) {
      this.settleRun(active.diagnostics, active);
      return;
    }

    active.lastPublishAt = Date.now();
    const deadline = Date.now() + Math.max(quietMs * 4, 1000);
    const tick = () => {
      if (this.activeRun !== active) return;
      const now = Date.now();
      if (now - active.lastPublishAt >= quietMs || now >= deadline) {
        this.settleRun(active.diagnostics, active);
        return;
      }
      active.quietTimer = window.setTimeout(tick, 50);
    };
    tick();
  }

  private waitForReady(): Promise<boolean> {
    if (this.isReady) return Promise.resolve(true);
    if (this.stateValue === 'error') return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      const waiter: ReadyWaiter = {
        resolve,
        timer: window.setTimeout(() => {
          this.readyWaiters.delete(waiter);
          resolve(false);
        }, this.readyTimeoutMs),
      };
      this.readyWaiters.add(waiter);
    });
  }

  private settleRun(diagnostics: LspDiagnostic[], expected?: ActiveRun): void {
    const active = this.activeRun;
    if (!active || (expected && active !== expected)) return;
    this.activeRun = null;
    if (active.timer !== undefined) window.clearTimeout(active.timer);
    if (active.quietTimer !== undefined) window.clearTimeout(active.quietTimer);
    active.resolve(diagnostics);
  }

  private setState(state: LeanSessionState): void {
    this.stateValue = state;
    this.options.onStateChange?.(state);
    if (state === 'starting') return;

    for (const waiter of this.readyWaiters) {
      window.clearTimeout(waiter.timer);
      waiter.resolve(state === 'ready');
    }
    this.readyWaiters.clear();
  }

  private releaseResources(): void {
    const connection = this.connection;
    const server = this.server;
    this.connection = null;
    this.server = null;
    connection?.dispose();
    server?.dispose();
  }
}
