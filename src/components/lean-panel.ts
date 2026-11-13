// editor.api 只带编辑器内核，不注册 80 多种内置语言，主包和内存都小得多。
import * as monaco from 'monaco-editor/editor/editor.api';
// 补全、悬停、查找等交互能力需要单独引入，见 monaco-contrib.ts。
import '../monaco-contrib';
import editorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { createMessageConnection } from 'vscode-jsonrpc/browser';
import LeanWorker from '../../node_modules/@wasm-idle/lsp/dist/lean4/worker.js?worker';
import { messagesFor, type Locale } from '../i18n';
import { cacheBudgetBytes, currentMemoryTier } from '../device';
import {
  abbreviationSuggestions,
  findAbbreviationQuery,
  matchAbbreviation,
} from '../lean-abbreviations';
import { clearDraft, readDraft, saveDraft } from '../draft';
import { clearRuntimeCache } from '../runtime-cache';
import { isExerciseSolved, isExerciseStarter } from '../exercise';
import { findDeclaration } from '../lean-declaration';
import { stripGoalFence } from '../lean-goal';
import { LEAN_LANGUAGE_ID, registerLean } from '../lean-language';
import { LeanSession, type LspDiagnostic } from '../lean-session';
import { toMonacoCompletions, type LspCompletionResult } from '../lsp-completion';
import { reportError, track } from '../telemetry';
import { getResolvedTheme, onResolvedThemeChange } from '../theme';
import { buttonClass, ghostButtonClass } from './ui';

