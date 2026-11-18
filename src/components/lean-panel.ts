// editor.api 只带编辑器内核，不注册 80 多种内置语言，主包和内存都小得多。
import * as monaco from 'monaco-editor/editor/editor.api';
// 补全、悬停、查找等交互能力需要单独引入，见 monaco-contrib.ts。
import '../monaco-contrib';
import editorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { createMessageConnection } from 'vscode-jsonrpc/browser';
import LeanWorker from '../../node_modules/@wasm-idle/lsp/dist/lean4/worker.js?worker';
import { messagesFor, type Locale } from '../i18n';
import { setSourcePreference, type AssetSourcePreference } from '../asset-source';
import {
  cacheBudgetBytes,
  currentMemoryTier,
  DEFAULT_RUNTIME_ARCH,
  probeMemory64Support,
  WASM32_MEMORY_BYTES,
  wasm64MaxMemoryBytes,
  type LeanRuntimeArch,
} from '../device';
import {
  abbreviationSuggestions,
  findAbbreviationQuery,
  matchAbbreviation,
} from '../lean-abbreviations';
import { clearDraft, readDraft, saveDraft } from '../draft';
import { clearRuntimeCache } from '../runtime-cache';
import { isExerciseSolved, isExerciseStarter } from '../exercise';
import { findDeclaration } from '../lean-declaration';
import { isGoalMethodNotFound, isTransientGoalError, stripGoalFence } from '../lean-goal';
import { LEAN_LANGUAGE_ID, registerLean } from '../lean-language';
import { markLessonCompleted } from '../progress';
import {
  computeDiagnosticsLatencyMs,
  decideCrashRecovery,
  isAssetRelatedError,
  nextAutoRestartDelayMs,
  shouldPreserveDiagnosticsOnCrash,
  shouldShowRunPassed,
  supportsLeanRuntime,
} from '../lean-recovery';
import {
  anchorImportDiagnostics,
  extractImportLines,
  LeanSession,
  type LspDiagnostic,
} from '../lean-session';
import { createLeanMemoryGuard, sampleBrowserMemoryBytes } from '../lean-memory-guard';
import {
  getDefaultExtensions,
  getRuntimeArch,
  readRuntimeSession,
  setDefaultExtensions,
  setRuntimeArch,
  writeRuntimeSession,
} from '../settings';
import {
  loadExtensionPacks,
  resolveExtensionIds,
  runtimeExtensions,
  type ExtensionPacks,
  type RuntimeExtensionId,
} from '../runtime-extensions';
import { toMonacoCompletions, type LspCompletionResult } from '../lsp-completion';
import { reportError, track } from '../telemetry';
import { getResolvedTheme, onResolvedThemeChange } from '../theme';
import {
  diagnosticBadgeClass,
  diagnosticClass,
  diagnosticLocationClass,
  diagnosticMessageClass,
  mutedItemClass,
  renderLeanMarkup,
  type LeanPanelVariant,
} from './lean-markup';

(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

registerLean(monaco);

export type { LeanPanelVariant };

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
  /** 主包加载前用户已主动点过「启动 Lean」：挂载后立即启动（不延迟、不受低内存自动启动限制）。 */
  startImmediately?: boolean;
  /** 从课程练习进来时提供，用于显示「回到本课」并命名导出文件。 */
  lessonSlug?: string;
  /** 提供时按该 key 自动保存草稿，刷新后恢复。 */
  draftKey?: string;
  /** 启动与下载进度，供课程页在不可见面板外显示。 */
  onProgress?: (progress: LeanPanelProgress) => void;
  /** Goal 面板文本变化时回调；挑战页用它把 `⊢` 数量翻译成通俗进度。 */
  onGoal?: (goalText: string) => void;
  /** 课程代码依赖的扩展包；启动前自动挂载，用户无需手动开库。 */
  requiredExtensions?: RuntimeExtensionId[];
};

export type LeanPanel = {
  setCode: (code: string, options?: { focus?: boolean }) => void;
  getCode: () => string;
  focus: () => void;
  /** 在光标处插入策略片段，挑战页的快捷按钮使用。 */
  insert: (text: string) => void;
  /** 把代码送进语言服务器并等一次诊断结果，供课程页做内联输出。 */
  run: (code: string) => Promise<LspDiagnostic[]>;
  /** 读取当前进度快照，课程页点击运行时先回显已有状态。 */
  getProgress: () => LeanPanelProgress;
  /** 崩溃或手动关闭后重启引擎，编辑器内容保留。 */
  restart: () => Promise<boolean>;
};

export type { LspDiagnostic };

