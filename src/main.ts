import * as monaco from 'monaco-editor/editor/editor.main';
import editorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { clearRuntimeAssetCache } from '@wasm-idle/core';
import { getLean4LanguageServer } from '@wasm-idle/lsp/lean4';
import { createMessageConnection, type MessageConnection } from 'vscode-jsonrpc/browser';
import LeanWorker from '../node_modules/@wasm-idle/lsp/dist/lean4/worker.js?worker';
import { LEAN_LANGUAGE_ID, registerLean } from './lean-language';

(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

registerLean(monaco);

const statusEl = document.querySelector<HTMLElement>('#status')!;
const startEl = document.querySelector<HTMLButtonElement>('#start')!;
const barEl = document.querySelector<HTMLElement>('#bar')!;
const logEl = document.querySelector<HTMLPreElement>('#log')!;
const diagnosticsEl = document.querySelector<HTMLUListElement>('#diagnostics')!;
const diagCountEl = document.querySelector<HTMLElement>('#diag-count')!;
const goalEl = document.querySelector<HTMLPreElement>('#goal')!;

const uri = 'file:///workspace/Main.lean';
const initialCode = `def bad : Nat := true

theorem add_comm (a b : Nat) : a + b = b + a := by
  induction a with
  | zero => simp
  | succ a ih => simp [Nat.succ_add, ih]

#check Nat.add
`;

const model = monaco.editor.createModel(initialCode, LEAN_LANGUAGE_ID, monaco.Uri.parse(uri));
const editor = monaco.editor.create(document.querySelector<HTMLElement>('#editor')!, {
  model,
  theme: 'vs-dark',
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 15,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  lineHeight: 24,
  scrollBeyondLastLine: false,
  padding: { top: 16, bottom: 16 },
  renderLineHighlight: 'all',
  tabSize: 2,
  wordWrap: 'on',
});

const log = (message: string) => {
  logEl.textContent += `[${new Date().toLocaleTimeString()}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};

let connection: MessageConnection | null = null;
let server: Awaited<ReturnType<typeof getLean4LanguageServer>> | null = null;
let ready = false;
let version = 1;
let lastEditAt = 0;
let diagnosticSeq = 0;
let debounceTimer: number | undefined;

const setStatus = (text: string, kind: 'idle' | 'loading' | 'ready' | 'error' = 'idle') => {
  statusEl.textContent = text;
  statusEl.dataset.state = kind;
};

const setProgress = (ratio: number | null) => {
  barEl.style.width = ratio === null ? '0%' : `${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%`;
};

// Cloudflare Pages 不支持 Range；Service Worker 从 GitHub raw 分片下载 Lean 资产。
const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    log('Service Worker 就绪，Lean 资产走 GitHub 分片下载');
  } catch (error) {
    log(`Service Worker 注册失败，回退 Pages：${error instanceof Error ? error.message : String(error)}`);
  }
};

void registerServiceWorker();

navigator.serviceWorker?.addEventListener('message', (event) => {
  const data = event.data as {
    type?: string;
    name?: string;
    loaded?: number;
    total?: number;
    message?: string;
  };
  if (data?.type === 'lean-asset-fallback' && data.name) {
    log(`分片回退 ${data.name}：${data.message ?? 'unknown error'}`);
    return;
  }
  if (data?.type !== 'lean-asset-progress' || !data.name || !data.loaded || !data.total) return;
  setStatus(
    `分片下载 ${data.name} ${(data.loaded / 1048576).toFixed(1)}/${(data.total / 1048576).toFixed(1)}MB`,
    'loading',
  );
  setProgress(data.loaded / data.total);
});

type LspDiagnostic = {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number;
  message: string;
  source?: string;
};

const severityOf = (severity?: number): monaco.MarkerSeverity => {
  switch (severity) {
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    case 4:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Error;
  }
};

const renderDiagnostics = (params: { uri: string; diagnostics: LspDiagnostic[] }) => {
  if (params.uri.toLowerCase() !== uri.toLowerCase()) return;

  const latency = lastEditAt ? performance.now() - lastEditAt : 0;
  diagnosticSeq += 1;
  setStatus(`就绪 · 诊断 #${diagnosticSeq} ${latency.toFixed(0)}ms`, 'ready');

  monaco.editor.setModelMarkers(
    model,
    LEAN_LANGUAGE_ID,
    params.diagnostics.map((diagnostic) => ({
      severity: severityOf(diagnostic.severity),
      message: diagnostic.message,
      source: diagnostic.source ?? 'Lean',
      startLineNumber: diagnostic.range.start.line + 1,
      startColumn: diagnostic.range.start.character + 1,
      endLineNumber: diagnostic.range.end.line + 1,
      endColumn: diagnostic.range.end.character + 1,
    })),
  );

  diagnosticsEl.replaceChildren();
  diagCountEl.textContent = String(params.diagnostics.length);

  if (params.diagnostics.length === 0) {
    const item = document.createElement('li');
    item.className = 'muted';
    item.textContent = `无诊断 · ${latency.toFixed(0)}ms`;
    diagnosticsEl.append(item);
    return;
  }

  for (const diagnostic of params.diagnostics) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'diagnostic';
    button.type = 'button';

    const location = document.createElement('span');
    location.className = 'diagnostic-location';
    location.textContent = `${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`;

    const message = document.createElement('span');
    message.className = 'diagnostic-message';
    message.textContent = diagnostic.message;

    button.append(location, message);
    button.addEventListener('click', () => {
      const position = {
        lineNumber: diagnostic.range.start.line + 1,
        column: diagnostic.range.start.character + 1,
      };
      editor.setPosition(position);
      editor.revealPositionInCenter(position);
      editor.focus();
    });

    item.append(button);
    diagnosticsEl.append(item);
  }
};

const lspRequest = async <T>(method: string, params: unknown): Promise<T | null> => {
  if (!connection || !ready) return null;
  try {
    return await connection.sendRequest<T>(method, params);
  } catch (error) {
    log(`${method} 失败：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const positionParams = (position: monaco.Position) => ({
  textDocument: { uri },
  position: { line: position.lineNumber - 1, character: position.column - 1 },
});

monaco.languages.registerHoverProvider(LEAN_LANGUAGE_ID, {
  provideHover: async (_model, position) => {
    const hover = await lspRequest<{
      contents: string | { kind?: string; value: string } | Array<string | { kind?: string; value: string }>;
    }>('textDocument/hover', positionParams(position));
    log(`hover ${position.lineNumber}:${position.column} -> ${hover ? '有结果' : 'null'}`);
    if (!hover?.contents) return null;

    const contents = (Array.isArray(hover.contents) ? hover.contents : [hover.contents]).map((entry) =>
      typeof entry === 'string' ? { value: entry } : { value: entry.value },
    );
    return { contents };
  },
});

const completionKind = (kind?: number): monaco.languages.CompletionItemKind => {
  const map: Record<number, monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter,
  };
  return map[kind ?? 1] ?? monaco.languages.CompletionItemKind.Text;
};

monaco.languages.registerCompletionItemProvider(LEAN_LANGUAGE_ID, {
  triggerCharacters: ['.', ' '],
  provideCompletionItems: async (_model, position) => {
    const result = await lspRequest<
      | { items?: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>
    >('textDocument/completion', positionParams(position));
    if (!result) return { suggestions: [] };

    const items = Array.isArray(result) ? result : result.items ?? [];
    log(`completion @${position.lineNumber}:${position.column} -> ${items.length} 项`);
    return {
      suggestions: items.map((item) => {
        const insertText = typeof item.insertText === 'string' ? item.insertText : String(item.label ?? '');
        return {
          label: String(item.label ?? insertText),
          kind: completionKind(typeof item.kind === 'number' ? item.kind : undefined),
          insertText,
          insertTextRules:
            item.insertTextFormat === 2
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
          detail: typeof item.detail === 'string' ? item.detail : undefined,
          documentation:
            typeof item.documentation === 'string'
              ? item.documentation
              : item.documentation && typeof item.documentation === 'object' && 'value' in item.documentation
                ? String((item.documentation as { value: unknown }).value)
                : undefined,
          sortText: typeof item.sortText === 'string' ? item.sortText : undefined,
          filterText: typeof item.filterText === 'string' ? item.filterText : undefined,
        };
      }),
    };
  },
});

monaco.languages.registerDefinitionProvider(LEAN_LANGUAGE_ID, {
  provideDefinition: async (_model, position) => {
    const result = await lspRequest<
      | { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }
      | Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>
    >('textDocument/definition', positionParams(position));
    if (!result) return null;
    const locations = Array.isArray(result) ? result : [result];
    return locations
      .filter((location) => location.uri.toLowerCase() === uri.toLowerCase())
      .map((location) => ({
        uri: monaco.Uri.parse(location.uri),
        range: new monaco.Range(
          location.range.start.line + 1,
          location.range.start.character + 1,
          location.range.end.line + 1,
          location.range.end.character + 1,
        ),
      }));
  },
});

model.onDidChangeContent(() => {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    if (!connection || !ready) return;
    lastEditAt = performance.now();
    version += 1;
    connection.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text: model.getValue() }],
    });
  }, 350);
});

let goalSupported = true;
let goalTimer: number | undefined;

const requestGoal = async () => {
  if (!ready || !connection || !goalSupported) return;
  const position = editor.getPosition();
  if (!position) return;
  try {
    const result = await connection.sendRequest<{ rendered?: string; goals?: string[] }>(
      '$/lean/plainGoal',
      positionParams(position),
    );
    const text = result?.rendered?.trim() || (result?.goals ?? []).join('\n\n').trim();
    goalEl.textContent = text || '当前光标没有 Goal';
  } catch (error) {
    goalSupported = false;
    goalEl.textContent = '该 Lean LSP 不支持 Goal';
    log(`$/lean/plainGoal 失败：${error instanceof Error ? error.message : String(error)}`);
  }
};

editor.onDidChangeCursorPosition(() => {
  window.clearTimeout(goalTimer);
  goalTimer = window.setTimeout(requestGoal, 250);
});

const start = async () => {
  startEl.disabled = true;
  // 首次下载约 143 MB；在用户手势中申请持久存储，避免浏览器清理已校验的缓存。
  void navigator.storage?.persist?.().catch(() => {});
  setStatus('加载运行时…（首次约 143MB）', 'loading');
  setProgress(0);
  const startedAt = performance.now();

  if ('serviceWorker' in navigator) {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
    ]);
  }

  if (new URLSearchParams(location.search).has('fresh')) {
    await clearRuntimeAssetCache();
    log('已清空 Lean 资产缓存（fresh=1）');
  }

  try {
    server = await getLean4LanguageServer({
      rootUrl: '/',
      // 慢网络下 22MB 的 pack 可能超过 10 分钟，放宽超时避免下载中途被中止。
      startupTimeoutMs: 60 * 60_000,
      assetTimeoutMs: 60 * 60_000,
      lean4: { maxMemoryBytes: 1024 ** 3 },
      createWorker: () => new LeanWorker(),
      onStatus: (status) => {
        if (status.state === 'loading') {
          const ratio = status.loaded !== undefined && status.total ? status.loaded / status.total : null;
          const mb =
            status.loaded !== undefined && status.total
              ? ` ${(status.loaded / 1048576).toFixed(1)}/${(status.total / 1048576).toFixed(1)}MB`
              : '';
          setProgress(ratio);
          setStatus(`加载 ${status.stage ?? 'Lean'}${mb}`, 'loading');
        } else if (status.state === 'ready') {
          setProgress(1);
          setStatus('LSP 就绪', 'ready');
          log('运行时资源就绪');
        } else if (status.state === 'error') {
          setStatus(`错误：${status.message}`, 'error');
          log(`运行时错误：${status.message}`);
        }
      },
    });

    connection = createMessageConnection(server.transport.reader, server.transport.writer);
    connection.onNotification('textDocument/publishDiagnostics', renderDiagnostics);
    connection.onNotification('window/logMessage', (params: { message: string }) =>
      log(`server: ${params.message}`),
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
    connection.sendNotification('initialized', {});

    ready = true;
    lastEditAt = performance.now();
    connection.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: LEAN_LANGUAGE_ID, version, text: model.getValue() },
    });
    setStatus('等待诊断…', 'ready');
    log(`initialize 完成，总耗时 ${((performance.now() - startedAt) / 1000).toFixed(2)}s`);
    window.setTimeout(requestGoal, 800);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    setStatus(`失败：${message}`, 'error');
    log(`启动失败：${message}`);
    console.error(error);
  } finally {
    startEl.disabled = false;
  }
};

startEl.addEventListener('click', start);

window.addEventListener('pagehide', () => {
  connection?.dispose();
  server?.dispose();
});
