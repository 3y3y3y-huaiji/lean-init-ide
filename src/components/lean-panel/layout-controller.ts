/**
 * 编辑器面板布局与菜单交互控制器：
 * 负责分栏高度/宽度持久化、面板显隐开关、以及顶栏 <details> 互斥菜单与视口防溢出。
 */
import type { LeanPanelVariant } from '../lean-markup';
import { computePopoverShift } from '../popover-position';

const LAYOUT_KEY = 'lean-panel:layout';
const PANELS_KEY = 'lean-panel:panels';
const DEFAULT_RATIO = 0.45;

type StoredLayout = {
  editorRatio: number;
  panelWidth: number | null;
  panels: Record<string, boolean>;
};

export type LayoutController = {
  readonly closeMenus: (except?: HTMLDetailsElement) => void;
  readonly dispose: () => void;
};

const readStoredLayout = (compact: boolean): StoredLayout => {
  const fallback: StoredLayout = {
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
    const panels = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') as Record<string, boolean>;
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
      panels: { ...fallback.panels, ...(panels && typeof panels === 'object' ? panels : {}) },
    };
  } catch {
    return fallback;
  }
};

const persistJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式下写入失败不影响当前内存态交互。
  }
};

const computeMaxPanelWidth = (workspaceEl: HTMLElement): number => {
  const style = window.getComputedStyle(workspaceEl);
  const contentWidth =
    workspaceEl.clientWidth -
    Number.parseFloat(style.paddingLeft || '0') -
    Number.parseFloat(style.paddingRight || '0');
  // 6px 分隔条 + 两段 16px gap + 编辑器至少 320px。
  return Math.max(300, contentWidth - 320 - 38);
};

export const createLayoutController = (
  host: HTMLElement,
  variant: LeanPanelVariant,
): LayoutController => {
  const layout = readStoredLayout(variant === 'compact');
  const cleanups: Array<() => void> = [];

  const editorWrap = host.querySelector<HTMLElement>('[data-role="editor-wrap"]');
  const resizeHandle = host.querySelector<HTMLElement>('[data-role="resize"]');
  const applyEditorRatio = (ratio: number) => {
    if (editorWrap) editorWrap.style.flex = `0 0 ${(ratio * 100).toFixed(2)}%`;
  };

  if (editorWrap && resizeHandle) {
    applyEditorRatio(layout.editorRatio);
    const onResizeDown = (event: PointerEvent) => {
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
        persistJson(LAYOUT_KEY, {
          editorRatio: layout.editorRatio,
          panelWidth: layout.panelWidth,
        });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    resizeHandle.addEventListener('pointerdown', onResizeDown);
    cleanups.push(() => resizeHandle.removeEventListener('pointerdown', onResizeDown));
  }

  // 完整编辑器允许拖动左右分栏；平板与窄屏（<=1024px）恢复单列，避免内联样式压过响应式布局。
  const workspaceEl = host.querySelector<HTMLElement>('[data-role="workspace"]');
  const splitHandle = host.querySelector<HTMLElement>('[data-role="split"]');
  const wideQuery = window.matchMedia?.('(min-width: 1025px)');
  const splitColumns = (width: number) => `minmax(0, 1fr) 6px ${width}px`;

  const applySplit = () => {
    if (!workspaceEl || !splitHandle || layout.panelWidth === null) return;
    if (!wideQuery?.matches) {
      workspaceEl.style.gridTemplateColumns = '';
      return;
    }
    const width = Math.min(layout.panelWidth, computeMaxPanelWidth(workspaceEl));
    workspaceEl.style.gridTemplateColumns = splitColumns(width);
  };
  applySplit();
  if (wideQuery) {
    wideQuery.addEventListener('change', applySplit);
    cleanups.push(() => wideQuery.removeEventListener('change', applySplit));
  }

  if (splitHandle && workspaceEl) {
    const onSplitDown = (event: PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const asideEl = host.querySelector<HTMLElement>('[data-role="aside"]');
      const startWidth = asideEl?.getBoundingClientRect().width ?? 340;
      const maxWidth = computeMaxPanelWidth(workspaceEl);
      const onMove = (moveEvent: PointerEvent) => {
        const next = startWidth + (startX - moveEvent.clientX);
        layout.panelWidth = Math.min(maxWidth, Math.max(300, next));
        if (wideQuery?.matches) {
          workspaceEl.style.gridTemplateColumns = splitColumns(layout.panelWidth);
        }
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        persistJson(LAYOUT_KEY, {
          editorRatio: layout.editorRatio,
          panelWidth: layout.panelWidth,
        });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    splitHandle.addEventListener('pointerdown', onSplitDown);
    cleanups.push(() => splitHandle.removeEventListener('pointerdown', onSplitDown));
  }

  for (const toggle of host.querySelectorAll<HTMLInputElement>('[data-panel-toggle]')) {
    const key = toggle.dataset.panelToggle ?? '';
    const target = host.querySelector<HTMLElement>(`[data-panel="${key}"]`);
    const visible = layout.panels[key] ?? true;
    toggle.checked = visible;
    if (target) target.hidden = !visible;
    const onChange = () => {
      if (target) target.hidden = !toggle.checked;
      layout.panels[key] = toggle.checked;
      persistJson(PANELS_KEY, layout.panels);
    };
    toggle.addEventListener('change', onChange);
    cleanups.push(() => toggle.removeEventListener('change', onChange));
  }

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
  const clampMenuPopover = (menu: HTMLDetailsElement) => {
    const popover = menu.querySelector<HTMLElement>('[data-role="menu-popover"]');
    if (!popover) return;
    popover.style.transform = '';
    if (!menu.open) return;
    const dx = computePopoverShift(popover.getBoundingClientRect(), window.innerWidth);
    if (Math.abs(dx) >= 0.5) {
      popover.style.transform = `translateX(${Math.round(dx)}px)`;
    }
  };
  const syncMenuPopover = (menu: HTMLDetailsElement) => {
    if (menu.open) closeMenus(menu);
    clampMenuPopover(menu);
  };
  const onWindowResize = () => {
    for (const menu of menuEls) {
      if (menu.open) clampMenuPopover(menu);
    }
  };
  window.addEventListener('resize', onWindowResize);
  cleanups.push(() => window.removeEventListener('resize', onWindowResize));

  for (const menu of menuEls) {
    const onToggle = () => syncMenuPopover(menu);
    menu.addEventListener('toggle', onToggle);
    cleanups.push(() => menu.removeEventListener('toggle', onToggle));
    const summary = menu.querySelector('summary');
    if (summary) {
      const onSummaryClick = (event: MouseEvent) => {
        event.preventDefault();
        menu.open = !menu.open;
        syncMenuPopover(menu);
      };
      summary.addEventListener('click', onSummaryClick);
      cleanups.push(() => summary.removeEventListener('click', onSummaryClick));
    }
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
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeyDown);
  cleanups.push(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onDocumentKeyDown);
  });

  return {
    closeMenus,
    dispose: () => {
      for (const cleanup of cleanups) cleanup();
    },
  };
};