export const createLeanPanel = (host: HTMLElement, options: LeanPanelOptions): LeanPanel => {
  const {
    variant,
    code,
    locale,
    autoStart = false,
    startImmediately = false,
    lessonSlug,
    draftKey,
    onProgress,
    onGoal,
  } = options;
  const t = messagesFor(locale).playground;
  const memoryTier = currentMemoryTier();
  const memoryGuardMaxBytes = wasm64MaxMemoryBytes(memoryTier);
  // 默认保持稳定的 wasm32；wasm64 目前仅为实验性试用，不支持 Memory64 的浏览器安全回落 wasm32。
  const memory64Supported = probeMemory64Support();
  let selectedArch: LeanRuntimeArch =
    getRuntimeArch() === 'wasm64' && memory64Supported ? 'wasm64' : DEFAULT_RUNTIME_ARCH;
  const draft = draftKey ? readDraft(draftKey) : null;

  // 若 SSG 已渲染完整外框且无需动态挂载练习回链，复用原 DOM 保持首屏 H1/布局不被替换。
  const hasPrerendered =
    !lessonSlug &&
    host.querySelector<HTMLElement>('[data-ssr-markup]')?.dataset.ssrMarkup === variant;
  if (!hasPrerendered) {
    host.innerHTML = renderLeanMarkup(locale, variant, t, lessonSlug);
  }

  const statusEl = host.querySelector<HTMLElement>('[data-role="status"]')!;
  const startEl = host.querySelector<HTMLButtonElement>('[data-role="start"]')!;
  startEl.disabled = false;
  const barEl = host.querySelector<HTMLElement>('[data-role="bar"]')!;
  const logEl = host.querySelector<HTMLPreElement>('[data-role="log"]')!;
  const diagnosticsEl = host.querySelector<HTMLUListElement>('[data-role="diagnostics"]')!;
  const diagCountEl = host.querySelector<HTMLElement>('[data-role="count"]')!;
  const runOkEl = host.querySelector<HTMLElement>('[data-role="run-ok"]');
  const runOkTitleEl = host.querySelector<HTMLElement>('[data-role="run-ok-title"]');
  const runOkDetailEl = host.querySelector<HTMLElement>('[data-role="run-ok-detail"]');
  const crashEl = host.querySelector<HTMLElement>('[data-role="crash"]');
  const crashTitleEl = host.querySelector<HTMLElement>('[data-role="crash-title"]');
  const crashDetailEl = host.querySelector<HTMLElement>('[data-role="crash-detail"]');
  const crashRestartEl = host.querySelector<HTMLButtonElement>('[data-role="crash-restart"]');
  const crashCopyEl = host.querySelector<HTMLButtonElement>('[data-role="crash-copy"]');
  const loadFailureEl = host.querySelector<HTMLElement>('[data-role="load-failure"]');
  const loadFailureTitleEl = host.querySelector<HTMLElement>('[data-role="load-failure-title"]');
  const loadFailureDetailEl = host.querySelector<HTMLElement>('[data-role="load-failure-detail"]');
  const loadFailureErrorEl = host.querySelector<HTMLElement>('[data-role="load-failure-error"]');
  const loadFailureActionsEl = host.querySelector<HTMLElement>(
    '[data-role="load-failure-actions"]',
  );
  const retryLoadEl = host.querySelector<HTMLButtonElement>('[data-role="retry-load"]');
  const sourceButtons = [...host.querySelectorAll<HTMLButtonElement>('[data-source]')];
  const goalEl = host.querySelector<HTMLPreElement>('[data-role="goal"]')!;
  const setGoalText = (text: string) => {
    goalEl.textContent = text;
    onGoal?.(text);
  };
  const statementEl = host.querySelector<HTMLElement>('[data-role="goal-statement"]')!;
  const resetEl = host.querySelector<HTMLButtonElement>('[data-role="reset"]');
  const exportEl = host.querySelector<HTMLButtonElement>('[data-role="export"]');
  const passedEl = host.querySelector<HTMLElement>('[data-role="passed"]');

  // 先恢复分栏宽度、编辑器占比与面板显隐，再创建 Monaco，避免首帧后布局重排引发 CLS。
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
    // Hover / 补全等浮层用 fixed 定位，避免被编辑器容器的圆角与 overflow 裁剪。
    fixedOverflowWidgets: true,
    // 明确打开 Enter 上屏与触发字符补全，不依赖不同 Monaco 版本的默认值差异。
    acceptSuggestionOnEnter: 'on',
    suggestOnTriggerCharacters: true,
    quickSuggestions: { other: true, comments: false, strings: false },
    suggest: { selectionMode: 'always' },
  });
  editor.layout();
  // 首帧骨架覆盖在编辑器容器上，Monaco 挂载后立即移除，避免看到一片空白。
  host.querySelector('[data-role="editor-loading"]')?.remove();

  // Monaco 的 Enter 上屏依赖 HasFocusedSuggestion / MakesTextEdit 上下文键；
  // 自动触发的补全在部分版本里不会同时满足，表现为按 Enter 没反应。只要列表
  // 已有选中项，就用命令显式接受，和 Tab 的行为保持一致。
  const acceptSuggestionWithEnter = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    // fixedOverflowWidgets 可能把补全浮层挂到编辑器容器之外，按文档查找更稳。
    const widget = document.querySelector<HTMLElement>('.suggest-widget.visible');
    if (!widget?.querySelector('.monaco-list-row.focused')) return;
    event.preventDefault();
    event.stopPropagation();
    editor.trigger('keyboard', 'acceptSelectedSuggestion', {});
  };
  host.addEventListener('keydown', acceptSuggestionWithEnter, true);

  // Libraries 与 Panels 都是 <details>，同时打开会互相遮挡；<details> 本身也不会
  // 在点击外部时收起。这里保证同一时刻只开一个，并在点到菜单外时关掉。
  const menuEls = [
    ...host.querySelectorAll<HTMLDetailsElement>(
      'details[data-role="runtime-arch"], details[data-role="libraries"], details[data-role="panels"]',
    ),
  ];
  const closeMenus = (except?: HTMLDetailsElement) => {
    for (const menu of menuEls) {
      if (menu !== except && menu.open) menu.open = false;
    }
  };
  for (const menu of menuEls) {
    menu.addEventListener('toggle', () => {
      if (menu.open) closeMenus(menu);
    });
  }
  const onDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (target instanceof Node && menuEls.some((menu) => menu.open && menu.contains(target))) {
      return;
    }
    closeMenus();
  };
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeMenus();
  };
  // 捕获阶段先收起菜单，随后这次点击仍能落到编辑器并聚焦输入。
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeyDown);

  // 手机端没有 Ctrl+A/C/V：用编辑器顶部的触控工具栏补齐全选、复制、粘贴。
  // 桌面端由 CSS 隐藏，剪贴板仍走系统快捷键。异步读取剪贴板可能被浏览器拒绝，
  // 此时提示用户长按编辑区使用系统菜单，而不是静默失败。
  const mobileActions = host.querySelector<HTMLElement>('[data-role="mobile-actions"]');
  if (mobileActions) {
    const selectAllEl = mobileActions.querySelector<HTMLButtonElement>('[data-role="select-all"]');
    const copyEl = mobileActions.querySelector<HTMLButtonElement>('[data-role="copy-selection"]');
    const pasteEl = mobileActions.querySelector<HTMLButtonElement>('[data-role="paste"]');
    const hintEl = mobileActions.querySelector<HTMLElement>('[data-role="clip-hint"]');
    let hintTimer = 0;

    const showHint = (text: string) => {
      if (!hintEl) return;
      hintEl.textContent = text;
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => {
        hintEl.textContent = '';
      }, 2400);
    };

    const syncCopyState = () => {
      const selection = editor.getSelection();
      if (copyEl) copyEl.disabled = selection === null || selection.isEmpty();
    };
    syncCopyState();
    editor.onDidChangeCursorSelection(syncCopyState);

    selectAllEl?.addEventListener('click', () => {
      editor.setSelection(model.getFullModelRange());
      editor.focus();
    });

    copyEl?.addEventListener('click', async () => {
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) return;
      try {
        await navigator.clipboard.writeText(model.getValueInRange(selection));
        showHint(t.copied);
      } catch {
        showHint(t.clipboardFailed);
      }
    });

    pasteEl?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        const selection = editor.getSelection() ?? new monaco.Selection(1, 1, 1, 1);
        editor.executeEdits('mobile-paste', [{ range: selection, text, forceMoveMarkers: true }]);
        editor.focus();
        showHint(t.pasted);
      } catch {
        showHint(t.clipboardFailed);
      }
    });
  }

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
          // 用对象形式的 label：Monaco 才会把 description 显示在每一行，而不是只在选中行显示 detail。
          label: {
            label: `\\${name}`,
            description: `${symbol}\u2003\u2003${t.abbreviationDetail}`,
          },
          kind: monaco.languages.CompletionItemKind.Text,
          insertText: symbol,
          range,
          // 用表内顺序而不是字母序，先出现 \to / \forall 这类高频缩写。
          sortText: String(index).padStart(3, '0'),
        })),
      };
    },
  });

  // 练习工具条：重置先进入一次「确认重置？」状态，再点才覆盖代码，避免手滑。
  let resetArmed = false;
  let resetArmTimer: number | undefined;
  const disarmReset = () => {
    window.clearTimeout(resetArmTimer);
    resetArmed = false;
    if (!resetEl) return;
    delete resetEl.dataset.armed;
    resetEl.textContent = t.resetCode;
  };

  resetEl?.addEventListener('click', () => {
    if (!resetArmed) {
      if (model.getValue() === code) return;
      resetArmed = true;
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
  // 不用 blur 撤销确认：第二次点击同一按钮时浏览器会先派发 blur，再派发 click，
  // 状态在 click 前被清掉，确认分支永远走不到。改成点击按钮以外区域才撤销。
  const onResetPointerDown = (event: PointerEvent) => {
    if (!resetArmed) return;
    const target = event.target;
    if (target instanceof Node && resetEl?.contains(target)) return;
    disarmReset();
  };
  if (resetEl) document.addEventListener('pointerdown', onResetPointerDown, true);

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
    if (!exerciseStarter) return;
    const solved = isExerciseSolved(code, model.getValue(), list);
    if (passedEl) passedEl.hidden = !solved;
    // 从课程练习进入 playground 时带 lessonSlug：通过即写入完成进度。
    if (solved && lessonSlug) markLessonCompleted(lessonSlug);
  };

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
  // 成功提示必须等 documentSymbol 屏障和诊断静默窗口结束后再显示，避免先亮后灭。
  let successTimer: number | undefined;
  let settleTimer: number | undefined;
  let successSeq = 0;
  // 屏障不可用（请求失败、返回 null 或超时）时绝不误亮通过，只记录一次日志。
  let barrierFallbackLogged = false;
  let runBarrierDisabled = false;
  let fileProcessing = false;

  let progressLabel = t.statusIdle;
  let progressKind: LeanPanelProgressKind = 'idle';
  let progressRatio: number | null = null;
  let hasAssetProgress = false;

  // 观测用：一次启动只报一条 LSP 就绪、一条首帧诊断；资产进度只报首字节与完成。
  let runStartedAt = 0;
  let firstDiagnosticsReported = false;
  const assetTelemetry = { started: false, completed: false, startedAt: 0 };

  // 崩溃恢复：只自动重启一次；60 秒内再次崩溃就交给用户处理，避免崩溃循环。
  let engineEverReady = false;
  let recoveryPending = false;
  let recoveryAttempt = 0;
  let autoRecoverTimer: number | undefined;
  let autoStartTimer: number | undefined;
  let startInflight: Promise<boolean> | null = null;
  let lastCrashAt = 0;

  const cancelAutoRecover = () => {
    window.clearTimeout(autoRecoverTimer);
    autoRecoverTimer = undefined;
  };

  const cancelAutoStart = () => {
    window.clearTimeout(autoStartTimer);
    autoStartTimer = undefined;
  };
  let lastCrashMessage = '';
  let lastCrashedCode: string | null = null;
  let lastStartError: string | null = null;
  let lastAssetFallback: { name: string; message: string } | null = null;
  let freshHandled = false;

  const formatMb = (bytes: number): string => Math.round(bytes / (1024 * 1024)).toString();
  const memoryGuard = createLeanMemoryGuard({
    maxBytes: memoryGuardMaxBytes,
    sampleMemoryBytes: () => sampleBrowserMemoryBytes(),
    onPollError: (error) => {
      log(t.logRuntimeError(error instanceof Error ? error.message : String(error)));
    },
    onRecycle: ({ peakBytes, reason }) => {
      const mb = formatMb(peakBytes);
      if (reason === 'background-hidden') {
        if (!session.isReady) return;
        log(t.logMemoryBackgroundRelease(mb));
        stop();
        return;
      }
      if (!session.isReady || fileProcessing || startInflight) return;
      log(t.logMemorySoftRecycle(mb));
      stop();
      void start();
    },
    onHardLimit: ({ bytes, maxBytes }) => {
      const mb = formatMb(bytes);
      const limitMb = formatMb(maxBytes);
      log(t.logMemoryHardLimit(mb, limitMb));
      reportError('memory-limit', `${mb}/${limitMb} MB`);
      stop();
      setStatus(t.statusMemoryLimit, 'error');
    },
  });
  const onVisibilityChange = () => {
    memoryGuard.setVisible(document.visibilityState !== 'hidden');
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

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
  // 分片下载 Lean 资产，网关不可用时回退魔搭镜像，最后回退同源全量请求。
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
      lastAssetFallback = { name: data.name, message: data.message ?? 'unknown error' };
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

  const resetRunOk = () => {
    successSeq += 1;
    window.clearTimeout(successTimer);
    successTimer = undefined;
    window.clearTimeout(settleTimer);
    settleTimer = undefined;
    if (runOkEl) runOkEl.hidden = true;
  };

  /**
   * 诊断是分批到达的：第一批没有错误不代表整个文件通过。
   * 必须结合 $/lean/fileProgress 空闲与 documentSymbol 屏障，再等 150ms 静默才亮成功提示；
   * 屏障失败、超时或文件仍在处理中时，绝不能假显示“运行通过”。
   */
  const confirmRunSettled = async (seq: number, warningCount: number, latencyMs: number) => {
    if (variant !== 'full' || seq !== successSeq || !session.isReady || fileProcessing) return;
    let barrierOk = !runBarrierDisabled;
    if (barrierOk) {
      try {
        const result = await Promise.race([
          session.request('textDocument/documentSymbol', { textDocument: { uri } }),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000)),
        ]);
        if (result === null) barrierOk = false;
      } catch {
        barrierOk = false;
      }
    }
    if (seq !== successSeq || !session.isReady || fileProcessing) return;
    if (!barrierOk) {
      if (!barrierFallbackLogged) {
        barrierFallbackLogged = true;
        log(t.logRunBarrierFallback);
      }
      if (lastDiagnostics.length === 0) {
        setStatus(t.statusRunUnconfirmed, 'ready');
        const item = document.createElement('li');
        item.className = mutedItemClass;
        item.textContent = t.diagnosticsUnconfirmed;
        diagnosticsEl.replaceChildren(item);
      }
      return;
    }
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = undefined;
      if (seq !== successSeq || !session.isReady) return;
      if (!runOkEl || !runOkTitleEl || !runOkDetailEl) return;
      if (
        !shouldShowRunPassed({
          variant,
          barrierOk,
          fileProcessing,
          diagnostics: lastDiagnostics,
        })
      ) {
        return;
      }
      lastCrashedCode = null;
      runOkTitleEl.textContent = t.runPassed;
      runOkDetailEl.textContent = t.runPassedDetail(warningCount, latencyMs);
      runOkEl.hidden = false;
    }, 150);
  };

  const scheduleRunPassedCheck = (warningCount: number, latencyMs: number, delayMs = 200) => {
    if (variant !== 'full' || fileProcessing) return;
    const seq = successSeq;
    window.clearTimeout(successTimer);
    successTimer = window.setTimeout(() => {
      successTimer = undefined;
      void confirmRunSettled(seq, warningCount, latencyMs);
    }, delayMs);
  };

  const hideLoadFailure = () => {
    if (loadFailureEl) loadFailureEl.hidden = true;
  };

  const showLoadFailure = (message: string, compatibility = false) => {
    if (!loadFailureEl || !loadFailureTitleEl || !loadFailureDetailEl || !loadFailureErrorEl)
      return;
    const assetRelated = !compatibility && isAssetRelatedError(message);
    loadFailureTitleEl.textContent = compatibility
      ? t.compatibilityTitle
      : assetRelated
        ? t.loadFailureTitle
        : t.startFailureTitle;
    loadFailureDetailEl.textContent = compatibility
      ? t.compatibilityDetail
      : assetRelated
        ? t.loadFailureDetail
        : '';
    loadFailureDetailEl.hidden = !compatibility && !assetRelated;
    loadFailureErrorEl.textContent = compatibility
      ? message
      : lastAssetFallback
        ? `${message}\n${t.assetFallbackLabel(lastAssetFallback.name, lastAssetFallback.message)}`
        : message;
    if (loadFailureActionsEl) loadFailureActionsEl.hidden = compatibility;
    loadFailureEl.hidden = false;
  };

  let processingFallbackTimer: number | undefined;
  const clearProcessingFallback = () => {
    window.clearTimeout(processingFallbackTimer);
    processingFallbackTimer = undefined;
  };
  const finishFileProcessing = () => {
    if (!session.isReady) return;
    const errorCount = lastDiagnostics.filter(
      (diagnostic) => diagnostic.severity === 1 || diagnostic.severity === undefined,
    ).length;
    const warningCount = lastDiagnostics.filter((diagnostic) => diagnostic.severity === 2).length;
    const latency = computeDiagnosticsLatencyMs(lastEditAt, performance.now());
    if (diagnosticSeq > 0) {
      setStatus(t.statusReady(diagnosticSeq, latency), 'ready');
    }
    if (errorCount === 0 && runOkEl?.hidden) {
      scheduleRunPassedCheck(warningCount, latency, 150);
    }
  };
  // Lean 在“模块不存在”这类错误上偶尔只发一次开始通知、不发结束通知，
  // 状态胶囊会永远停在 Checking file...。收到诊断后兜底结束处理态。
  const scheduleProcessingFallback = () => {
    clearProcessingFallback();
    processingFallbackTimer = window.setTimeout(() => {
      processingFallbackTimer = undefined;
      if (!fileProcessing || !session.isReady) return;
      fileProcessing = false;
      finishFileProcessing();
    }, 2000);
  };

  const renderDiagnostics = (params: { uri: string; diagnostics: LspDiagnostic[] }) => {
    if (params.uri.toLowerCase() !== uri.toLowerCase()) return;

    // Lean 对无法解析的 import 可能只在 0:0 报错；锚定到真正的 import 行。
    const diagnostics = anchorImportDiagnostics(params.diagnostics, model.getValue());
    const latency = computeDiagnosticsLatencyMs(lastEditAt, performance.now());
    if (!firstDiagnosticsReported) {
      firstDiagnosticsReported = true;
      track('first_diagnostics', {
        ms: runStartedAt ? performance.now() - runStartedAt : 0,
        count: diagnostics.length,
      });
    }
    diagnosticSeq += 1;
    if (fileProcessing) {
      scheduleProcessingFallback();
      setStatus(t.statusChecking, 'ready');
    } else {
      clearProcessingFallback();
      setStatus(t.statusReady(diagnosticSeq, latency), 'ready');
    }

    monaco.editor.setModelMarkers(
      model,
      LEAN_LANGUAGE_ID,
      diagnostics.map((diagnostic) => ({
        severity: severityOf(diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source ?? 'Lean',
        startLineNumber: diagnostic.range.start.line + 1,
        startColumn: diagnostic.range.start.character + 1,
        endLineNumber: diagnostic.range.end.line + 1,
        endColumn: diagnostic.range.end.character + 1,
      })),
    );

    updatePassedBadge(diagnostics);
    lastDiagnostics = diagnostics;

    // 每批新诊断先收起旧的“运行通过”，等文件处理完再决定是否重新显示。
    resetRunOk();
    const errorCount = diagnostics.filter(
      (diagnostic) => diagnostic.severity === 1 || diagnostic.severity === undefined,
    ).length;
    const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === 2).length;
    if (variant === 'full' && errorCount === 0) {
      scheduleRunPassedCheck(warningCount, latency, 200);
    }

    diagnosticsEl.replaceChildren();
    diagCountEl.textContent = String(diagnostics.length);

    if (diagnostics.length === 0) {
      const item = document.createElement('li');
      item.className = mutedItemClass;
      item.textContent = t.statusNoDiagnostics(latency);
      diagnosticsEl.append(item);
      return;
    }

    for (const diagnostic of diagnostics) {
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

  // 扩展库按需下载：packs 常驻内存直到用户释放；每次变化都通过重开会话生效。
  const extensionPackCache = new Map<RuntimeExtensionId, ExtensionPacks>();
  const activeExtensions = new Set<RuntimeExtensionId>();
  let extensionPacks: ExtensionPacks = {};
  let libraryBusy = false;

  // 同一标签页内跨页面导航会销毁 worker；用 sessionStorage 记住上一页是否在运行
  // 以及已选库，回到编辑器页时自动恢复。刷新页面不算“切换页面”，避免覆盖
  // 用户关掉 auto-start 的选择。
  const savedSession = readRuntimeSession();
  const isRuntimeExtensionId = (id: string): id is RuntimeExtensionId =>
    runtimeExtensions.some((extension) => extension.id === id);
  const sessionExtensionIds = (savedSession?.extensions ?? []).filter(isRuntimeExtensionId);
  const requiredExtensionIds = options.requiredExtensions ?? [];
  // 勾选框决定每次启动默认挂载哪些库，持久化在 localStorage；上一页的库选择
  // 仍在 sessionStorage 里，导航回来时与默认值取并集恢复。
  const defaultExtensions = new Set<RuntimeExtensionId>(
    getDefaultExtensions().filter(isRuntimeExtensionId),
  );
  const isReloadNavigation = (): boolean => {
    try {
      const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      return entry?.type === 'reload';
    } catch {
      return false;
    }
  };
  const resumeRuntime = savedSession?.active === true && !isReloadNavigation();
  let desiredExtensions = new Set<RuntimeExtensionId>();
  let pendingSelection: Set<RuntimeExtensionId> | null = null;
  let restorePromise: Promise<void> | null = null;

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
        /**
         * ====================================================================
         * EXPERIMENTAL: wasm32 / wasm64 运行时双轨开关说明
         * --------------------------------------------------------------------
         * 1. 默认始终为稳定的 wasm32（1 GiB 线性内存上限，WASM32_MEMORY_BYTES）。
         * 2. wasm64 当前仍为实验性功能，可能存在不稳定、内存不释放或兼容性问题，
         *    切勿作为默认生产配置；目前站点内置资产包仍为 wasm32，用户切换为
         *    wasm64 时先应用实验标识与高位内存守卫策略，后续接入 wasm64 远端包后
         *    再按 selectedArch 分流 manifest。
         * ====================================================================
         */
        lean4: {
          maxMemoryBytes: WASM32_MEMORY_BYTES,
          ...(Object.keys(extensionPacks).length > 0
            ? { extensionPacks: extensionPacks as unknown as Record<string, ArrayBuffer> }
            : {}),
        },
        createWorker: () => {
          const worker = new LeanWorker();
          worker.addEventListener('message', (event: MessageEvent<{ memoryBytes?: unknown }>) => {
            if (typeof event.data?.memoryBytes === 'number') {
              memoryGuard.reportBytes(event.data.memoryBytes, 'event');
            }
          });
          return worker;
        },
        onStatus: (status) => {
          if (status.state === 'loading') {
            // 资产字节数统一用 SW 的聚合进度，避免两个来源轮流覆盖导致百分比回跳。
            // 首块分片可能几十秒才完成，这里保留 start() 的“加载运行时…”文案，
            // 不要提前写成“启动 LSP…”让人误以为下载已经结束。
            if (!hasAssetProgress) setProgress(null);
          } else if (status.state === 'ready') {
            engineEverReady = true;
            setProgress(1);
            setStatus(t.statusLspReady, 'ready');
            log(t.logRuntimeReady);
            track('lsp_ready', { ms: runStartedAt ? performance.now() - runStartedAt : 0 });
          } else if (status.state === 'error') {
            log(t.logRuntimeError(status.message));
            reportError('runtime', status.message);
            if (engineEverReady) {
              handleRuntimeCrash(status.message);
            } else {
              setStatus(t.statusError(status.message), 'error');
            }
          }
        },
      });
    },
    createConnection: (server) =>
      createMessageConnection(server.transport.reader, server.transport.writer),
    onDiagnostics: renderDiagnostics,
    onFileProgress: (params) => {
      if (params.uri.toLowerCase() !== uri.toLowerCase()) return;
      const wasProcessing = fileProcessing;
      fileProcessing = params.processingCount > 0;
      if (fileProcessing) {
        // 从开始处理那一刻就兜底计时：即使只收到开始通知、没有结束通知也
        // 能退出 Checking file...，不依赖诊断是否恰好在这一轮到达。
        scheduleProcessingFallback();
        memoryGuard.setProcessing(true);
        resetRunOk();
        if (session.isReady && diagnosticSeq > 0) {
          setStatus(t.statusChecking, 'ready');
        }
        return;
      }
      clearProcessingFallback();
      if (wasProcessing) finishFileProcessing();
      memoryGuard.setProcessing(false);
    },
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

  let lastSyncedImports = extractImportLines(model.getValue());

  const syncEditorChange = (): void => {
    if (!session.isReady) return;
    changePending = false;
    const nextCode = model.getValue();
    const nextImports = extractImportLines(nextCode);
    if (nextImports !== lastSyncedImports) {
      lastSyncedImports = nextImports;
      // 头部 import 变化会使整份 FileWorker 快照失效；若堆水位已过高，直接重建 Worker 顺手释放旧堆。
      if (memoryGuard.shouldRecycleOnImportChange()) {
        log(t.logMemoryImportRecycle(formatMb(memoryGuard.getSnapshot().peakBytes)));
        stop();
        void start();
        return;
      }
    }
    lastEditAt = performance.now();
    session.change(nextCode);
    memoryGuard.recordEdit();
  };

  /**
   * 补全、悬停、跳转都基于 LSP 当前文档。编辑有 350ms 防抖，请求前必须先把
   * 未发送的改动刷过去，否则服务端会按旧文档计算（表现为刚输入 `.` 补全为空）。
   */
  const flushChange = () => {
    if (!session.isReady || !changePending) return;
    window.clearTimeout(debounceTimer);
    syncEditorChange();
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

  // 面板第一行：光标所在声明的签名。与光标列位置无关，只在跨行或改代码时变化。
  let lastDeclVersion = -1;
  let lastDeclLine = -1;
  const updateStatement = () => {
    const position = editor.getPosition();
    if (!position) return;
    const version = model.getVersionId();
    if (version === lastDeclVersion && position.lineNumber === lastDeclLine) return;
    lastDeclVersion = version;
    lastDeclLine = position.lineNumber;
    const declaration = findDeclaration(model.getLinesContent(), position.lineNumber - 1);
    const text = declaration?.signature ?? '';
    if (statementEl.textContent !== text) {
      statementEl.textContent = text;
      statementEl.title = text;
    }
    statementEl.hidden = text === '';
  };

  updateStatement();

  model.onDidChangeContent(() => {
    lastCrashedCode = null;
    updateStatement();
    scheduleDraftSave();
    disarmReset();
    // 代码一改就收起旧的“运行通过”；等新诊断真正处理完再重新显示。
    resetRunOk();
    // 改回 sorry 或删掉目标定理时立即收起徽章，不用等下一轮诊断。
    if (passedEl && exerciseStarter && !isExerciseSolved(code, model.getValue(), lastDiagnostics)) {
      passedEl.hidden = true;
    }
    if (suppressSync) return;
    changePending = true;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(syncEditorChange, 350);
  });

  let goalSupported = true;
  let goalTimer: number | undefined;
  let goalRequestSeq = 0;
  let suppressSync = false;
  const GOAL_RETRY_DELAY_MS = 150;
  const GOAL_MAX_RETRIES = 2;

  /** 会话层等待启动、串行重开文档并收集诊断；这里只同步 Monaco 的内容。 */
  const run = (code: string) => {
    // 崩溃或启动失败后会话已释放，run 会立刻返回空数组；改成显式失败，课程页才能显示恢复按钮。
    if (recoveryPending) {
      return Promise.reject(new Error(lastCrashMessage || 'Lean process crashed'));
    }
    if (lastStartError) {
      return Promise.reject(new Error(lastStartError));
    }
    const crashAt = lastCrashAt;
    return session
      .run(code, () => {
        if (runStartedAt === 0) runStartedAt = performance.now();
        suppressSync = true;
        model.setValue(code);
        suppressSync = false;
        lastSyncedImports = extractImportLines(code);
      })
      .then((list) => {
        if (lastCrashAt !== crashAt) {
          throw new Error(lastCrashMessage || 'Lean process crashed');
        }
        return list;
      });
  };

  const requestGoal = async (attempt = 0) => {
    if (!session.isReady || !goalSupported) return;
    flushChange();
    const position = editor.getPosition();
    if (!position) return;
    const seq = ++goalRequestSeq;
    try {
      const result = await session.request<{ rendered?: string; goals?: string[] }>(
        '$/lean/plainGoal',
        positionParams(position),
      );
      if (seq !== goalRequestSeq) return;
      const rendered = result?.rendered ? stripGoalFence(result.rendered) : '';
      const text = rendered || (result?.goals ?? []).join('\n\n').trim();
      if (text) {
        setGoalText(text);
        return;
      }
      // 光标停在声明行时 Lean 还没有目标；如果证明体仍是 sorry，别显示成轻松的“没有 Goal”。
      const declaration = findDeclaration(model.getLinesContent(), position.lineNumber - 1);
      const atDeclarationHeader = declaration?.startLine === position.lineNumber - 1;
      setGoalText(
        atDeclarationHeader && /\bsorry\b/.test(model.getValue()) ? t.goalHint : t.goalEmpty,
      );
    } catch (error) {
      // 光标移动/新请求已取代这次请求时，迟到的错误不能影响当前面板。
      if (seq !== goalRequestSeq) return;
      const message = error instanceof Error ? error.message : String(error);
      if (isGoalMethodNotFound(error)) {
        goalSupported = false;
        setGoalText(t.goalUnsupported);
        log(t.logGoalFailed(message));
        return;
      }
      // 引擎重启时旧连接被替换、请求被取消都属于瞬态错误，短暂等待后重试；
      // 不能像 MethodNotFound 那样把 Goal 面板永久标成不支持。
      if (isTransientGoalError(error) && attempt < GOAL_MAX_RETRIES) {
        window.setTimeout(() => {
          if (seq !== goalRequestSeq || !session.isReady) return;
          void requestGoal(attempt + 1);
        }, GOAL_RETRY_DELAY_MS);
        return;
      }
      // 其余错误保留上一次目标内容，只记日志，避免误判。
      log(t.logGoalFailed(message));
    }
  };

  editor.onDidChangeCursorPosition(() => {
    updateStatement();
    window.clearTimeout(goalTimer);
    goalTimer = window.setTimeout(requestGoal, 250);
  });

  /** 关闭引擎：终止 worker 并释放它占的内存，编辑器内容保留。 */
  const stop = () => {
    cancelAutoStart();
    cancelAutoRecover();
    memoryGuard.reset();
    window.clearTimeout(debounceTimer);
    window.clearTimeout(goalTimer);
    session.stop();
    engineEverReady = false;
    recoveryPending = false;
    goalRequestSeq += 1;
    clearProcessingFallback();
    fileProcessing = false;
    lastCrashedCode = null;
    lastStartError = null;
    lastAssetFallback = null;
    if (crashEl) crashEl.hidden = true;
    hideLoadFailure();
    goalSupported = true;
    runStartedAt = 0;
    firstDiagnosticsReported = false;
    barrierFallbackLogged = false;
    hasAssetProgress = false;
    resetRunOk();
    setStatus(memoryTier === 'low' ? t.statusLowMemory : t.statusIdle, 'idle');
    setProgress(0);
    setGoalText(t.goalPlaceholder);
    statementEl.hidden = true;
    startEl.textContent = t.start;
    persistRuntimeSession(false);
    log(t.logStopped);
  };

  const runStart = async (): Promise<boolean> => {
    startEl.disabled = true;
    lastStartError = null;
    lastAssetFallback = null;
    hideLoadFailure();
    // 首次下载约 102 MB；在用户手势中申请持久存储，避免浏览器清理已校验的缓存。
    void navigator.storage?.persist?.().catch(() => {});
    setStatus(t.statusLoading, 'loading');
    setProgress(0);
    hasAssetProgress = false;
    goalRequestSeq += 1;
    clearProcessingFallback();
    fileProcessing = false;
    barrierFallbackLogged = false;
    resetRunOk();
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

    // ?fresh 只在本次页面生命周期里清一次；自动重启时不能再清缓存重新下载 102MB。
    if (!freshHandled && new URLSearchParams(location.search).has('fresh')) {
      freshHandled = true;
      await clearRuntimeCache();
      log(t.logCacheCleared);
    }

    try {
      const startCode = model.getValue();
      lastSyncedImports = extractImportLines(startCode);
      await session.start(startCode);
      // 启动期间用户可能已经改过代码；didOpen 用的是启动那一刻的内容，这里补一次同步。
      flushChange();
      startEl.textContent = t.stop;
      engineEverReady = true;
      lastStartError = null;
      hideLoadFailure();
      lastEditAt = performance.now();
      setStatus(t.statusWaitingDiagnostics, 'ready');
      persistRuntimeSession(true);
      log(t.logInitialize(((performance.now() - startedAt) / 1000).toFixed(2)));
      if (recoveryPending) {
        recoveryPending = false;
        recoveryAttempt = 0;
        if (crashEl) crashEl.hidden = true;
        if (crashRestartEl) crashRestartEl.disabled = false;
        log(t.logRecovered);
      }
      window.setTimeout(requestGoal, 800);
      return true;
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      lastStartError = message;
      persistRuntimeSession(false);
      // 自动重启第一次失败很常见：旧连接的 pending 请求刚被 reject。保留恢复状态并重试一次，
      // 不要立刻把“自动重启失败”推给用户。
      if (!recoveryPending || recoveryAttempt >= 1) {
        setStatus(t.statusFailure(message), 'error');
      }
      log(t.logStartFailed(message));
      console.error(error);
      reportError('start', error);
      if (recoveryPending && recoveryAttempt >= 1 && crashEl && crashTitleEl && crashDetailEl) {
        crashTitleEl.textContent = t.crashRestartFailed;
        crashDetailEl.textContent = t.crashAutoDetail(message);
        crashEl.hidden = false;
        if (crashRestartEl) crashRestartEl.disabled = false;
      } else if (!recoveryPending) {
        showLoadFailure(message);
      }
      return false;
    } finally {
      startInflight = null;
      startEl.disabled = false;
    }
  };

  const start = (): Promise<boolean> => {
    cancelAutoRecover();
    if (startInflight) return startInflight;
    // 部分安卓 WebView / 应用内浏览器没有 cross-origin isolation 或 SharedArrayBuffer。
    // 在进入 LSP 之前直接给出兼容性说明，避免反复启动、反复报错。
    if (!supportsLeanRuntime()) {
      const message = t.compatibilityError;
      lastStartError = message;
      setStatus(t.statusFailure(message), 'error');
      showLoadFailure(message, true);
      return Promise.resolve(false);
    }
    startInflight = (async () => {
      // 先恢复上一页选中的扩展库，确保 didOpen 时 extensionPacks 已经就绪。
      await restoreSavedExtensions();
      const started = await runStart();
      // 恢复期间用户可能已经点过库按钮，等这次启动结束后再串行处理排队的选择。
      void drainExtensionSelections();
      return started;
    })();
    return startInflight;
  };

  startEl.addEventListener('click', () => {
    if (session.isReady) stop();
    else void start();
  });

  // 扩展库开关：下载后重开会话挂载；释放时丢弃 SharedArrayBuffer 引用。
  const libraryButtons = [...host.querySelectorAll<HTMLButtonElement>('[data-library]')];
  const defaultCheckboxes = [...host.querySelectorAll<HTMLInputElement>('[data-library-default]')];
  const releaseAllEl = host.querySelector<HTMLButtonElement>('[data-role="release-all-libraries"]');

  const syncLibraryButtons = () => {
    for (const button of libraryButtons) {
      const id = button.dataset.library as RuntimeExtensionId;
      const active = activeExtensions.has(id);
      button.textContent = active ? t.libraryRelease : t.libraryLoad;
      button.dataset.state = active ? 'loaded' : 'idle';
      // 加载/重启期间保持可点：新的选择会排队，等当前重启结束后继续执行。
      button.disabled = false;
    }
    if (releaseAllEl) releaseAllEl.disabled = activeExtensions.size === 0;
  };

  const syncDefaultCheckboxes = () => {
    for (const input of defaultCheckboxes) {
      const id = input.dataset.libraryDefault as RuntimeExtensionId;
      input.checked = defaultExtensions.has(id);
    }
  };

  for (const input of defaultCheckboxes) {
    input.addEventListener('change', () => {
      const id = input.dataset.libraryDefault as RuntimeExtensionId;
      if (input.checked) {
        // 勾选 Batteries 时把依赖的 Std 一起勾上，避免启动时出现未勾选却已挂载。
        for (const dependency of resolveExtensionIds([id])) defaultExtensions.add(dependency);
      } else {
        defaultExtensions.delete(id);
        // 取消依赖库时，把依赖它的库一起取消。
        for (const extension of runtimeExtensions) {
          if (extension.requires.includes(id)) defaultExtensions.delete(extension.id);
        }
      }
      setDefaultExtensions(defaultExtensions);
      syncDefaultCheckboxes();
    });
  }
  syncDefaultCheckboxes();

  /**
   * ==========================================================================
   * EXPERIMENTAL: 手动切换 wasm32（默认生产）与 wasm64（实验试用）
   * --------------------------------------------------------------------------
   * 切勿默认启用 wasm64；不支持 Memory64 的浏览器禁用 wasm64 选项并给出明确提示。
   * ==========================================================================
   */
  const runtimeArchLabelEl = host.querySelector<HTMLElement>('[data-role="runtime-arch-label"]');
  const runtimeArchNoteEl = host.querySelector<HTMLElement>('[data-role="runtime-arch-note"]');
  const runtimeArchButtons = [...host.querySelectorAll<HTMLButtonElement>('[data-runtime-arch]')];

  const syncRuntimeArchUi = () => {
    if (runtimeArchLabelEl) {
      runtimeArchLabelEl.textContent = `${t.runtimeTitle}: ${selectedArch === 'wasm64' ? t.runtimeWasm64 : 'wasm32'}`;
    }
    for (const button of runtimeArchButtons) {
      const arch = button.dataset.runtimeArch as LeanRuntimeArch;
      const active = arch === selectedArch;
      button.dataset.active = String(active);
      button.setAttribute('aria-checked', String(active));
      if (arch === 'wasm64' && !memory64Supported) {
        button.disabled = true;
      }
    }
    if (runtimeArchNoteEl) {
      runtimeArchNoteEl.textContent = !memory64Supported
        ? t.runtimeWasm64Unsupported
        : selectedArch === 'wasm64'
          ? t.runtimeWasm64AssetNote
          : '';
    }
  };

  for (const button of runtimeArchButtons) {
    button.addEventListener('click', () => {
      const nextArch = button.dataset.runtimeArch as LeanRuntimeArch;
      if (nextArch === 'wasm64' && !memory64Supported) {
        log(t.runtimeWasm64Unsupported);
        syncRuntimeArchUi();
        return;
      }
      if (nextArch === selectedArch) return;
      selectedArch = nextArch;
      setRuntimeArch(nextArch);
      syncRuntimeArchUi();
      log(t.logRuntimeArchSelected(nextArch === 'wasm64' ? t.runtimeWasm64 : t.runtimeWasm32));
      if (nextArch === 'wasm64') log(t.runtimeWasm64AssetNote);
      closeMenus();
      if (session.isReady || startInflight) {
        stop();
        void start();
      }
    });
  }
  syncRuntimeArchUi();

  const persistRuntimeSession = (active: boolean) => {
    writeRuntimeSession({ active, extensions: [...activeExtensions] });
  };

  /**
   * 从上一页恢复已选扩展库。必须赶在会话创建 worker 之前完成，否则 didOpen
   * 拿不到 extensionPacks，页面看起来就像库被重置了。
   * 上一页选择、启动默认勾选与课程依赖都在启动时重新取，用户刚改过的勾选才能生效。
   */
  const restoreSavedExtensions = (): Promise<void> => {
    if (restorePromise) return restorePromise;
    const ids = resolveExtensionIds([
      ...sessionExtensionIds,
      ...defaultExtensions,
      ...requiredExtensionIds,
    ]);
    if (ids.length === 0) {
      restorePromise = Promise.resolve();
      return restorePromise;
    }
    restorePromise = (async () => {
      libraryBusy = true;
      syncLibraryButtons();
      // 恢复期间不允许点按钮，避免和即将开始的 runStart 抢同一个会话。
      for (const button of libraryButtons) button.disabled = true;
      setStatus(t.libraryRestarting, 'loading');
      try {
        for (const id of ids) {
          if (extensionPackCache.has(id)) continue;
          const packs = await loadExtensionPacks([id]);
          extensionPackCache.set(id, packs);
        }
        extensionPacks = Object.assign({}, ...ids.map((id) => extensionPackCache.get(id)));
        activeExtensions.clear();
        for (const id of ids) activeExtensions.add(id);
        desiredExtensions = new Set(activeExtensions);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(t.libraryError(message));
        writeRuntimeSession({ active: false, extensions: [] });
      } finally {
        libraryBusy = false;
        syncLibraryButtons();
      }
    })();
    return restorePromise;
  };

  const applyExtensionSelection = async (next: Set<RuntimeExtensionId>) => {
    const previous = new Set(activeExtensions);
    const resolved = resolveExtensionIds(next);
    const resolvedSet = new Set(resolved);
    const wasActive = session.isReady || session.state === 'starting';
    try {
      for (const id of resolved) {
        if (extensionPackCache.has(id)) continue;
        const packs = await loadExtensionPacks([id], (ratio) => {
          const button = libraryButtons.find((item) => item.dataset.library === id);
          if (button) button.textContent = t.libraryLoading(`${Math.round(ratio * 100)}%`);
        });
        extensionPackCache.set(id, packs);
      }
      // 释放的库必须同时丢掉缓存，否则 SharedArrayBuffer 仍被引用，内存没有真正归还。
      for (const id of [...extensionPackCache.keys()]) {
        if (!resolvedSet.has(id)) extensionPackCache.delete(id);
      }
      extensionPacks = Object.assign({}, ...resolved.map((id) => extensionPackCache.get(id)));
      activeExtensions.clear();
      for (const id of resolved) activeExtensions.add(id);
      desiredExtensions = new Set(activeExtensions);
      syncLibraryButtons();
      if (wasActive) {
        setStatus(t.libraryRestarting, 'loading');
        stop();
        await start();
      }
      persistRuntimeSession(session.isReady || session.state === 'starting');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(t.libraryError(message));
      setStatus(t.libraryError(message), 'error');
      // 回滚到上一次已生效的集合，避免留下半个扩展。
      for (const id of [...extensionPackCache.keys()]) {
        if (!previous.has(id)) extensionPackCache.delete(id);
      }
      extensionPacks = Object.assign(
        {},
        ...(previous.size ? [...previous].map((id) => extensionPackCache.get(id)) : []),
      );
      activeExtensions.clear();
      for (const id of previous) activeExtensions.add(id);
      desiredExtensions = new Set(activeExtensions);
      persistRuntimeSession(session.isReady || session.state === 'starting');
    }
  };

  /** 串行执行库变更；忙碌时只保留最后一次意图，避免连点触发多次重启。 */
  const drainExtensionSelections = async () => {
    if (libraryBusy) return;
    libraryBusy = true;
    syncLibraryButtons();
    try {
      while (pendingSelection) {
        const next = pendingSelection;
        pendingSelection = null;
        await applyExtensionSelection(next);
      }
    } finally {
      libraryBusy = false;
      syncLibraryButtons();
    }
  };

  const enqueueExtensionSelection = (next: Set<RuntimeExtensionId>) => {
    desiredExtensions = new Set(next);
    pendingSelection = new Set(next);
    // 用户手动选择优先于尚未开始的自动恢复。
    restorePromise ??= Promise.resolve();
    void drainExtensionSelections();
  };

  for (const button of libraryButtons) {
    button.addEventListener('click', () => {
      const id = button.dataset.library as RuntimeExtensionId;
      const next = new Set(desiredExtensions);
      if (next.has(id)) {
        next.delete(id);
        // 释放被依赖的库时，把依赖它的库一起释放。
        for (const extension of runtimeExtensions) {
          if (extension.requires.includes(id)) next.delete(extension.id);
        }
      } else {
        next.add(id);
      }
      enqueueExtensionSelection(next);
    });
  }

  // 单独提供“释放全部”，避免单个库的释放按钮误伤其他已加载的库。
  releaseAllEl?.addEventListener('click', () => {
    enqueueExtensionSelection(new Set());
  });
  syncLibraryButtons();

  /**
   * Lean worker 崩溃：释放旧会话、清掉过期诊断，并在 60 秒内首次崩溃时自动重启。
   * 连续崩溃不自动循环，避免把用户困在「崩溃—重启—再崩溃」里。
   */
  function handleRuntimeCrash(message: string) {
    const now = Date.now();
    const currentCode = model.getValue();
    const sameCodeAsLastCrash = lastCrashedCode !== null && currentCode === lastCrashedCode;
    // 同一次崩溃可能同时触发 onStatus 与 run 失败，2 秒内只处理第一条。
    // 栈溢出或同一份代码重复崩溃时不自动重启，避免陷入「通过 → 爆栈 → 重启」循环。
    const decision = decideCrashRecovery({
      variant,
      now,
      lastCrashAt,
      message,
      sameCodeAsLastCrash,
    });
    if (decision === 'ignore') return;
    const canAutoRestart = decision === 'auto';
    lastCrashAt = now;
    lastCrashMessage = message;
    lastCrashedCode = currentCode;
    goalRequestSeq += 1;
    clearProcessingFallback();
    fileProcessing = false;
    memoryGuard.reset();

    cancelAutoRecover();
    session.stop();
    engineEverReady = false;
    recoveryPending = true;
    recoveryAttempt = 0;
    persistRuntimeSession(false);
    runStartedAt = 0;
    firstDiagnosticsReported = false;
    lastStartError = null;
    lastAssetFallback = null;
    hideLoadFailure();
    startEl.textContent = t.start;
    setStatus(
      canAutoRestart ? t.statusRecovering : t.statusCrash,
      canAutoRestart ? 'loading' : 'error',
    );
    setProgress(0);
    hasAssetProgress = false;
    resetRunOk();
    setGoalText(t.goalPlaceholder);
    statementEl.hidden = true;
    // 崩溃或爆栈前已经诊断出来的错误/警告应保留展示，方便用户直接定位问题代码。
    if (!shouldPreserveDiagnosticsOnCrash(lastDiagnostics)) {
      diagnosticsEl.replaceChildren();
      const item = document.createElement('li');
      item.className = mutedItemClass;
      item.textContent = t.crashDiagnostics;
      diagnosticsEl.append(item);
      diagCountEl.textContent = '0';
      lastDiagnostics = [];
    }

    if (crashEl && crashTitleEl && crashDetailEl) {
      crashEl.hidden = false;
      crashTitleEl.textContent = canAutoRestart ? t.crashAutoTitle : t.crashLoopTitle;
      crashDetailEl.textContent = canAutoRestart
        ? t.crashAutoDetail(message)
        : t.crashLoopDetail(message);
    }
    if (crashRestartEl) crashRestartEl.disabled = canAutoRestart;
    if (crashCopyEl) crashCopyEl.textContent = t.copyError;

    log(t.logRuntimeCrash(message));
    reportError('runtime-crash', message);

    if (canAutoRestart) {
      const scheduleAutoRecover = (attempt: number) => {
        const delay = nextAutoRestartDelayMs(attempt);
        if (delay === null) {
          if (crashRestartEl) crashRestartEl.disabled = false;
          return;
        }
        recoveryAttempt = attempt;
        log(t.logAutoRestart);
        cancelAutoRecover();
        // 第一次等旧连接的 pending 请求结算后再启动；失败则再试一次，避免把瞬时竞态丢给用户。
        autoRecoverTimer = window.setTimeout(() => {
          autoRecoverTimer = undefined;
          if (!recoveryPending) return;
          void start().then((ok) => {
            if (ok || !recoveryPending) return;
            if (attempt === 0) {
              scheduleAutoRecover(1);
            } else if (crashRestartEl) {
              crashRestartEl.disabled = false;
            }
          });
        }, delay);
      };
      scheduleAutoRecover(0);
    }
  }

  crashRestartEl?.addEventListener('click', () => {
    cancelAutoRecover();
    crashRestartEl.disabled = true;
    recoveryPending = true;
    recoveryAttempt = 1;
    setStatus(t.statusRecovering, 'loading');
    void start().finally(() => {
      if (recoveryPending && crashRestartEl) crashRestartEl.disabled = false;
    });
  });

  crashCopyEl?.addEventListener('click', () => {
    void navigator.clipboard
      ?.writeText(lastCrashMessage)
      .then(() => {
        crashCopyEl.textContent = t.copyErrorDone;
        window.setTimeout(() => {
          crashCopyEl.textContent = t.copyError;
        }, 1600);
      })
      .catch(() => {
        // 剪贴板被浏览器拦截时保持原文案，用户仍可从日志复制。
      });
  });

  const sourceLabel = (mode: AssetSourcePreference): string => {
    if (mode === 'cdn') return t.sourceCdn;
    if (mode === 'mirror') return t.sourceMirror;
    if (mode === 'github') return t.sourceGithub;
    return t.sourceAuto;
  };

  const switchSource = (mode: AssetSourcePreference) => {
    const label = sourceLabel(mode);
    cancelAutoStart();
    cancelAutoRecover();
    for (const button of sourceButtons) button.disabled = true;
    hideLoadFailure();
    setStatus(t.sourceSwitching(label), 'loading');
    log(mode === null ? t.logSourceAuto : t.logSourceSwitched(label));
    void setSourcePreference(mode).finally(() => {
      for (const button of sourceButtons) button.disabled = false;
      void start();
    });
  };

  for (const button of sourceButtons) {
    button.addEventListener('click', () => {
      const raw = button.dataset.source ?? 'auto';
      switchSource(raw === 'auto' ? null : (raw as AssetSourcePreference));
    });
  }

  retryLoadEl?.addEventListener('click', () => {
    hideLoadFailure();
    void start();
  });

  // 开发环境与 ?debug 下暴露编辑器实例，方便控制台调试和自动化检查。
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    Object.assign(window as unknown as Record<string, unknown>, {
      __monaco: monaco,
      __editor: editor,
      // 仅用于自动化验证崩溃恢复与成功提示时序，不对普通用户暴露。
      __leanCrash: handleRuntimeCrash,
      __renderDiagnostics: renderDiagnostics,
      __showLoadFailure: showLoadFailure,
      __hideLoadFailure: hideLoadFailure,
      __skipRunBarrier: () => {
        runBarrierDisabled = true;
      },
    });
  }

  if (startImmediately) {
    void start();
  } else if (resumeRuntime) {
    // 从同一标签页的其他页面切回来：上一页运行过，直接恢复运行时和已选库。
    void start();
  } else if (autoStart && memoryTier !== 'low') {
    // 直接排一个短定时器：比 IntersectionObserver 更确定，也让下载尽早开始。
    autoStartTimer = window.setTimeout(() => {
      autoStartTimer = undefined;
      void start();
    }, 400);
  }

  window.addEventListener('pagehide', () => {
    cancelAutoStart();
    cancelAutoRecover();
    resetRunOk();
    window.clearTimeout(resetArmTimer);
    window.clearTimeout(draftTimer);
    window.clearTimeout(debounceTimer);
    window.clearTimeout(goalTimer);
    clearProcessingFallback();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    memoryGuard.dispose();
    host.removeEventListener('keydown', acceptSuggestionWithEnter, true);
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onDocumentKeyDown);
    document.removeEventListener('pointerdown', onResetPointerDown, true);
    saveDraftNow();
    // 正常导航离开时保留“运行中”，下一个编辑器页据此自动恢复；
    // 刷新页面由 isReloadNavigation 判定，不会触发自动启动。
    persistRuntimeSession(session.isReady || session.state === 'starting');
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
    insert: (text: string) => {
      const selection = editor.getSelection();
      if (!selection) return;
      editor.executeEdits('challenge-tactic', [{ range: selection, text, forceMoveMarkers: true }]);
      editor.focus();
    },
    run,
    getProgress: () => ({ label: progressLabel, kind: progressKind, ratio: progressRatio }),
    restart: async () => {
      cancelAutoStart();
      cancelAutoRecover();
      resetRunOk();
      session.stop();
      engineEverReady = false;
      recoveryPending = false;
      if (crashEl) crashEl.hidden = true;
      return start();
    },
  };
};