(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

registerLean(monaco);

export type LeanPanelVariant = 'full' | 'compact';

export type LeanPanelProgressKind = 'idle' | 'loading' | 'ready' | 'error';

export type LeanPanelProgress = {
  /** 当前阶段文案，如“加载运行时…（首次约 102MB）”“启动 LSP…”。 */
  label: string;
  kind: LeanPanelProgressKind;
  /** 资产下载进度；未知时为 null，用不确定进度条。 */
  ratio: number | null;
};

export type LeanPanelOptions = {
  variant: LeanPanelVariant;
  code: string;
  locale: Locale;
  /** 面板可见时自动启动，省掉一次点击后的等待。 */
  autoStart?: boolean;
  /** 从课程练习进来时提供，用于显示「回到本课」并命名导出文件。 */
  lessonSlug?: string;
  /** 提供时按该 key 自动保存草稿，刷新后恢复。 */
  draftKey?: string;
  /** 启动与下载进度，供课程页在不可见面板外显示。 */
  onProgress?: (progress: LeanPanelProgress) => void;
};

export type LeanPanel = {
  setCode: (code: string, options?: { focus?: boolean }) => void;
  getCode: () => string;
  focus: () => void;
  /** 把代码送进语言服务器并等一次诊断结果，供课程页做内联输出。 */
  run: (code: string) => Promise<LspDiagnostic[]>;
  /** 读取当前进度快照，课程页点击运行时先回显已有状态。 */
  getProgress: () => LeanPanelProgress;
};

export type { LspDiagnostic };

const panelClass = (compact: boolean) =>
  `flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel ${
    compact ? 'max-h-[150px]' : 'max-[900px]:max-h-[320px]'
  }`;

const panelHeadingClass =
  'm-0 flex items-center justify-between gap-2 border-b border-line px-3.5 py-[11px] text-xs font-[650] uppercase tracking-[0.07em] text-muted';

const pillClass =
  'inline-flex min-h-9 min-w-0 max-w-[240px] items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-line px-3 py-1 text-[13px] text-muted data-[state=loading]:border-warn/45 data-[state=loading]:text-warn data-[state=ready]:border-ok/45 data-[state=ready]:text-ok data-[state=error]:border-err/45 data-[state=error]:text-err';

const mutedItemClass = 'mb-1 px-2 py-2 text-[13px] text-muted';

const diagnosticClass =
  'grid w-full [font:inherit] cursor-pointer grid-cols-[auto_auto_1fr] items-center gap-2 rounded-lg border border-line bg-transparent px-2 py-[7px] text-left text-fg hover:border-line-strong hover:bg-panel-soft';

/** LSP severity：1 错误、2 警告、3 信息、4 提示；#eval / #check 的输出属于 3。 */
const diagnosticLocationClass = (severity?: number) =>
  `whitespace-nowrap font-mono text-xs leading-normal ${
    severity === 2
      ? 'text-warn'
      : severity === 1 || severity === undefined
        ? 'text-err'
        : 'text-accent'
  }`;

const diagnosticBadgeClass = (severity?: number) =>
  `whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-[650] leading-none ${
    severity === 2
      ? 'border-warn/40 bg-warn/10 text-warn'
      : severity === 1 || severity === undefined
        ? 'border-err/40 bg-err/10 text-err'
        : 'border-accent/40 bg-accent-soft text-accent'
  }`;

const diagnosticMessageClass = 'text-[13px] leading-normal';

const renderWorkspace = (t: ReturnType<typeof messagesFor>['playground'], compact: boolean) => `
  <div
    data-role="workspace"
    class="${
      compact
        ? 'flex min-h-0 flex-1 flex-col gap-2 p-2.5'
        : 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_6px_clamp(320px,32vw,380px)] gap-4 px-[clamp(16px,4vw,40px)] py-4 max-[900px]:grid-cols-1'
    }"
  >
    <section
      ${compact ? 'data-role="editor-wrap" style="flex:0 0 45%"' : ''}
      class="${
        compact
          ? 'relative min-h-[130px] overflow-hidden rounded-xl border border-line bg-editor-bg'
          : 'relative h-[calc(100dvh-292px)] min-h-[520px] overflow-hidden rounded-xl border border-line bg-editor-bg max-[900px]:h-[52dvh] max-[900px]:min-h-[360px]'
      }"
    ><div class="absolute inset-0" data-role="editor"></div></section>
    ${
      compact
        ? `<div
             data-role="resize"
             role="separator"
             aria-orientation="horizontal"
             title="${t.resizeHint}"
             class="group flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center"
           ><span class="h-[3px] w-12 rounded-full bg-line transition-colors group-hover:bg-accent"></span></div>`
        : `<div
             data-role="split"
             role="separator"
             aria-orientation="vertical"
             title="${t.splitHint}"
             class="flex cursor-col-resize touch-none items-center justify-center max-[900px]:hidden"
           ><span class="h-12 w-[3px] rounded-full bg-line transition-colors hover:bg-accent"></span></div>`
    }
    <aside
      data-role="aside"
      class="${
        compact
          ? 'contents'
          : 'flex h-[calc(100dvh-292px)] flex-col gap-4 max-[900px]:h-auto min-[901px]:min-h-[520px]'
      }"
    >
      <section data-panel="goal" class="${panelClass(compact)} shrink-0">
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
      <section data-panel="diagnostics" class="${panelClass(compact)} min-h-0 flex-1">
        <h2 class="${panelHeadingClass}">${t.diagnosticsTitle} <span data-role="count" class="min-w-6 rounded-full bg-panel-soft px-[7px] py-px text-center text-xs text-fg">0</span></h2>
        <div
          data-role="run-ok"
          hidden
          role="status"
          aria-live="polite"
          class="mx-2 mt-2 flex items-start gap-2 rounded-lg border border-ok/45 bg-ok/10 px-2.5 py-2 text-[12.5px] leading-normal text-ok"
        >
          <span aria-hidden="true" class="text-[13px] font-bold leading-[1.4]">✓</span>
          <span class="min-w-0">
            <strong data-role="run-ok-title" class="font-[650]"></strong>
            <span data-role="run-ok-detail" class="block text-[11.5px] text-muted"></span>
          </span>
        </div>
        <ul data-role="diagnostics" class="m-0 flex-1 list-none overflow-auto p-2 max-[900px]:max-h-[280px]">
          <li class="${mutedItemClass}">${t.diagnosticsPlaceholder}</li>
        </ul>
      </section>
      ${
        compact
          ? `<details data-panel="log" class="${panelClass(true)} shrink-0">
               <summary class="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-line px-3.5 py-[9px] text-xs font-[650] uppercase tracking-[0.07em] text-muted select-none">${t.logTitle}<span class="text-[10px] font-normal normal-case tracking-normal">${t.expand}</span></summary>
               <pre data-role="log" class="m-0 max-h-[140px] overflow-auto whitespace-pre-wrap break-words px-3.5 py-2.5 font-mono text-xs leading-[1.65] text-muted"></pre>
             </details>`
          : `<section data-panel="log" class="${panelClass(false)} flex-1">
               <h2 class="${panelHeadingClass}">${t.logTitle}</h2>
               <pre data-role="log" class="m-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-xs leading-[1.65] text-muted max-[900px]:max-h-[220px]"></pre>
             </section>`
      }
    </aside>
  </div>
`;

const renderMarkup = (
  locale: Locale,
  variant: LeanPanelVariant,
  t: ReturnType<typeof messagesFor>['playground'],
  lessonSlug?: string,
) => {
  const compact = variant === 'compact';
  const status = `<span class="${pillClass}" data-role="status">${t.statusIdle}</span>`;
  const start = `<button class="${buttonClass} max-[400px]:px-3" type="button" data-role="start">${t.start}</button>`;

  const panelToggle = (key: string, label: string) => `
    <label class="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-panel-soft">
      <input type="checkbox" data-panel-toggle="${key}" checked class="accent-[var(--accent)]" />
      <span>${label}</span>
    </label>`;

  const panelsMenu = (iconOnly: boolean) => `
    <details class="relative shrink-0" data-role="panels">
      <summary
        class="${
          iconOnly
            ? 'flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-line text-muted hover:text-fg'
            : `${ghostButtonClass} cursor-pointer list-none`
        }"
        title="${t.panelsTitle}"
      >
        ${
          iconOnly
            ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 3.5h10M2 7h10M2 10.5h10"/></svg>`
            : `${t.panelsTitle}
               <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 3.5 5 6.5 8 3.5"/></svg>`
        }
      </summary>
      <div class="absolute right-0 top-[calc(100%+6px)] z-20 w-44 rounded-xl border border-line bg-panel p-2">
        <p class="m-0 mb-1 px-1.5 text-[10px] uppercase tracking-[0.08em] text-muted">${t.showPanels}</p>
        ${panelToggle('goal', t.goalTitle)}
        ${panelToggle('diagnostics', t.diagnosticsTitle)}
        ${panelToggle('log', t.logTitle)}
      </div>
    </details>`;

  if (!compact) {
    return `
      <section class="flex min-h-[calc(100dvh-61px)] flex-col max-[900px]:min-h-0">
        <div
          class="flex items-end justify-between gap-4 border-b border-line gutter-x pb-3 pt-5 max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-3"
        >
          <div class="min-w-0">
            <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">Lean 4.34.1 · WebAssembly · Init only</p>
            <h1 class="m-0 text-[clamp(20px,2.6vw,26px)] font-bold">${t.title}</h1>
            <p class="mt-1.5 mb-0 text-xs text-muted">${t.hint}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 max-[900px]:w-full max-[900px]:justify-between">${panelsMenu(false)}${status}${start}</div>
        </div>
        <div class="h-[3px] bg-transparent" aria-hidden="true"><div data-role="bar" class="h-full w-0 bg-[linear-gradient(90deg,var(--accent),var(--ok))] transition-[width] duration-[250ms] ease-out"></div></div>
        <div class="flex flex-wrap items-center gap-2 border-b border-line gutter-x py-2">
          ${
            lessonSlug
              ? `<a class="${ghostButtonClass}" href="/${locale}/learn/${encodeURIComponent(lessonSlug)}">← ${t.backToLesson}</a>`
              : ''
          }
          <button class="${ghostButtonClass} data-[armed=true]:border-err/60 data-[armed=true]:bg-err/10 data-[armed=true]:text-err" type="button" data-role="reset">${t.resetCode}</button>
          <button class="${ghostButtonClass}" type="button" data-role="export">${t.exportCode}</button>
          <span data-role="passed" hidden class="ml-auto inline-flex items-center gap-1.5 rounded-full border border-ok/45 bg-ok/10 px-3 py-1 text-xs font-[650] text-ok">✓ ${t.lessonPassed}</span>
        </div>
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
        <div class="flex shrink-0 items-center gap-2">${status}${panelsMenu(true)}${start}</div>
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
  const { variant, code, locale, autoStart = false, lessonSlug, draftKey, onProgress } = options;
  const t = messagesFor(locale).playground;
  const memoryTier = currentMemoryTier();
  const draft = draftKey ? readDraft(draftKey) : null;

  host.innerHTML = renderMarkup(locale, variant, t, lessonSlug);

  const statusEl = host.querySelector<HTMLElement>('[data-role="status"]')!;
  const startEl = host.querySelector<HTMLButtonElement>('[data-role="start"]')!;
  const barEl = host.querySelector<HTMLElement>('[data-role="bar"]')!;
  const logEl = host.querySelector<HTMLPreElement>('[data-role="log"]')!;
  const diagnosticsEl = host.querySelector<HTMLUListElement>('[data-role="diagnostics"]')!;
  const diagCountEl = host.querySelector<HTMLElement>('[data-role="count"]')!;
  const runOkEl = host.querySelector<HTMLElement>('[data-role="run-ok"]');
  const runOkTitleEl = host.querySelector<HTMLElement>('[data-role="run-ok-title"]');
  const runOkDetailEl = host.querySelector<HTMLElement>('[data-role="run-ok-detail"]');
  const goalEl = host.querySelector<HTMLPreElement>('[data-role="goal"]')!;
  const statementEl = host.querySelector<HTMLElement>('[data-role="goal-statement"]')!;
  const resetEl = host.querySelector<HTMLButtonElement>('[data-role="reset"]');
  const exportEl = host.querySelector<HTMLButtonElement>('[data-role="export"]');
  const passedEl = host.querySelector<HTMLElement>('[data-role="passed"]');

  const uri = 'file:///workspace/Main.lean';
  const model = monaco.editor.createModel(
    draft?.code ?? code,
    LEAN_LANGUAGE_ID,
    monaco.Uri.parse(uri),
  );
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

  // Lean 的 \to / \forall 缩写：Tab 或空格后替换成 Unicode 符号。
  // 空格已经插入，所以替换范围要排除最后那个空格；Tab 则需要自己移动光标。
  const expandAbbreviation = (offset: number): boolean => {
    const position = editor.getPosition();
    if (!position) return false;
    const line = model.getLineContent(position.lineNumber);
    const targetColumn = position.column - offset;
    const match = matchAbbreviation(line, targetColumn);
    if (!match) return false;
    editor.executeEdits('lean-abbreviations', [
      {
        range: new monaco.Range(
          position.lineNumber,
          match.startColumn,
          position.lineNumber,
          targetColumn,
        ),
        text: match.symbol,
        forceMoveMarkers: true,
      },
    ]);
    if (offset === 0) {
      editor.setPosition({
        lineNumber: position.lineNumber,
        column: match.startColumn + match.symbol.length,
      });
    }
    return true;
  };

  editor.onKeyDown((event) => {
    if (event.keyCode === monaco.KeyCode.Tab && expandAbbreviation(0)) {
      event.preventDefault();
    }
  });

  // Monaco 没有公开的单字符输入事件，这里从内容变更里识别「插入了一个空格」。
  model.onDidChangeContent((event) => {
    if (event.changes.length !== 1) return;
    const change = event.changes[0];
    if (change?.text === ' ' && change.rangeLength === 0) {
      // 在变更事件里直接改文档会重入，推迟到当前事件处理完。
      window.setTimeout(() => expandAbbreviation(1), 0);
    }
  });

  // 输入 `\` 时给出缩写候选，忘了拼写也能选；选中后整段 `\name` 替换为符号。
  monaco.languages.registerCompletionItemProvider(LEAN_LANGUAGE_ID, {
    triggerCharacters: ['\\'],
    provideCompletionItems: (completionModel, position) => {
      const line = completionModel.getLineContent(position.lineNumber);
      const query = findAbbreviationQuery(line, position.column);
      if (!query) return { suggestions: [] };
      const range = new monaco.Range(
        position.lineNumber,
        query.startColumn,
        position.lineNumber,
        position.column,
      );
      return {
        suggestions: abbreviationSuggestions(query.query).map(({ name, symbol }, index) => ({
          label: `\\${name}`,
          kind: monaco.languages.CompletionItemKind.Text,
          detail: `${symbol} · ${t.abbreviationDetail}`,
          insertText: symbol,
          range,
          // 用表内顺序而不是字母序，先出现 \to / \forall 这类高频缩写。
          sortText: String(index).padStart(3, '0'),
        })),
      };
    },
  });

  // 练习工具条：重置先进入一次「确认重置？」状态，再点才覆盖代码，避免手滑。
  let resetArmTimer: number | undefined;
  const disarmReset = () => {
    window.clearTimeout(resetArmTimer);
    if (!resetEl) return;
    delete resetEl.dataset.armed;
    resetEl.textContent = t.resetCode;
  };

  resetEl?.addEventListener('click', () => {
    if (resetEl.dataset.armed !== 'true') {
      if (model.getValue() === code) return;
      resetEl.dataset.armed = 'true';
      resetEl.textContent = t.resetConfirmAction;
      window.clearTimeout(resetArmTimer);
      resetArmTimer = window.setTimeout(disarmReset, 3000);
      return;
    }
    disarmReset();
    if (draftKey) clearDraft(draftKey);
    if (passedEl) passedEl.hidden = true;
    model.setValue(code);
    editor.setPosition({ lineNumber: 1, column: 1 });
    editor.revealLine(1);
    editor.focus();
  });
  resetEl?.addEventListener('blur', disarmReset);

  exportEl?.addEventListener('click', () => {
    const blob = new Blob([model.getValue()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${lessonSlug ?? 'playground'}.lean`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  // 只有带 sorry 的具名练习才有「过关」概念；还必须保留 starter 里的定理名。
  const exerciseStarter = isExerciseStarter(code);
  const updatePassedBadge = (list: LspDiagnostic[]) => {
    if (!passedEl || !exerciseStarter) return;
    passedEl.hidden = !isExerciseSolved(code, model.getValue(), list);
  };

  // 编辑器与诊断的空间分配由用户拖动决定；面板显隐也持久化，避免每次进来重调。
  const LAYOUT_KEY = 'lean-panel:layout';
  const PANELS_KEY = 'lean-panel:panels';
  const DEFAULT_RATIO = 0.45;

  const readLayout = (
    compact: boolean,
  ): { editorRatio: number; panelWidth: number | null; panels: Record<string, boolean> } => {
    const fallback = {
      editorRatio: DEFAULT_RATIO,
      panelWidth: null,
      // 完整编辑器默认显示日志；紧凑面板默认收起，给诊断留空间。
      panels: { goal: true, diagnostics: true, log: !compact },
    };
    try {
      const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as {
        editorRatio?: unknown;
        panelWidth?: unknown;
      };
      const panels = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') as Record<
        string,
        boolean
      >;
      return {
        editorRatio:
          typeof stored.editorRatio === 'number' &&
          stored.editorRatio >= 0.2 &&
          stored.editorRatio <= 0.7
            ? stored.editorRatio
            : DEFAULT_RATIO,
        panelWidth:
          typeof stored.panelWidth === 'number' &&
          stored.panelWidth >= 300 &&
          stored.panelWidth <= 800
            ? stored.panelWidth
            : null,
        panels: { ...fallback.panels, ...panels },
      };
    } catch {
      return fallback;
    }
  };

  const layout = readLayout(variant === 'compact');
  const editorWrap = host.querySelector<HTMLElement>('[data-role="editor-wrap"]');
  const resizeHandle = host.querySelector<HTMLElement>('[data-role="resize"]');

  const applyEditorRatio = (ratio: number) => {
    if (editorWrap) editorWrap.style.flex = `0 0 ${(ratio * 100).toFixed(2)}%`;
  };

  if (editorWrap && resizeHandle) {
    applyEditorRatio(layout.editorRatio);

    resizeHandle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const container = editorWrap.parentElement;
      if (!container) return;

      const total = container.clientHeight || 1;
      const startY = event.clientY;
      const startRatio = layout.editorRatio;

      const onMove = (moveEvent: PointerEvent) => {
        const next = startRatio + (moveEvent.clientY - startY) / total;
        layout.editorRatio = Math.min(0.7, Math.max(0.2, next));
        applyEditorRatio(layout.editorRatio);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        try {
          localStorage.setItem(
            LAYOUT_KEY,
            JSON.stringify({ editorRatio: layout.editorRatio, panelWidth: layout.panelWidth }),
          );
        } catch {
          // 隐私模式下写不了，忽略即可。
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // 完整编辑器允许拖动左右分栏；窄屏恢复单列，避免内联样式压过响应式布局。
  const workspaceEl = host.querySelector<HTMLElement>('[data-role="workspace"]');
  const splitHandle = host.querySelector<HTMLElement>('[data-role="split"]');
  const wideQuery = window.matchMedia('(min-width: 901px)');

  const splitColumns = (width: number) => `minmax(0, 1fr) 6px ${width}px`;

  const applySplit = () => {
    if (!workspaceEl || !splitHandle || layout.panelWidth === null) return;
    if (!wideQuery.matches) {
      workspaceEl.style.gridTemplateColumns = '';
      return;
    }
    const style = window.getComputedStyle(workspaceEl);
    const contentWidth =
      workspaceEl.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    // 6px 分隔条 + 两段 16px gap + 编辑器至少 320px。
    const width = Math.max(300, Math.min(layout.panelWidth, contentWidth - 320 - 38));
    workspaceEl.style.gridTemplateColumns = splitColumns(width);
  };

  applySplit();
  wideQuery.addEventListener('change', applySplit);

  if (splitHandle && workspaceEl) {
    splitHandle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const asideEl = host.querySelector<HTMLElement>('[data-role="aside"]');
      const startWidth = asideEl?.getBoundingClientRect().width ?? 340;
      const style = window.getComputedStyle(workspaceEl);
      const contentWidth =
        workspaceEl.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      const maxWidth = Math.max(300, contentWidth - 320 - 38);

      const onMove = (moveEvent: PointerEvent) => {
        const next = startWidth + (startX - moveEvent.clientX);
        layout.panelWidth = Math.min(maxWidth, Math.max(300, next));
        if (wideQuery.matches) {
          workspaceEl.style.gridTemplateColumns = splitColumns(layout.panelWidth);
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        try {
          localStorage.setItem(
            LAYOUT_KEY,
            JSON.stringify({ editorRatio: layout.editorRatio, panelWidth: layout.panelWidth }),
          );
        } catch {
          // 同上。
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  for (const toggle of host.querySelectorAll<HTMLInputElement>('[data-panel-toggle]')) {
    const key = toggle.dataset.panelToggle ?? '';
    const target = host.querySelector<HTMLElement>(`[data-panel="${key}"]`);
    const visible = layout.panels[key] ?? true;

    toggle.checked = visible;
    if (target) target.hidden = !visible;

    toggle.addEventListener('change', () => {
      if (target) target.hidden = !toggle.checked;
      layout.panels[key] = toggle.checked;
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(layout.panels));
      } catch {
        // 同上。
      }
    });
  }

  const log = (message: string) => {
    logEl.textContent += `[${new Date().toLocaleTimeString()}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  if (draft) log(t.logDraftRestored);

  let draftTimer: number | undefined;
  const scheduleDraftSave = () => {
    if (!draftKey) return;
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => saveDraft(draftKey, model.getValue()), 400);
  };
  const saveDraftNow = () => {
    if (!draftKey) return;
    window.clearTimeout(draftTimer);
    saveDraft(draftKey, model.getValue());
  };

  let lastEditAt = 0;
  let lastDiagnostics: LspDiagnostic[] = [];
  let changePending = false;
  let diagnosticSeq = 0;
  let debounceTimer: number | undefined;

  let progressLabel = t.statusIdle;
  let progressKind: LeanPanelProgressKind = 'idle';
  let progressRatio: number | null = null;
  let hasAssetProgress = false;

  // 观测用：一次启动只报一条 LSP 就绪、一条首帧诊断；资产进度只报首字节与完成。
  let runStartedAt = 0;
  let firstDiagnosticsReported = false;
  const assetTelemetry = { started: false, completed: false, startedAt: 0 };

  const emitProgress = () =>
    onProgress?.({ label: progressLabel, kind: progressKind, ratio: progressRatio });

  const setStatus = (text: string, kind: LeanPanelProgressKind = 'idle') => {
    statusEl.textContent = text;
    statusEl.title = text;
    statusEl.dataset.state = kind;
    progressLabel = text;
    progressKind = kind;
    emitProgress();
  };

  const setProgress = (ratio: number | null) => {
    barEl.style.width =
      ratio === null ? '0%' : `${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%`;
    progressRatio = ratio;
    emitProgress();
  };

  // 低内存设备不自动下载：状态里写清楚，并把原因挂在启动按钮上。
  if (memoryTier === 'low') {
    setStatus(t.statusLowMemory, 'idle');
    startEl.title = t.lowMemoryHint;
    log(t.logLowMemory);
  }

  // Pages 静态资源不支持 Range；Service Worker 从站点同源 /cdn/ 网关（Function → R2）
  // 分片下载 Lean 资产，网关不可用时回退 GitHub raw，最后回退同源全量请求。
  const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return;
    const startedAt = performance.now();
    try {
      await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      log(t.logSwReady);
      track('sw', { ok: true, ms: performance.now() - startedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(t.logSwFailed(message));
      track('sw', { ok: false, ms: performance.now() - startedAt, message });
    }
  };

  void registerServiceWorker();

  const onServiceWorkerMessage = (event: MessageEvent) => {
    const data = event.data as {
      type?: string;
      name?: string;
      loaded?: number;
      total?: number;
      overallLoaded?: number;
      overallTotal?: number;
      message?: string;
      source?: string;
    };
    if (data?.type === 'lean-asset-fallback' && data.name) {
      log(t.statusChunkFallback(data.name, data.message ?? 'unknown error'));
      return;
    }
    if (data?.type !== 'lean-asset-progress' || !data.name || !data.loaded || !data.total) return;

    // 新 SW 会带上所有资产累计后的总进度；旧 SW 只有单资产数据时退回单资产。
    const loaded = data.overallLoaded ?? data.loaded;
    const total = data.overallTotal ?? data.total;
    if (total <= 0) return;
    hasAssetProgress = true;
    // 全部字节下载完后 Lean 还要解压和初始化，此时文案切回启动阶段。
    const downloaded = loaded >= total;

    if (!assetTelemetry.started) {
      assetTelemetry.started = true;
      assetTelemetry.startedAt = performance.now();
      track('assets', { phase: 'first_bytes', source: data.source ?? 'unknown' });
    }
    if (downloaded && !assetTelemetry.completed) {
      assetTelemetry.completed = true;
      track('assets', {
        phase: 'complete',
        bytes: total,
        ms: performance.now() - assetTelemetry.startedAt,
      });
    }
    setStatus(
      downloaded
        ? t.statusStarting
        : total < 0.1 * 1048576
          ? t.statusLoading
          : t.statusChunks((loaded / 1048576).toFixed(1), (total / 1048576).toFixed(1)),
      'loading',
    );
    setProgress(loaded / total);
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
    if (!firstDiagnosticsReported) {
      firstDiagnosticsReported = true;
      track('first_diagnostics', {
        ms: runStartedAt ? performance.now() - runStartedAt : 0,
        count: params.diagnostics.length,
      });
    }
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

    updatePassedBadge(params.diagnostics);
    lastDiagnostics = params.diagnostics;

    // 没有错误时给一个显眼的成功提示框；日志里那行 initialize 太容易被忽略。
    const errorCount = params.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 1 || diagnostic.severity === undefined,
    ).length;
    const warningCount = params.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 2,
    ).length;
    if (runOkEl && runOkTitleEl && runOkDetailEl) {
      runOkEl.hidden = errorCount > 0;
      if (errorCount === 0) {
        runOkTitleEl.textContent = t.runPassed;
        runOkDetailEl.textContent = t.runPassedDetail(warningCount, Math.round(latency));
      }
    }

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

      const severity = diagnostic.severity;
      const badge = document.createElement('span');
      badge.className = diagnosticBadgeClass(severity);
      badge.textContent =
        severity === 2
          ? t.severityWarning
          : severity === 1 || severity === undefined
            ? t.severityError
            : t.severityInfo;

      const location = document.createElement('span');
      location.className = diagnosticLocationClass(severity);
      location.textContent = `${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`;

      const message = document.createElement('span');
      message.className = diagnosticMessageClass;
      message.textContent = diagnostic.message;

      button.append(badge, location, message);
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

  const session = new LeanSession({
    createServer: async () => {
      // 运行时约 700KB，按需加载，首屏只留编辑器。
      const { getLean4LanguageServer } = await import('@wasm-idle/lsp/lean4');
      return getLean4LanguageServer({
        rootUrl: '/',
        // 慢网络下 22MB 的 pack 可能超过 10 分钟，放宽超时避免下载中途被中止。
        startupTimeoutMs: 60 * 60_000,
        assetTimeoutMs: 60 * 60_000,
        // 低内存设备只下调持久缓存；wasm 上限保持 1GiB，Init 导入峰值需要它。
        persistentCache: {
          maxBytes: cacheBudgetBytes(memoryTier),
          maxEntryBytes: cacheBudgetBytes(memoryTier),
        },
        // Init 导入后堆约 370 MiB，但导入峰值更高，1 GiB 才稳。
        lean4: { maxMemoryBytes: 1024 ** 3 },
        createWorker: () => new LeanWorker(),
        onStatus: (status) => {
          if (status.state === 'loading') {
            // 资产字节数统一用 SW 的聚合进度，避免两个来源轮流覆盖导致百分比回跳。
            if (!hasAssetProgress) {
              setProgress(null);
              setStatus(t.statusStarting, 'loading');
            }
          } else if (status.state === 'ready') {
            setProgress(1);
            setStatus(t.statusLspReady, 'ready');
            log(t.logRuntimeReady);
            track('lsp_ready', { ms: runStartedAt ? performance.now() - runStartedAt : 0 });
          } else if (status.state === 'error') {
            setStatus(t.statusError(status.message), 'error');
            log(t.logRuntimeError(status.message));
            reportError('runtime', status.message);
          }
        },
      });
    },
    createConnection: (server) =>
      createMessageConnection(server.transport.reader, server.transport.writer),
    onDiagnostics: renderDiagnostics,
    onLog: log,
    // #check 的信息可能比 documentSymbol 晚几十毫秒，留一个静默窗口避免丢输出。
    diagnosticSettleMs: 300,
  });

  const lspRequest = async <T>(method: string, params: unknown): Promise<T | null> => {
    try {
      return await session.request<T>(method, params);
    } catch (error) {
      log(t.logRequestFailed(method, error instanceof Error ? error.message : String(error)));
      return null;
    }
  };

  const positionParams = (position: monaco.Position) => ({
    textDocument: { uri },
    position: { line: position.lineNumber - 1, character: position.column - 1 },
  });

  /**
   * 补全、悬停、跳转都基于 LSP 当前文档。编辑有 350ms 防抖，请求前必须先把
   * 未发送的改动刷过去，否则服务端会按旧文档计算（表现为刚输入 `.` 补全为空）。
   */
  const flushChange = () => {
    if (!session.isReady || !changePending) return;
    window.clearTimeout(debounceTimer);
    changePending = false;
    lastEditAt = performance.now();
    session.change(model.getValue());
  };

  monaco.languages.registerHoverProvider(LEAN_LANGUAGE_ID, {
    provideHover: async (_model, position) => {
      if (!(await session.whenReady())) return null;
      flushChange();
      const hover = await lspRequest<{
        contents:
          | string
          | { kind?: string; value: string }
          | Array<string | { kind?: string; value: string }>;
      }>('textDocument/hover', positionParams(position));
      log(t.logHover(position.lineNumber, position.column, Boolean(hover)));
      if (!hover?.contents) return null;

      const contents = (Array.isArray(hover.contents) ? hover.contents : [hover.contents]).map(
        (entry) => (typeof entry === 'string' ? { value: entry } : { value: entry.value }),
      );
      return { contents };
    },
  });

  monaco.languages.registerCompletionItemProvider(LEAN_LANGUAGE_ID, {
    triggerCharacters: ['.'],
    provideCompletionItems: async (completionModel, position) => {
      // 运行时就绪早于 LSP 初始化，启动窗口内的请求先等握手完成，避免空补全。
      if (!(await session.whenReady())) return { suggestions: [], incomplete: false };
      flushChange();
      const result = await lspRequest<LspCompletionResult>(
        'textDocument/completion',
        positionParams(position),
      );
      const word = completionModel.getWordUntilPosition(position);
      const fallback = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      const { suggestions, incomplete } = toMonacoCompletions(result, fallback);
      log(t.logCompletion(position.lineNumber, position.column, suggestions.length));
      return { suggestions, incomplete };
    },
  });

  monaco.languages.registerDefinitionProvider(LEAN_LANGUAGE_ID, {
    provideDefinition: async (_model, position) => {
      if (!(await session.whenReady())) return null;
      flushChange();
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
    scheduleDraftSave();
    disarmReset();
    // 改回 sorry 或删掉目标定理时立即收起徽章，不用等下一轮诊断。
    if (passedEl && exerciseStarter && !isExerciseSolved(code, model.getValue(), lastDiagnostics)) {
      passedEl.hidden = true;
    }
    if (suppressSync) return;
    changePending = true;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      if (!session.isReady) return;
      changePending = false;
      lastEditAt = performance.now();
      session.change(model.getValue());
    }, 350);
  });

  let goalSupported = true;
  let goalTimer: number | undefined;
  let suppressSync = false;

  /** 会话层等待启动、串行重开文档并收集诊断；这里只同步 Monaco 的内容。 */
  const run = (code: string) =>
    session.run(code, () => {
      if (runStartedAt === 0) runStartedAt = performance.now();
      suppressSync = true;
      model.setValue(code);
      suppressSync = false;
    });

  const requestGoal = async () => {
    if (!session.isReady || !goalSupported) return;
    flushChange();
    const position = editor.getPosition();
    if (!position) return;
    try {
      const result = await session.request<{ rendered?: string; goals?: string[] }>(
        '$/lean/plainGoal',
        positionParams(position),
      );
      const rendered = result?.rendered ? stripGoalFence(result.rendered) : '';
      const text = rendered || (result?.goals ?? []).join('\n\n').trim();
      if (text) {
        goalEl.textContent = text;
        return;
      }
      // 光标停在声明行时 Lean 还没有目标；如果证明体仍是 sorry，别显示成轻松的“没有 Goal”。
      const declaration = findDeclaration(model.getValue().split('\n'), position.lineNumber - 1);
      const atDeclarationHeader = declaration?.startLine === position.lineNumber - 1;
      goalEl.textContent =
        atDeclarationHeader && /\bsorry\b/.test(model.getValue()) ? t.goalHint : t.goalEmpty;
    } catch (error) {
      goalSupported = false;
      goalEl.textContent = t.goalUnsupported;
      log(t.logGoalFailed(error instanceof Error ? error.message : String(error)));
    }
  };

  editor.onDidChangeCursorPosition(() => {
    updateStatement();
    window.clearTimeout(goalTimer);
    goalTimer = window.setTimeout(requestGoal, 250);
  });

  /** 关闭引擎：终止 worker 并释放它占的内存，编辑器内容保留。 */
  const stop = () => {
    session.stop();
    goalSupported = true;
    runStartedAt = 0;
    firstDiagnosticsReported = false;
    if (runOkEl) runOkEl.hidden = true;
    setStatus(memoryTier === 'low' ? t.statusLowMemory : t.statusIdle, 'idle');
    setProgress(0);
    goalEl.textContent = t.goalPlaceholder;
    statementEl.hidden = true;
    startEl.textContent = t.start;
    log(t.logStopped);
  };

  const start = async () => {
    if (startEl.disabled) return;
    startEl.disabled = true;
    // 首次下载约 102 MB；在用户手势中申请持久存储，避免浏览器清理已校验的缓存。
    void navigator.storage?.persist?.().catch(() => {});
    setStatus(t.statusLoading, 'loading');
    setProgress(0);
    if (runOkEl) runOkEl.hidden = true;
    const startedAt = performance.now();
    runStartedAt = startedAt;
    firstDiagnosticsReported = false;
    assetTelemetry.started = false;
    assetTelemetry.completed = false;

    if ('serviceWorker' in navigator) {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
      ]);
    }

    if (new URLSearchParams(location.search).has('fresh')) {
      await clearRuntimeCache();
      log(t.logCacheCleared);
    }

    try {
      await session.start(model.getValue());
      // 启动期间用户可能已经改过代码；didOpen 用的是启动那一刻的内容，这里补一次同步。
      flushChange();
      startEl.textContent = t.stop;
      lastEditAt = performance.now();
      setStatus(t.statusWaitingDiagnostics, 'ready');
      log(t.logInitialize(((performance.now() - startedAt) / 1000).toFixed(2)));
      window.setTimeout(requestGoal, 800);
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      setStatus(t.statusFailure(message), 'error');
      log(t.logStartFailed(message));
      console.error(error);
      reportError('start', error);
    } finally {
      startEl.disabled = false;
    }
  };

  startEl.addEventListener('click', () => {
    if (session.isReady) stop();
    else void start();
  });

  // 开发环境与 ?debug 下暴露编辑器实例，方便控制台调试和自动化检查。
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    Object.assign(window as unknown as Record<string, unknown>, {
      __monaco: monaco,
      __editor: editor,
    });
  }

  if (autoStart && memoryTier !== 'low') {
    // 直接排一个短定时器：比 IntersectionObserver 更确定，也让下载尽早开始。
    window.setTimeout(() => {
      void start();
    }, 400);
  }

  window.addEventListener('pagehide', () => {
    saveDraftNow();
    session.stop();
    stopThemeSync();
    wideQuery.removeEventListener('change', applySplit);
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
    run,
    getProgress: () => ({ label: progressLabel, kind: progressKind, ratio: progressRatio }),
  };
};
