// editor.api 只带编辑器内核，不注册 80 多种内置语言，主包和内存都小得多。
import * as monaco from 'monaco-editor/editor/editor.api';
// 补全、悬停、查找等交互能力需要单独引入，见 monaco-contrib.ts。
import '../monaco-contrib';
import editorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import type { getLean4LanguageServer } from '@wasm-idle/lsp/lean4';
import { createMessageConnection, type MessageConnection } from 'vscode-jsonrpc/browser';
import LeanWorker from '../../node_modules/@wasm-idle/lsp/dist/lean4/worker.js?worker';
import { messagesFor, type Locale } from '../i18n';
import { findDeclaration } from '../lean-declaration';
import { LEAN_LANGUAGE_ID, registerLean } from '../lean-language';
import { getResolvedTheme, onResolvedThemeChange } from '../theme';

type Lean4Server = Awaited<ReturnType<typeof getLean4LanguageServer>>;

(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

registerLean(monaco);

export type LeanPanelVariant = 'full' | 'compact';

export type LeanPanelOptions = {
  variant: LeanPanelVariant;
  code: string;
  locale: Locale;
  /** 面板可见时自动启动，省掉一次点击后的等待。 */
  autoStart?: boolean;
};

export type LeanPanel = {
  setCode: (code: string, options?: { focus?: boolean }) => void;
  getCode: () => string;
  focus: () => void;
};

type LspDiagnostic = {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number;
  message: string;
  source?: string;
};

const panelClass = (compact: boolean) =>
  `flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel ${
    compact ? 'max-h-[150px]' : 'max-[900px]:max-h-[320px]'
  }`;

const panelHeadingClass =
  'm-0 flex items-center justify-between gap-2 border-b border-line px-3.5 py-[11px] text-xs font-[650] uppercase tracking-[0.07em] text-muted';

const pillClass =
  'inline-flex min-h-8 max-w-[160px] items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-line px-3 py-1 text-[13px] text-muted data-[state=loading]:border-warn/45 data-[state=loading]:text-warn data-[state=ready]:border-ok/45 data-[state=ready]:text-ok data-[state=error]:border-err/45 data-[state=error]:text-err';

const mutedItemClass = 'mb-1.5 px-2 py-2.5 text-[13px] text-muted';

const diagnosticClass =
  'grid w-full [font:inherit] cursor-pointer grid-cols-[auto_1fr] gap-2.5 rounded-lg border border-line bg-transparent px-2.5 py-[9px] text-left text-fg hover:border-line-strong hover:bg-panel-soft';

const diagnosticLocationClass = 'whitespace-nowrap font-mono text-xs leading-normal text-err';

const diagnosticMessageClass = 'text-[13px] leading-normal';

const renderWorkspace = (t: ReturnType<typeof messagesFor>['playground'], compact: boolean) => `
  <div
    class="${
      compact
        ? 'flex min-h-0 flex-1 flex-col gap-2.5 p-2.5'
        : 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] gap-4 px-[clamp(16px,4vw,40px)] py-4 max-[900px]:grid-cols-1'
    }"
  >
    <section
      class="${
        compact
          ? 'relative min-h-[180px] flex-[2] overflow-hidden rounded-xl border border-line bg-editor-bg'
          : 'relative h-[calc(100vh-250px)] min-h-[520px] overflow-hidden rounded-xl border border-line bg-editor-bg max-[900px]:h-[60vh] max-[900px]:min-h-[420px]'
      }"
    ><div class="absolute inset-0" data-role="editor"></div></section>
    <aside
      class="${
        compact
          ? 'contents'
          : 'flex h-[calc(100vh-250px)] min-h-0 flex-col gap-4 max-[900px]:h-auto'
      }"
    >
      <section class="${panelClass(compact)} flex-none">
        <h2 class="${panelHeadingClass}">${t.goalTitle}</h2>
        <div
          data-role="goal-statement"
          hidden
          class="truncate border-b border-line px-3.5 py-1.5 font-mono text-[11.5px] leading-[1.5] text-muted"
        ></div>
        <pre
          data-role="goal"
          class="m-0 overflow-auto whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-[13px] leading-[1.6] text-fg ${
            compact ? 'max-h-[64px]' : 'max-h-[170px]'
          }"
        >${t.goalPlaceholder}</pre>
      </section>
      <section class="${panelClass(compact)} min-h-0 flex-1">
        <h2 class="${panelHeadingClass}">${t.diagnosticsTitle} <span data-role="count" class="min-w-6 rounded-full bg-panel-soft px-[7px] py-px text-center text-xs text-fg">0</span></h2>
        <ul data-role="diagnostics" class="m-0 flex-1 list-none overflow-auto p-2">
          <li class="${mutedItemClass}">${t.diagnosticsPlaceholder}</li>
        </ul>
      </section>
      ${
        compact
          ? `<details class="${panelClass(true)} flex-none">
               <summary class="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-line px-3.5 py-[9px] text-xs font-[650] uppercase tracking-[0.07em] text-muted select-none">${t.logTitle}<span class="text-[10px] font-normal normal-case tracking-normal">展开</span></summary>
               <pre data-role="log" class="m-0 max-h-[140px] overflow-auto whitespace-pre-wrap break-words px-3.5 py-2.5 font-mono text-xs leading-[1.65] text-muted"></pre>
             </details>`
          : `<section class="${panelClass(false)} flex-1 basis-1/2">
               <h2 class="${panelHeadingClass}">${t.logTitle}</h2>
               <pre data-role="log" class="m-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-xs leading-[1.65] text-muted"></pre>
             </section>`
      }
    </aside>
  </div>
`;

const renderMarkup = (
  locale: Locale,
  variant: LeanPanelVariant,
  t: ReturnType<typeof messagesFor>['playground'],
) => {
  const compact = variant === 'compact';
  const status = `<span class="${pillClass}" data-role="status">${t.statusIdle}</span>`;
  const start = `<button type="button" data-role="start">${t.start}</button>`;

  if (!compact) {
    return `
      <section class="flex min-h-[calc(100vh-61px)] flex-col">
        <div
          class="flex items-end justify-between gap-4 border-b border-line gutter-x pb-3 pt-5 max-[900px]:flex-col max-[900px]:items-start"
        >
          <div>
            <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">Lean 4.34.1 · WebAssembly · Init only</p>
            <h1 class="m-0 text-[clamp(20px,2.6vw,26px)] font-bold">${t.title}</h1>
            <p class="mt-1.5 mb-0 text-xs text-muted">${t.hint}</p>
          </div>
          <div class="flex items-center gap-3">${status}${start}</div>
        </div>
        <div class="h-[3px] bg-transparent" aria-hidden="true"><div data-role="bar" class="h-full w-0 bg-[linear-gradient(90deg,var(--accent),var(--ok))] transition-[width] duration-[250ms] ease-out"></div></div>
        ${renderWorkspace(t, false)}
      </section>
    `;
  }

  return `
    <section class="flex h-full flex-col overflow-hidden rounded-[14px] border border-line bg-panel">
      <div class="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5">
        <div class="flex min-w-0 flex-col">
          <span class="m-0 truncate text-[10px] uppercase tracking-[0.12em] text-accent">Lean 4 · Init</span>
          <strong class="truncate text-sm">${t.title}</strong>
        </div>
        <div class="flex shrink-0 items-center gap-2">${status}${start}</div>
      </div>
      <div class="h-[3px] shrink-0 bg-transparent" aria-hidden="true"><div data-role="bar" class="h-full w-0 bg-[linear-gradient(90deg,var(--accent),var(--ok))] transition-[width] duration-[250ms] ease-out"></div></div>
      ${renderWorkspace(t, true)}
      <div class="shrink-0 px-3.5 pb-3 pt-1.5 text-right text-xs">
        <a class="text-muted no-underline hover:text-accent" href="/${locale}/playground">${t.openFull}</a>
      </div>
    </section>
  `;
};

export const createLeanPanel = (host: HTMLElement, options: LeanPanelOptions): LeanPanel => {
  const { variant, code, locale, autoStart = false } = options;
  const t = messagesFor(locale).playground;

  host.innerHTML = renderMarkup(locale, variant, t);

  const statusEl = host.querySelector<HTMLElement>('[data-role="status"]')!;
  const startEl = host.querySelector<HTMLButtonElement>('[data-role="start"]')!;
  const barEl = host.querySelector<HTMLElement>('[data-role="bar"]')!;
  const logEl = host.querySelector<HTMLPreElement>('[data-role="log"]')!;
  const diagnosticsEl = host.querySelector<HTMLUListElement>('[data-role="diagnostics"]')!;
  const diagCountEl = host.querySelector<HTMLElement>('[data-role="count"]')!;
  const goalEl = host.querySelector<HTMLPreElement>('[data-role="goal"]')!;
  const statementEl = host.querySelector<HTMLElement>('[data-role="goal-statement"]')!;

  const uri = 'file:///workspace/Main.lean';
  const model = monaco.editor.createModel(code, LEAN_LANGUAGE_ID, monaco.Uri.parse(uri));
  const editor = monaco.editor.create(host.querySelector<HTMLElement>('[data-role="editor"]')!, {
    model,
    theme: getResolvedTheme() === 'light' ? 'vs' : 'vs-dark',
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

  const stopThemeSync = onResolvedThemeChange((theme) => {
    monaco.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark');
  });

  const log = (message: string) => {
    logEl.textContent += `[${new Date().toLocaleTimeString()}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  let connection: MessageConnection | null = null;
  let server: Lean4Server | null = null;
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
    barEl.style.width =
      ratio === null ? '0%' : `${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%`;
  };

  // Pages 静态资源不支持 Range；Service Worker 从站点同源 /cdn/ 网关（Function → R2）
  // 分片下载 Lean 资产，网关不可用时回退 GitHub raw，最后回退同源全量请求。
  const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      log(t.logSwReady);
    } catch (error) {
      log(t.logSwFailed(error instanceof Error ? error.message : String(error)));
    }
  };

  void registerServiceWorker();

  const onServiceWorkerMessage = (event: MessageEvent) => {
    const data = event.data as {
      type?: string;
      name?: string;
      loaded?: number;
      total?: number;
      message?: string;
      source?: string;
    };
    if (data?.type === 'lean-asset-fallback' && data.name) {
      log(t.statusChunkFallback(data.name, data.message ?? 'unknown error'));
      return;
    }
    if (data?.type !== 'lean-asset-progress' || !data.name || !data.loaded || !data.total) return;
    setStatus(
      t.statusChunks((data.loaded / 1048576).toFixed(1), (data.total / 1048576).toFixed(1)),
      'loading',
    );
    setProgress(data.loaded / data.total);
  };

  navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);

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
    setStatus(t.statusReady(diagnosticSeq, Math.round(latency)), 'ready');

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
      item.className = mutedItemClass;
      item.textContent = t.statusNoDiagnostics(Math.round(latency));
      diagnosticsEl.append(item);
      return;
    }

    for (const diagnostic of params.diagnostics) {
      const item = document.createElement('li');
      item.className = 'mb-1.5';
      const button = document.createElement('button');
      button.className = diagnosticClass;
      button.type = 'button';

      const location = document.createElement('span');
      location.className = diagnosticLocationClass;
      location.textContent = `${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`;

      const message = document.createElement('span');
      message.className = diagnosticMessageClass;
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
        contents:
          | string
          | { kind?: string; value: string }
          | Array<string | { kind?: string; value: string }>;
      }>('textDocument/hover', positionParams(position));
      log(`hover ${position.lineNumber}:${position.column} -> ${hover ? '有结果' : 'null'}`);
      if (!hover?.contents) return null;

      const contents = (Array.isArray(hover.contents) ? hover.contents : [hover.contents]).map(
        (entry) => (typeof entry === 'string' ? { value: entry } : { value: entry.value }),
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
    provideCompletionItems: async (completionModel, position) => {
      const result = await lspRequest<
        { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
      >('textDocument/completion', positionParams(position));
      if (!result) return { suggestions: [] };

      const items = Array.isArray(result) ? result : (result.items ?? []);
      log(`completion @${position.lineNumber}:${position.column} -> ${items.length} 项`);
      const word = completionModel.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      return {
        suggestions: items.map((item) => {
          const insertText =
            typeof item.insertText === 'string' ? item.insertText : String(item.label ?? '');
          return {
            label: String(item.label ?? insertText),
            kind: completionKind(typeof item.kind === 'number' ? item.kind : undefined),
            insertText,
            range,
            insertTextRules:
              item.insertTextFormat === 2
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
            detail: typeof item.detail === 'string' ? item.detail : undefined,
            documentation:
              typeof item.documentation === 'string'
                ? item.documentation
                : item.documentation &&
                    typeof item.documentation === 'object' &&
                    'value' in item.documentation
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
        | {
            uri: string;
            range: {
              start: { line: number; character: number };
              end: { line: number; character: number };
            };
          }
        | Array<{
            uri: string;
            range: {
              start: { line: number; character: number };
              end: { line: number; character: number };
            };
          }>
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

  // 面板第一行：光标所在声明的签名。与光标列位置无关，只在跨声明或改代码时变化。
  const updateStatement = () => {
    const position = editor.getPosition();
    if (!position) return;
    const declaration = findDeclaration(model.getValue().split('\n'), position.lineNumber - 1);
    const text = declaration?.signature ?? '';
    if (statementEl.textContent !== text) {
      statementEl.textContent = text;
      statementEl.title = text;
    }
    statementEl.hidden = text === '';
  };

  updateStatement();

  model.onDidChangeContent(() => {
    updateStatement();
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
      goalEl.textContent = text || t.goalEmpty;
    } catch (error) {
      goalSupported = false;
      goalEl.textContent = t.goalUnsupported;
      log(`$/lean/plainGoal 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  editor.onDidChangeCursorPosition(() => {
    updateStatement();
    window.clearTimeout(goalTimer);
    goalTimer = window.setTimeout(requestGoal, 250);
  });

  /** 关闭引擎：终止 worker 并释放它占的内存，编辑器内容保留。 */
  const stop = () => {
    connection?.dispose();
    server?.dispose();
    connection = null;
    server = null;
    ready = false;
    goalSupported = true;
    setStatus(t.statusIdle, 'idle');
    setProgress(0);
    goalEl.textContent = t.goalPlaceholder;
    statementEl.hidden = true;
    startEl.textContent = t.start;
    log(t.logStopped);
  };

  const start = async () => {
    if (startEl.disabled) return;
    startEl.disabled = true;
    // 首次下载约 143 MB；在用户手势中申请持久存储，避免浏览器清理已校验的缓存。
    void navigator.storage?.persist?.().catch(() => {});
    setStatus(t.statusLoading, 'loading');
    setProgress(0);
    const startedAt = performance.now();

    if ('serviceWorker' in navigator) {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
      ]);
    }

    if (new URLSearchParams(location.search).has('fresh')) {
      const { clearRuntimeAssetCache } = await import('@wasm-idle/core');
      await clearRuntimeAssetCache();
      log(t.logCacheCleared);
    }

    try {
      // 运行时约 700KB，按需加载，首屏只留编辑器。
      const { getLean4LanguageServer } = await import('@wasm-idle/lsp/lean4');
      server = await getLean4LanguageServer({
        rootUrl: '/',
        // 慢网络下 22MB 的 pack 可能超过 10 分钟，放宽超时避免下载中途被中止。
        startupTimeoutMs: 60 * 60_000,
        assetTimeoutMs: 60 * 60_000,
        // Init 导入后堆约 370 MiB，但导入峰值更高，1 GiB 才稳。
        lean4: { maxMemoryBytes: 1024 ** 3 },
        createWorker: () => new LeanWorker(),
        onStatus: (status) => {
          if (status.state === 'loading') {
            const loaded = status.loaded ?? 0;
            const total = status.total ?? 0;
            const hasBytes = loaded > 0 && total > 0;
            setProgress(hasBytes ? loaded / total : null);
            setStatus(
              hasBytes
                ? `${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`
                : t.statusStarting,
              'loading',
            );
          } else if (status.state === 'ready') {
            setProgress(1);
            setStatus(t.statusLspReady, 'ready');
            log(t.logRuntimeReady);
          } else if (status.state === 'error') {
            setStatus(t.statusError(status.message), 'error');
            log(t.logRuntimeError(status.message));
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
      startEl.textContent = t.stop;
      lastEditAt = performance.now();
      connection.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId: LEAN_LANGUAGE_ID, version, text: model.getValue() },
      });
      setStatus(t.statusWaitingDiagnostics, 'ready');
      log(t.logInitialize(((performance.now() - startedAt) / 1000).toFixed(2)));
      window.setTimeout(requestGoal, 800);
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      setStatus(t.statusFailure(message), 'error');
      log(t.logStartFailed(message));
      console.error(error);
    } finally {
      startEl.disabled = false;
    }
  };

  startEl.addEventListener('click', () => {
    if (ready) stop();
    else void start();
  });

  // 开发环境与 ?debug 下暴露编辑器实例，方便控制台调试和自动化检查。
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    Object.assign(window as unknown as Record<string, unknown>, {
      __monaco: monaco,
      __editor: editor,
    });
  }

  if (autoStart) {
    // 直接排一个短定时器：比 IntersectionObserver 更确定，也让下载尽早开始。
    window.setTimeout(() => {
      void start();
    }, 400);
  }

  window.addEventListener('pagehide', () => {
    connection?.dispose();
    server?.dispose();
    stopThemeSync();
    model.dispose();
    editor.dispose();
  });

  return {
    setCode: (next: string, options?: { focus?: boolean }) => {
      model.setValue(next);
      editor.setPosition({ lineNumber: 1, column: 1 });
      editor.revealLine(1);
      if (options?.focus ?? true) editor.focus();
    },
    getCode: () => model.getValue(),
    focus: () => editor.focus(),
  };
};
