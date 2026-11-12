import {
  createLeanPanel,
  type LeanPanelProgress,
  type LspDiagnostic,
} from '../components/lean-panel';
import { buttonClass, ghostButtonClass } from '../components/ui';
import { currentMemoryTier, shouldAutoStart } from '../device';
import { messagesFor, type Locale } from '../i18n';
import type { LessonPage } from '../i18n/types';
import { markLessonVisited, readProgress } from '../progress';
import { escapeHtml } from './html';

const codeBlockOpen = 'overflow-hidden rounded-xl border border-line bg-panel-soft';

const codeBlockHead =
  'flex items-center justify-between gap-3 border-b border-line py-1.5 pl-3.5 pr-2 text-xs uppercase tracking-[0.06em] text-muted';

const tocLink = (active: boolean) =>
  active
    ? 'flex min-h-10 items-center rounded-lg bg-accent-soft px-2.5 py-2 text-[13px] leading-snug text-fg no-underline'
    : 'flex min-h-10 items-center rounded-lg px-2.5 py-2 text-[13px] leading-snug text-muted no-underline hover:bg-panel-soft hover:text-fg';

const noteClass = (tone: 'info' | 'warn' | undefined) =>
  tone === 'warn'
    ? 'my-5 rounded-lg border border-warn/45 bg-warn/10 px-4 py-3 text-[13.5px] leading-relaxed text-fg'
    : 'my-5 rounded-lg border border-line bg-panel-soft px-4 py-3 text-[13.5px] leading-relaxed text-muted';

/** 定位当前课时；slug 无效时回退到第一节，避免出现空白页。 */
const pickLesson = (lessons: LessonPage[], slug?: string): { page: LessonPage; index: number } => {
  const found = lessons.findIndex((lesson) => lesson.slug === slug);
  const index = found === -1 ? 0 : found;
  return { page: lessons[index]!, index };
};

const renderBlocks = (page: LessonPage, runLabel: string): { html: string; codeCount: number } => {
  let codeIndex = 0;

  const html = page.blocks
    .map((block) => {
      if (block.kind === 'p') {
        return `<p class="mt-0 mb-4 text-[15px] leading-[1.75] text-fg">${escapeHtml(block.text)}</p>`;
      }

      if (block.kind === 'note') {
        return `<div class="${noteClass(block.tone)}">${escapeHtml(block.text)}</div>`;
      }

      const index = codeIndex;
      codeIndex += 1;
      return `
        <div data-role="code-block" class="my-5 ${codeBlockOpen}">
          <div class="${codeBlockHead}">
            <span>Lean 4</span>
            <button class="${ghostButtonClass}" type="button" data-run-index="${index}">${escapeHtml(runLabel)}</button>
          </div>
          <pre class="m-0 overflow-auto px-4 py-3.5 font-mono text-[13.5px] leading-[1.65]"><code>${escapeHtml(block.code)}</code></pre>
          <div
            data-output="${index}"
            hidden
            class="border-t border-line bg-panel px-4 py-2.5 font-mono text-[12.5px] leading-[1.6] empty:hidden"
          ></div>
        </div>`;
    })
    .join('');

  return { html, codeCount: codeIndex };
};

