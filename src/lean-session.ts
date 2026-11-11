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
};

type ActiveRun = {
  resolve: (diagnostics: LspDiagnostic[]) => void;
  timer: number | undefined;
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

  constructor(private readonly options: LeanSessionOptions) {
    this.uri = options.uri ?? 'file:///workspace/Main.lean';
    this.languageId = options.languageId ?? 'lean4';
    this.readyTimeoutMs = options.readyTimeoutMs ?? 180_000;
    this.diagnosticTimeoutMs = options.diagnosticTimeoutMs ?? 25_000;
    this.reopenDelayMs = options.reopenDelayMs ?? 300;
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
      this.setState('ready');
      connection.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri: this.uri,
          languageId: this.languageId,
          version: this.version,
          text: code,
        },
      });
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
      const active: ActiveRun = { resolve, timer: undefined, opened: false, diagnostics: [] };
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
        // Lean 会渐进发布诊断；等待本版文档处理完成后再返回最后一次诊断。
        void connection
          .sendRequest('textDocument/documentSymbol', { textDocument: { uri: this.uri } })
          .then(
            () => this.settleRun(active.diagnostics, active),
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
