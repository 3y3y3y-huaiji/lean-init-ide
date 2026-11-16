import type { Locale } from '../i18n';
import runtimeManifest from '../../config/lean4-runtime.json';
import type { Messages } from '../i18n/types';
import { buttonClass, ghostButtonClass, toolbarButtonClass } from './ui';

const runtimeLabel = `${runtimeManifest.runtime.replace(/ Init$/, '')} · WebAssembly · Init only`;

export type LeanPanelVariant = 'full' | 'compact';

export const panelClass = (compact: boolean) =>
  `flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel ${
    compact ? 'max-h-[150px]' : 'max-[900px]:max-h-[320px]'
  }`;

export const panelHeadingClass =
  'm-0 flex items-center justify-between gap-2 border-b border-line px-3.5 py-[11px] text-xs font-[650] uppercase tracking-[0.07em] text-muted';

export const pillClass =
  'inline-block h-9 min-w-0 max-w-[220px] truncate rounded-full border border-line px-3 text-[13px] leading-[34px] text-muted data-[state=loading]:border-warn/45 data-[state=loading]:text-warn data-[state=ready]:border-ok/45 data-[state=ready]:text-ok data-[state=error]:border-err/45 data-[state=error]:text-err';

export const mutedItemClass = 'mb-1 px-2 py-2 text-[13px] text-muted';

export const diagnosticClass =
  'grid w-full [font:inherit] cursor-pointer grid-cols-[auto_auto_1fr] items-center gap-2 rounded-lg border border-line bg-transparent px-2 py-[7px] text-left text-fg hover:border-line-strong hover:bg-panel-soft';

/** LSP severity：1 错误、2 警告、3 信息、4 提示；#eval / #check 的输出属于 3。 */
export const diagnosticLocationClass = (severity?: number) =>
  `whitespace-nowrap font-mono text-xs leading-normal ${
    severity === 2
      ? 'text-warn'
      : severity === 1 || severity === undefined
        ? 'text-err'
        : 'text-accent'
  }`;

export const diagnosticBadgeClass = (severity?: number) =>
  `whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-[650] leading-none ${
    severity === 2
      ? 'border-warn/40 bg-warn/10 text-warn'
      : severity === 1 || severity === undefined
        ? 'border-err/40 bg-err/10 text-err'
        : 'border-accent/40 bg-accent-soft text-accent'
  }`;

export const diagnosticMessageClass = 'text-[13px] leading-normal';

const renderWorkspace = (t: Messages['playground'], compact: boolean) => `
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
          ? 'relative flex min-h-[130px] flex-col overflow-hidden rounded-xl border border-line bg-editor-bg'
          : 'relative flex h-[calc(100svh-292px)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-line bg-editor-bg max-[900px]:h-[52svh] max-[900px]:min-h-[360px]'
      }"
    >
      ${
        compact
          ? ''
          : `<div data-role="mobile-actions" class="flex shrink-0 items-center gap-1 border-b border-line bg-panel-soft px-2 py-1.5 min-[901px]:hidden">
               <button type="button" class="${toolbarButtonClass}" data-role="select-all">${t.selectAll}</button>
               <button type="button" class="${toolbarButtonClass}" data-role="copy-selection" disabled>${t.copySelection}</button>
               <button type="button" class="${toolbarButtonClass}" data-role="paste">${t.paste}</button>
               <span data-role="clip-hint" role="status" aria-live="polite" class="ml-1 min-w-0 truncate text-[11px] text-muted"></span>
             </div>`
      }
      <div class="relative min-h-0 flex-1 [contain:strict]" data-role="editor"></div>
    </section>
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
          : 'flex h-[calc(100svh-292px)] flex-col gap-4 max-[900px]:h-auto min-[901px]:min-h-[520px]'
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
          data-role="load-failure"
          hidden
          role="alert"
          class="mx-2 mt-2 rounded-lg border border-err/45 bg-err/10 px-2.5 py-2 text-[12.5px] leading-normal"
        >
          <p data-role="load-failure-title" class="m-0 font-[650] text-err"></p>
          <p data-role="load-failure-detail" class="mt-1 mb-2 text-[11.5px] leading-normal text-muted"></p>
          <p data-role="load-failure-error" class="m-0 mb-2 break-words font-mono text-[10.5px] leading-normal text-muted"></p>
          <div class="flex flex-wrap gap-2">
            <button class="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-[650] text-accent-contrast disabled:cursor-progress disabled:opacity-55" type="button" data-role="retry-load">${t.retryLoad}</button>
            <button class="cursor-pointer rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] text-fg hover:border-line-strong disabled:cursor-progress disabled:opacity-55" type="button" data-source="cdn">${t.sourceCdn}</button>
            <button class="cursor-pointer rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] text-fg hover:border-line-strong disabled:cursor-progress disabled:opacity-55" type="button" data-source="mirror">${t.sourceMirror}</button>
            <button class="cursor-pointer rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] text-fg hover:border-line-strong disabled:cursor-progress disabled:opacity-55" type="button" data-source="github">${t.sourceGithub}</button>
            <button class="cursor-pointer rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] text-muted hover:border-line-strong disabled:cursor-progress disabled:opacity-55" type="button" data-source="auto">${t.sourceAuto}</button>
          </div>
        </div>
        <div
          data-role="crash"
          hidden
          role="alert"
          class="mx-2 mt-2 rounded-lg border border-err/45 bg-err/10 px-2.5 py-2 text-[12.5px] leading-normal"
        >
          <p data-role="crash-title" class="m-0 font-[650] text-err"></p>
          <p data-role="crash-detail" class="mt-1 mb-2 text-[11.5px] leading-normal text-muted"></p>
          <div class="flex flex-wrap gap-2">
            <button class="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-[650] text-accent-contrast disabled:cursor-progress disabled:opacity-55" type="button" data-role="crash-restart">${t.restartLean}</button>
            <button class="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-fg" type="button" data-role="crash-copy">${t.copyError}</button>
          </div>
        </div>
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

export const renderLeanMarkup = (
  locale: Locale,
  variant: LeanPanelVariant,
  t: Messages['playground'],
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
      <section data-ssr-markup="full" class="flex min-h-[calc(100svh-61px)] flex-col max-[900px]:min-h-0">
        <div
          class="flex items-end justify-between gap-4 border-b border-line gutter-x pb-3 pt-5 max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-3"
        >
          <div class="min-w-0">
            <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${runtimeLabel}</p>
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
    <section data-ssr-markup="compact" class="flex h-full flex-col overflow-hidden rounded-[14px] border border-line bg-panel">
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