export const renderLesson = (locale: Locale, slug?: string): string => {
  const t = messagesFor(locale).lesson;
  const { page, index } = pickLesson(t.lessons, slug);
  const prev = t.lessons[index - 1];
  const next = t.lessons[index + 1];
  const body = renderBlocks(page, t.runInEditor);

  const toc = t.lessons
    .map(
      (lesson, i) => `
      <li>
        <a class="${tocLink(i === index)}" data-lesson-slug="${lesson.slug}" href="/${locale}/learn/${lesson.slug}"${
          i === index ? ' aria-current="page"' : ''
        }>${escapeHtml(lesson.navTitle)}</a>
      </li>`,
    )
    .join('');

  const mobileToc = `
    <details class="group mb-6 rounded-xl border border-line bg-panel px-3 py-2 min-[1041px]:hidden">
      <summary class="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 text-sm text-fg [&::-webkit-details-marker]:hidden">
        <span>${escapeHtml(t.tocTitle)}</span>
        <span class="flex items-center gap-2 font-mono text-xs text-muted">${String(
          index + 1,
        ).padStart(2, '0')} / ${String(t.lessons.length).padStart(2, '0')}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-transform group-open:rotate-180"><path d="m3.5 5.5 3.5 3 3.5-3"/></svg>
        </span>
      </summary>
      <ol class="mb-1 mt-2 list-none space-y-0.5 p-0">${toc}</ol>
    </details>`;

  const pager = `
    <nav class="mt-12 flex items-start justify-between gap-4 border-t border-line pt-6">
      ${
        prev
          ? `<a class="group min-w-0 flex-1 rounded-lg py-1.5 no-underline" href="/${locale}/learn/${prev.slug}">
               <span class="block text-xs text-muted">← ${escapeHtml(t.prev)}</span>
               <span class="mt-1 block text-sm text-fg group-hover:text-accent">${escapeHtml(prev.navTitle)}</span>
             </a>`
          : '<span class="flex-1"></span>'
      }
      ${
        next
          ? `<a class="group block min-w-0 flex-1 rounded-lg py-1.5 text-right no-underline" href="/${locale}/learn/${next.slug}">
               <span class="block text-xs text-muted">${escapeHtml(t.next)} →</span>
               <span class="mt-1 block text-sm text-fg group-hover:text-accent">${escapeHtml(next.navTitle)}</span>
             </a>`
          : '<span class="flex-1"></span>'
      }
    </nav>`;

  const exercise = page.exercise
    ? `
      <section class="mt-8 rounded-2xl border border-accent bg-accent-soft p-6">
        <h2 class="mt-0 mb-2.5 text-lg font-bold">${escapeHtml(page.exercise.title)}</h2>
        <p class="mt-0 mb-4 text-muted">${escapeHtml(page.exercise.body)}</p>
        <a class="${buttonClass} max-[520px]:w-full" href="/${locale}/playground?lesson=${page.slug}">${escapeHtml(page.exercise.cta)}</a>
      </section>`
    : '';

  return `
    <div class="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-6 max-[1040px]:grid-cols-1">
      <nav class="sticky top-[84px] max-h-[calc(100vh-100px)] overflow-auto max-[1040px]:hidden" aria-label="${escapeHtml(t.tocTitle)}">
        <p class="m-0 mb-2 px-2.5 text-xs uppercase tracking-[0.08em] text-muted">${escapeHtml(t.tocTitle)}</p>
        <ol class="m-0 list-none space-y-0.5 p-0">${toc}</ol>
      </nav>

      <article class="min-w-0 max-w-[820px]">
        ${mobileToc}
        <header>
          <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${escapeHtml(t.eyebrow)}</p>
          <h1 class="mt-0 mb-3 text-[clamp(28px,4.2vw,40px)] tracking-[-0.015em]">${escapeHtml(page.title)}</h1>
          <p class="mt-0 mb-8 text-base leading-relaxed text-muted">${escapeHtml(page.lead)}</p>
        </header>
        ${body.html}
        ${exercise}
        ${pager}
      </article>
    </div>
    <div data-role="runner" class="sr-only" aria-hidden="true"></div>
  `;
};

const sevClass = (severity?: number) =>
  severity === 1 ? 'text-err' : severity === 2 ? 'text-warn' : 'text-muted';

const formatElapsed = (ms: number) =>
  ms < 60_000
    ? `${(ms / 1000).toFixed(1)}s`
    : `${Math.floor(ms / 60_000)}m ${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}s`;

const renderRunProgress = (label: string, ratio: number | null) => {
  const pending = ratio === null || ratio <= 0;
  const width = pending ? '' : `width:${Math.min(100, ratio * 100).toFixed(1)}%`;
  return `
    <div data-role="run-progress" class="flex flex-col gap-1.5 py-0.5">
      <div class="flex items-baseline justify-between gap-3 text-xs text-muted">
        <span data-role="run-label">${escapeHtml(label)}</span>
        <span data-role="run-time" class="font-mono tabular-nums">0.0s</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-line/70">
        <div
          data-role="run-bar"
          class="h-full rounded-full transition-[width] duration-200 ${
            pending ? 'run-bar-indeterminate' : 'bg-accent'
          }"
          ${width ? `style="${width}"` : ''}
        ></div>
      </div>
    </div>`;
};

const paintRunBar = (bar: HTMLElement, ratio: number | null) => {
  if (ratio === null || ratio <= 0) {
    bar.classList.add('run-bar-indeterminate');
    bar.classList.remove('bg-accent');
    bar.style.width = '';
    return;
  }
  bar.classList.remove('run-bar-indeterminate');
  bar.classList.add('bg-accent');
  bar.style.width = `${Math.min(100, ratio * 100).toFixed(1)}%`;
};

const renderOutput = (output: HTMLElement, list: LspDiagnostic[], emptyLabel: string) => {
  if (list.length === 0) {
    output.innerHTML = `<p class="m-0 text-muted">${escapeHtml(emptyLabel)}</p>`;
    return;
  }

  output.innerHTML = list
    .map((item) => {
      const at = `${item.range.start.line + 1}:${item.range.start.character + 1}`;
      return `<p class="m-0 mb-1 last:mb-0 ${sevClass(item.severity)}"><span class="mr-2 opacity-55">${at}</span>${escapeHtml(item.message)}</p>`;
    })
    .join('');
};

/** 证明类代码没有诊断就代表目标已关闭；换一句文案，避免新手以为「什么都没发生」。 */
const looksLikeProof = (code: string) => /^\s*(theorem|lemma|example)\b/m.test(code);

const ALREADY_DECLARED = /`([A-Za-z_][A-Za-z0-9_']*)` has already been declared/;

/**
 * @wasm-idle/lsp 的 FileWorker 偶发把同一份文档精化两次，只声明一次的名字会被报
 * 「already declared」。这里只过滤「代码里确实只出现一次」的重复声明；真重复仍然展示。
 */
export const dropSpuriousRedeclarations = (list: LspDiagnostic[], code: string): LspDiagnostic[] =>
  list.filter((item) => {
    const name = ALREADY_DECLARED.exec(item.message)?.[1];
    if (!name) return true;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const occurrences = code.match(new RegExp(`\\b${escaped}\\b`, 'g'))?.length ?? 0;
    return occurrences > 1;
  });

export const bindLesson = (root: HTMLElement, locale: Locale, slug?: string) => {
  const t = messagesFor(locale).lesson;
  const { page } = pickLesson(t.lessons, slug);

  // 进度只存在浏览器里：进入课程即记为已读，目录里给已读课时打勾。
  const visited = readProgress();
  markLessonVisited(page.slug);
  for (const link of root.querySelectorAll<HTMLAnchorElement>('[data-lesson-slug]')) {
    if (!visited.has(link.dataset.lessonSlug ?? '')) continue;
    const mark = document.createElement('span');
    mark.className = 'ml-auto pl-2 text-accent';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '✓';
    link.append(mark);
  }

  const codes = page.blocks.flatMap((block) => (block.kind === 'code' ? [block.code] : []));
  const runnerHost = root.querySelector<HTMLElement>('[data-role="runner"]');
  const first = codes[0];
  if (!runnerHost || first === undefined) return;

  const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  let reportProgress: ((progress: LeanPanelProgress) => void) | null = null;
  const panel = createLeanPanel(runnerHost, {
    variant: 'compact',
    // 预置空文档：课程页的代码块按需 run；预先塞入第一块会让它被声明一次，
    // 用户再点同一块时就变成「重复声明」。面板本身是 sr-only，空文档不影响阅读。
    code: '',
    locale,
    // 低内存设备与省流模式都不自动下载 143MB，让用户先确认。
    autoStart: shouldAutoStart(currentMemoryTier(), saveData === true),
    onProgress: (progress) => reportProgress?.(progress),
  });

  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-run-index]'));

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.runIndex);
      const code = codes[index];
      const output = root.querySelector<HTMLElement>(`[data-output="${index}"]`);
      if (code === undefined || !output) return;

      const initial = panel.getProgress();
      output.hidden = false;
      output.innerHTML = renderRunProgress(initial.label, initial.ratio);
      for (const other of buttons) other.disabled = true;

      const labelEl = output.querySelector<HTMLElement>('[data-role="run-label"]')!;
      const timeEl = output.querySelector<HTMLElement>('[data-role="run-time"]')!;
      const barEl = output.querySelector<HTMLElement>('[data-role="run-bar"]')!;
      const startedAt = performance.now();
      const tick = () => {
        timeEl.textContent = formatElapsed(performance.now() - startedAt);
      };
      tick();
      const timer = window.setInterval(tick, 100);

      let bestRatio = initial.ratio;
      reportProgress = (progress) => {
        labelEl.textContent = progress.kind === 'ready' ? t.running : progress.label;
        // 资产切换会让单资产百分比回落，课程页只展示本次运行的最高进度。
        if (progress.ratio !== null) bestRatio = Math.max(bestRatio ?? 0, progress.ratio);
        paintRunBar(barEl, bestRatio);
      };

      void panel
        .run(code)
        .then((list) => {
          renderOutput(
            output,
            dropSpuriousRedeclarations(list, code),
            looksLikeProof(code) ? t.proofAccepted : t.noOutput,
          );
        })
        .finally(() => {
          window.clearInterval(timer);
          reportProgress = null;
          for (const other of buttons) other.disabled = false;
        });
    });
  }
};
