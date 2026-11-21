import type { LeanPanel, LeanPanelProgress, LspDiagnostic } from '../components/lean-panel';
import { anchorImportDiagnostics } from '../lean-session';
import { buttonClass, ghostButtonClass } from '../components/ui';
import { currentMemoryTier, shouldAutoStart } from '../device';
import { issueUrl } from '../feedback';
import { lessonsFor, messagesFor, type Locale } from '../i18n';
import type { LessonLibrary, LessonPage, LessonTrack } from '../i18n/types';
import { markLessonVisited, readCompleted } from '../progress';
import { escapeHtml, renderInlineCode } from './html';
import {
  extractStructuredGoalSteps,
  formatGoalStepText,
  type LessonGoalStep,
} from './lesson-goal-steps';

const codeBlockOpen = 'overflow-hidden rounded-xl border border-line bg-panel-soft';

const codeBlockHead =
  'flex items-center justify-between gap-3 border-b border-line py-1.5 pl-3.5 pr-2 text-xs uppercase tracking-[0.06em] text-muted';

const tocLink = (active: boolean) =>
  active
    ? 'flex min-h-10 max-[1024px]:min-h-11 touch:min-h-11 items-center rounded-lg bg-accent-soft px-2.5 py-2 text-[13px] leading-snug text-fg no-underline'
    : 'flex min-h-10 max-[1024px]:min-h-11 touch:min-h-11 items-center rounded-lg px-2.5 py-2 text-[13px] leading-snug text-muted no-underline hover:bg-panel-soft hover:text-fg';

const noteClass = (tone: 'info' | 'warn' | undefined) =>
  tone === 'warn'
    ? 'my-5 rounded-lg border border-warn/45 bg-warn/10 px-4 py-3 text-[13.5px] leading-relaxed text-fg'
    : 'my-5 rounded-lg border border-line bg-panel-soft px-4 py-3 text-[13.5px] leading-relaxed text-muted';

/** 定位当前课时；slug 无效时回退到第一节，避免出现空白页。 */
const pickLesson = (
  lessons: readonly LessonPage[],
  slug?: string,
): { page: LessonPage; index: number } => {
  const found = lessons.findIndex((lesson) => lesson.slug === slug);
  const index = found === -1 ? 0 : found;
  return { page: lessons[index]!, index };
};

/** 课程代码是否真的依赖扩展分包；只有命中的课才值得预加载 Std / Batteries。 */
const needsExtensionPacks = (page: LessonPage): boolean =>
  (page.requires?.length ?? 0) > 0 ||
  page.blocks.some(
    (block) => block.kind === 'code' && /import\s+(?:Std|Batteries)\./.test(block.code),
  ) ||
  /import\s+(?:Std|Batteries)\./.test(page.exercise?.starter ?? '');

type LiveGoalPanelTone = 'live' | 'ok' | 'error' | 'info';

export type LiveGoalPanelState = {
  badge: string;
  text: string;
  tone: LiveGoalPanelTone;
};

/** 从本课 Goal 旁白块提取可逐步切换的 Goal 演练步骤（向后兼容旧版字符串格式）。 */
export const extractLessonGoalSteps = (page: LessonPage): string[] =>
  extractStructuredGoalSteps(page).map(formatGoalStepText);

/** 从课程代码块的运行诊断中提取实时 Goal 状态（未解决目标或证明完成）。 */
export const extractLiveLessonGoal = (
  diagnostics: readonly LspDiagnostic[],
  code: string,
  proofNoGoalLabel: string,
): string | null => {
  const withGoal = diagnostics.find(
    (item) =>
      item.severity === 1 && (item.message.includes('⊢') || /unsolved goals/i.test(item.message)),
  );
  if (withGoal) return withGoal.message.trim();
  const hasError = diagnostics.some((item) => item.severity === 1);
  if (!hasError && looksLikeProof(code)) return proofNoGoalLabel;
  return null;
};

const formatGoalPanelDiagnostics = (diagnostics: readonly LspDiagnostic[]): string =>
  diagnostics
    .map((item) => {
      const at = `${item.range.start.line + 1}:${item.range.start.character + 1}`;
      return `${at} ${item.message.trim()}`;
    })
    .join('\n\n');

/** 将单次代码块运行的诊断整理为右侧 Goal 面板展示状态。 */
export const resolveLiveLessonGoalPanelState = (
  diagnostics: readonly LspDiagnostic[],
  code: string,
  labels: Pick<
    ReturnType<typeof messagesFor>['lesson'],
    'goalLive' | 'goalNoRemaining' | 'goalError' | 'goalOutput' | 'noOutput'
  >,
): LiveGoalPanelState => {
  const liveGoal = extractLiveLessonGoal(diagnostics, code, labels.goalNoRemaining);
  if (liveGoal) {
    return {
      badge: labels.goalLive,
      text: liveGoal,
      tone: liveGoal === labels.goalNoRemaining ? 'ok' : 'live',
    };
  }
  const errors = diagnostics.filter((item) => item.severity === 1);
  if (errors.length > 0) {
    return {
      badge: labels.goalError,
      text: formatGoalPanelDiagnostics(errors),
      tone: 'error',
    };
  }
  if (diagnostics.length > 0) {
    return {
      badge: labels.goalOutput,
      text: formatGoalPanelDiagnostics(diagnostics),
      tone: 'info',
    };
  }
  return {
    badge: labels.goalOutput,
    text: labels.noOutput,
    tone: 'info',
  };
};

const codeLineClass = (linked: boolean, active: boolean): string => {
  const base = 'block min-h-[1.65em] border-l-2 px-4 transition-colors';
  if (active) {
    return `${base} border-accent bg-accent-soft text-fg${linked ? ' cursor-pointer' : ''}`;
  }
  if (linked) {
    return `${base} cursor-pointer border-accent/30 hover:bg-accent-soft/50`;
  }
  return `${base} border-transparent`;
};

const goalTextBoxClass = (tone?: LiveGoalPanelTone): string => {
  const base =
    'm-0 max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-lg border px-3 py-2.5 font-mono text-[12.5px] leading-[1.65]';
  if (tone === 'ok') return `${base} border-ok/45 bg-ok/10 text-fg`;
  if (tone === 'error') return `${base} border-err/45 bg-err/10 text-err`;
  if (tone === 'live') return `${base} border-accent/40 bg-panel-soft text-fg`;
  return `${base} border-line bg-panel-soft text-fg`;
};

const goalBadgeClass = (tone?: LiveGoalPanelTone): string => {
  const base = 'font-mono text-xs tabular-nums';
  if (tone === 'ok') return `${base} text-ok`;
  if (tone === 'error') return `${base} text-err`;
  if (tone === 'info') return `${base} text-muted`;
  return `${base} text-accent`;
};

const renderBlocks = (
  page: LessonPage,
  runLabel: string,
  goalLabel: string,
  goalSteps: readonly LessonGoalStep[],
): { html: string; codeCount: number } => {
  const stepIndicesByCodeLine = new Map<string, number[]>();
  goalSteps.forEach((step, stepIndex) => {
    if (step.codeIndex === null || step.lineIndex === null) return;
    const key = `${step.codeIndex}:${step.lineIndex}`;
    const bucket = stepIndicesByCodeLine.get(key) ?? [];
    bucket.push(stepIndex);
    stepIndicesByCodeLine.set(key, bucket);
  });
  const firstStep = goalSteps[0];

  let codeIndex = 0;

  const html = page.blocks
    .map((block) => {
      if (block.kind === 'p') {
        return `<p class="mt-0 mb-4 text-[15px] leading-[1.75] text-fg">${renderInlineCode(block.text)}</p>`;
      }

      if (block.kind === 'goal') {
        return `
          <div class="my-5 rounded-xl border border-line bg-panel-soft px-4 py-3">
            <p class="m-0 mb-2 text-xs font-[650] uppercase tracking-[0.08em] text-muted">${escapeHtml(goalLabel)}</p>
            <pre class="m-0 overflow-auto whitespace-pre-wrap font-mono text-[12.5px] leading-[1.7] text-fg"><code>${escapeHtml(block.text)}</code></pre>
          </div>`;
      }

      if (block.kind === 'details') {
        return `
          <details class="my-4 rounded-lg border border-line bg-panel-soft px-4 py-3">
            <summary class="flex min-h-9 max-[1024px]:min-h-11 touch:min-h-11 cursor-pointer items-center text-[13px] font-semibold text-fg">${renderInlineCode(block.summary)}</summary>
            <p class="mb-0 mt-2 text-[13.5px] leading-relaxed text-muted">${renderInlineCode(block.text)}</p>
          </details>`;
      }

      if (block.kind === 'note') {
        return `<div class="${noteClass(block.tone)}">${renderInlineCode(block.text)}</div>`;
      }

      const index = codeIndex;
      codeIndex += 1;
      const linesHtml = block.code
        .split('\n')
        .map((line, lineIdx) => {
          const boundSteps = stepIndicesByCodeLine.get(`${index}:${lineIdx}`);
          const isInitialActive =
            firstStep !== undefined &&
            firstStep.codeIndex === index &&
            firstStep.lineIndex === lineIdx;
          const stepAttr = boundSteps
            ? ` data-step-index="${boundSteps[0]}" data-step-indices="${boundSteps.join(',')}"`
            : '';
          const activeAttr = isInitialActive ? ' data-active-line="true"' : '';
          return `<span data-code-line="${lineIdx}"${stepAttr}${activeAttr} class="${codeLineClass(
            Boolean(boundSteps),
            isInitialActive,
          )}">${line.length > 0 ? escapeHtml(line) : ' '}</span>`;
        })
        .join('');
      return `
        <div data-role="code-block" data-code-index="${index}" class="my-5 ${codeBlockOpen}">
          <div class="${codeBlockHead}">
            <span>Lean 4</span>
            <button class="${ghostButtonClass}" type="button" data-run-index="${index}">${escapeHtml(runLabel)}</button>
          </div>
          <pre class="m-0 overflow-auto py-3.5 font-mono text-[13.5px] leading-[1.65]"><code class="block">${linesHtml}</code></pre>
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
  const lessons = lessonsFor(locale);
  const { page, index } = pickLesson(lessons, slug);
  const prev = lessons[index - 1];
  const next = lessons[index + 1];
  const goalSteps = extractStructuredGoalSteps(page);
  const body = renderBlocks(page, t.runInEditor, t.goalLabel, goalSteps);

  const trackOf = (lesson: LessonPage): LessonTrack => lesson.track ?? 'intro';
  const toc = (['intro', 'math', 'eng'] as const)
    .map((track) => {
      const entries = lessons
        .map((lesson, i) => ({ lesson, i }))
        .filter(({ lesson }) => trackOf(lesson) === track);
      if (entries.length === 0) return '';
      const heading = `<li class="mt-2 px-2.5 pb-1 pt-2 text-xs font-[650] uppercase tracking-[0.08em] text-muted first:mt-0 first:pt-0">${escapeHtml(t.tracks[track].title)}</li>`;
      return (
        heading +
        entries
          .map(
            ({ lesson, i }) => `
      <li>
        <a class="${tocLink(i === index)}" data-lesson-slug="${lesson.slug}" href="/${locale}/learn/${lesson.slug}"${
          i === index ? ' aria-current="page"' : ''
        }>${escapeHtml(lesson.navTitle)}</a>
      </li>`,
          )
          .join('')
      );
    })
    .join('');

  const mobileToc = `
    <details class="group mb-6 rounded-xl border border-line bg-panel px-3 py-2 min-[1041px]:hidden">
      <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 text-sm text-fg [&::-webkit-details-marker]:hidden">
        <span>${escapeHtml(t.tocTitle)}</span>
        <span class="flex items-center gap-2 font-mono text-xs text-muted">${String(
          index + 1,
        ).padStart(2, '0')} / ${String(lessons.length).padStart(2, '0')}
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
        <div class="mb-2.5 flex flex-wrap items-center gap-2">
          <h2 class="m-0 text-lg font-bold">${escapeHtml(page.exercise.title)}</h2>
          <span data-role="exercise-status" hidden></span>
        </div>
        <p class="mt-0 mb-4 text-muted">${renderInlineCode(page.exercise.body)}</p>
        ${
          page.requires?.length
            ? `<p class="mt-0 mb-4 font-mono text-xs text-accent">${escapeHtml(
                t.requiresHint(
                  page.requires.map((id) => (id === 'std' ? 'Std' : 'Batteries')).join(' / '),
                ),
              )}</p>`
            : ''
        }
        ${
          page.exercise.hint
            ? `<details class="mb-4 rounded-lg border border-line bg-panel px-4 py-3">
                 <summary class="flex min-h-9 max-[1024px]:min-h-11 touch:min-h-11 cursor-pointer items-center text-[13px] font-semibold text-fg">${escapeHtml(t.hintLabel)}</summary>
                 <p class="mb-0 mt-2 text-[13.5px] leading-relaxed text-muted">${renderInlineCode(page.exercise.hint)}</p>
               </details>`
            : ''
        }
        <a class="${buttonClass} max-[520px]:w-full" href="/${locale}/playground?lesson=${page.slug}">${escapeHtml(page.exercise.cta)}</a>
      </section>`
    : '';

  const feedbackBody = `Lesson: ${page.slug}\nPath: /${locale}/learn/${page.slug}\n\n`;
  const feedbackTitle = t.feedbackIssueTitle(page.title);
  const feedback = `
    <div class="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <span class="mr-1 text-xs text-muted">${escapeHtml(t.feedbackHint)}</span>
      <a class="${ghostButtonClass}" target="_blank" rel="noopener noreferrer" href="${escapeHtml(
        issueUrl('clarity-gap.yml', { title: feedbackTitle, body: feedbackBody }),
      )}">${escapeHtml(t.feedbackClarity)}</a>
      <a class="${ghostButtonClass}" target="_blank" rel="noopener noreferrer" href="${escapeHtml(
        issueUrl('lesson-bug.yml', { title: feedbackTitle, body: feedbackBody }),
      )}">${escapeHtml(t.feedbackBug)}</a>
    </div>`;

  const firstStep = goalSteps[0];
  const initialLocation =
    firstStep && firstStep.codeIndex !== null && firstStep.lineIndex !== null
      ? t.goalLocation(firstStep.codeIndex + 1, firstStep.lineIndex + 1)
      : '';
  const hasLinkedLines = goalSteps.some((step) => step.lineIndex !== null);
  const goalPanel = `
      <aside
        data-role="lesson-goal-panel"
        data-panel="goal"
        data-goal-steps="${escapeHtml(JSON.stringify(goalSteps))}"
        data-goal-step="0"
        class="sticky top-[84px] overflow-hidden rounded-xl border border-line bg-panel max-[1040px]:static"
      >
        <div class="flex items-center justify-between gap-2 border-b border-line px-3.5 py-[11px]">
          <h2 class="m-0 text-xs font-[650] uppercase tracking-[0.07em] text-muted">${escapeHtml(t.goalPanelTitle)}</h2>
          <span data-role="lesson-goal-badge" class="${goalBadgeClass()}">${
            goalSteps.length > 0 ? escapeHtml(t.goalStepLabel(1, goalSteps.length)) : ''
          }</span>
        </div>
        <div class="p-3.5">
          <p
            data-role="lesson-goal-step-label"
            ${initialLocation ? '' : 'hidden'}
            class="mt-0 mb-2 font-mono text-[11px] text-muted"
          >${escapeHtml(initialLocation)}</p>
          <pre
            data-role="lesson-goal-text"
            class="${goalTextBoxClass()}"
          >${escapeHtml(firstStep?.goal ?? t.goalNoRemaining)}</pre>
          <p
            data-role="lesson-goal-note"
            ${firstStep?.note ? '' : 'hidden'}
            class="mt-2.5 mb-0 rounded-lg border border-line bg-panel-soft px-3 py-2 text-xs leading-relaxed text-muted"
          >${escapeHtml(firstStep?.note ?? '')}</p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            ${
              goalSteps.length > 1
                ? `<button type="button" data-role="lesson-goal-prev" class="${ghostButtonClass} px-2.5 py-1 text-xs" disabled>${escapeHtml(t.goalPrev)}</button>
                   <button type="button" data-role="lesson-goal-next" class="${ghostButtonClass} px-2.5 py-1 text-xs">${escapeHtml(t.goalNext)}</button>`
                : ''
            }
            <button type="button" data-role="lesson-goal-reset" hidden class="${ghostButtonClass} px-2.5 py-1 text-xs">${escapeHtml(t.goalBackToSteps)}</button>
          </div>
          ${
            hasLinkedLines
              ? `<p data-role="lesson-goal-hint" class="mt-2.5 mb-0 text-[11.5px] leading-relaxed text-muted">${escapeHtml(t.goalClickHint)}</p>`
              : ''
          }
          ${
            page.exercise
              ? `<a class="mt-3 inline-flex min-h-10 max-[1024px]:min-h-11 touch:min-h-11 w-full items-center justify-center rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-[650] text-accent no-underline transition hover:bg-accent hover:text-accent-contrast" href="/${locale}/playground?lesson=${page.slug}">${escapeHtml(t.goalOpenPlayground)} →</a>`
              : ''
          }
        </div>
      </aside>`;

  return `
    <div class="grid grid-cols-[180px_minmax(0,1fr)_280px] items-start gap-6 max-[1040px]:grid-cols-1">
      <nav class="sticky top-[84px] max-h-[calc(100vh-100px)] overflow-auto max-[1040px]:hidden" aria-label="${escapeHtml(t.tocTitle)}">
        <div class="mb-2 flex items-baseline justify-between gap-2 px-2.5">
          <p class="m-0 text-xs uppercase tracking-[0.08em] text-muted">${escapeHtml(t.tocTitle)}</p>
          <span data-role="toc-progress" class="font-mono text-xs tabular-nums text-muted"></span>
        </div>
        <ol class="m-0 list-none space-y-0.5 p-0">${toc}</ol>
      </nav>

      <article class="min-w-0 max-w-[820px]">
        ${mobileToc}
        <header>
          <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${escapeHtml(t.tracks[trackOf(page)].title)}</p>
          <h1 class="mt-0 mb-3 text-[clamp(28px,4.2vw,40px)] tracking-[-0.015em]">${escapeHtml(page.title)}</h1>
          <p class="mt-0 mb-8 text-base leading-relaxed text-muted">${escapeHtml(page.lead)}</p>
        </header>
        ${body.html}
        ${exercise}
        ${pager}
        ${feedback}
      </article>
      ${goalPanel}
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

/** 课程代码块运行失败或分片加载失败：给出统一错误卡片和就地重试/重启按钮，不要求刷新整页。 */
const renderRunFailure = (
  output: HTMLElement,
  message: string,
  panel: LeanPanel | null,
  t: ReturnType<typeof messagesFor>['lesson'],
  onRestarted: () => void,
) => {
  output.hidden = false;
  output.replaceChildren();

  const card = document.createElement('div');
  card.className = 'rounded-lg border border-err/45 bg-err/10 px-3 py-2.5';

  const title = document.createElement('p');
  title.className = 'm-0 text-sm font-[650] text-err';
  title.textContent = t.runCrashed;

  const detail = document.createElement('p');
  detail.className = 'mb-2 mt-1 break-words font-mono text-xs leading-normal text-muted';
  detail.textContent = message;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.role = 'restart-lean';
  button.className =
    'inline-flex min-h-9 max-[1024px]:min-h-11 touch:min-h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-fg transition hover:border-line-strong disabled:cursor-progress disabled:opacity-55';
  button.textContent = t.restartLean;
  const markRestartFailed = () => {
    button.disabled = false;
    button.textContent = t.restartLean;
    detail.textContent = t.restartFailed;
  };
  button.addEventListener('click', () => {
    if (!panel) {
      onRestarted();
      return;
    }
    button.disabled = true;
    button.textContent = t.restarting;
    void panel
      .restart()
      .then((ok) => {
        if (ok) {
          onRestarted();
          return;
        }
        markRestartFailed();
      })
      .catch(markRestartFailed);
  });

  card.append(title, detail, button);
  output.append(card);
};

export const bindLesson = (root: HTMLElement, locale: Locale, slug?: string) => {
  const t = messagesFor(locale).lesson;
  const lessons = lessonsFor(locale);
  const { page } = pickLesson(lessons, slug);

  // 进度只存在浏览器里：进入课程即记为已读；练习通过后目录里打勾。
  const completed = readCompleted();
  markLessonVisited(page.slug);
  for (const link of root.querySelectorAll<HTMLAnchorElement>('[data-lesson-slug]')) {
    if (!completed.has(link.dataset.lessonSlug ?? '')) continue;
    const mark = document.createElement('span');
    mark.className = 'ml-auto pl-2 text-accent';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '✓';
    mark.title = t.completedLabel;
    link.append(mark);
  }

  // 目录顶部显示总完成度，练习区说明完成条件；都不依赖服务端。
  const counter = t.completedCount(completed.size, lessons.length);
  for (const el of root.querySelectorAll<HTMLElement>('[data-role="toc-progress"]')) {
    el.textContent = counter;
  }
  const exerciseStatus = root.querySelector<HTMLElement>('[data-role="exercise-status"]');
  if (exerciseStatus) {
    const done = completed.has(page.slug);
    exerciseStatus.hidden = false;
    exerciseStatus.textContent = done ? `✓ ${t.completedLabel}` : t.exerciseCompletionHint;
    exerciseStatus.className = done
      ? 'inline-flex items-center rounded-full border border-ok/45 bg-ok/10 px-2.5 py-0.5 text-xs font-[650] text-ok'
      : 'w-full text-xs leading-normal text-muted';
  }

  const goalPanel = root.querySelector<HTMLElement>('[data-role="lesson-goal-panel"]');
  const goalSteps = extractStructuredGoalSteps(page);
  const goalStepLabelEl = goalPanel?.querySelector<HTMLElement>(
    '[data-role="lesson-goal-step-label"]',
  );
  const goalTextEl = goalPanel?.querySelector<HTMLElement>('[data-role="lesson-goal-text"]');
  const goalNoteEl = goalPanel?.querySelector<HTMLElement>('[data-role="lesson-goal-note"]');
  const goalBadgeEl = goalPanel?.querySelector<HTMLElement>('[data-role="lesson-goal-badge"]');
  const goalPrevEl = goalPanel?.querySelector<HTMLButtonElement>('[data-role="lesson-goal-prev"]');
  const goalNextEl = goalPanel?.querySelector<HTMLButtonElement>('[data-role="lesson-goal-next"]');
  const goalResetEl = goalPanel?.querySelector<HTMLButtonElement>(
    '[data-role="lesson-goal-reset"]',
  );
  const codeLines = Array.from(
    root.querySelectorAll<HTMLElement>('[data-role="code-block"] [data-code-line]'),
  );
  let goalStep = 0;
  let inLiveMode = false;

  const highlightStepLine = (step: LessonGoalStep | undefined, scrollIntoView: boolean) => {
    for (const lineEl of codeLines) {
      delete lineEl.dataset.activeLine;
      lineEl.className = codeLineClass(Boolean(lineEl.dataset.stepIndex), false);
    }
    if (!step || step.codeIndex === null || step.lineIndex === null) return;
    const targetLine = root.querySelector<HTMLElement>(
      `[data-role="code-block"][data-code-index="${step.codeIndex}"] [data-code-line="${step.lineIndex}"]`,
    );
    if (!targetLine) return;
    targetLine.dataset.activeLine = 'true';
    targetLine.className = codeLineClass(Boolean(targetLine.dataset.stepIndex), true);
    if (scrollIntoView && typeof targetLine.scrollIntoView === 'function') {
      targetLine.scrollIntoView({ block: 'nearest' });
    }
  };

  const paintGoalSteps = (scrollIntoView = false) => {
    if (!goalPanel || goalSteps.length === 0) return;
    inLiveMode = false;
    const step = goalSteps[goalStep];
    goalPanel.dataset.goalStep = String(goalStep);
    if (goalStepLabelEl) {
      const locationText =
        step && step.codeIndex !== null && step.lineIndex !== null
          ? t.goalLocation(step.codeIndex + 1, step.lineIndex + 1)
          : '';
      goalStepLabelEl.hidden = !locationText;
      goalStepLabelEl.textContent = locationText;
    }
    if (goalTextEl) {
      goalTextEl.textContent = step?.goal ?? '';
      goalTextEl.className = goalTextBoxClass();
    }
    if (goalNoteEl) {
      goalNoteEl.hidden = !step?.note;
      goalNoteEl.textContent = step?.note ?? '';
    }
    if (goalBadgeEl) {
      goalBadgeEl.textContent = t.goalStepLabel(goalStep + 1, goalSteps.length);
      goalBadgeEl.className = goalBadgeClass();
    }
    if (goalPrevEl) goalPrevEl.disabled = goalStep <= 0;
    if (goalNextEl) goalNextEl.disabled = goalStep >= goalSteps.length - 1;
    if (goalResetEl) goalResetEl.hidden = true;
    highlightStepLine(step, scrollIntoView);
  };

  const showLiveState = (state: LiveGoalPanelState) => {
    if (!goalPanel) return;
    inLiveMode = true;
    if (goalStepLabelEl) {
      goalStepLabelEl.hidden = true;
      goalStepLabelEl.textContent = '';
    }
    if (goalTextEl) {
      goalTextEl.textContent = state.text;
      goalTextEl.className = goalTextBoxClass(state.tone);
    }
    if (goalNoteEl) {
      goalNoteEl.hidden = true;
      goalNoteEl.textContent = '';
    }
    if (goalBadgeEl) {
      goalBadgeEl.textContent = state.badge;
      goalBadgeEl.className = goalBadgeClass(state.tone);
    }
    if (goalResetEl) goalResetEl.hidden = goalSteps.length === 0;
    highlightStepLine(undefined, false);
  };

  goalPrevEl?.addEventListener('click', () => {
    goalStep = Math.max(0, goalStep - 1);
    paintGoalSteps(true);
  });
  goalNextEl?.addEventListener('click', () => {
    goalStep = Math.min(goalSteps.length - 1, goalStep + 1);
    paintGoalSteps(true);
  });
  goalResetEl?.addEventListener('click', () => paintGoalSteps(true));

  for (const lineEl of codeLines) {
    const rawIndices = lineEl.dataset.stepIndices;
    if (!rawIndices) continue;
    const indices = rawIndices
      .split(',')
      .map(Number)
      .filter((value) => Number.isInteger(value) && value >= 0 && value < goalSteps.length);
    if (indices.length === 0) continue;

    lineEl.addEventListener('click', () => {
      const currentPos = indices.indexOf(goalStep);
      const nextStep =
        !inLiveMode && currentPos >= 0 && indices.length > 1
          ? indices[(currentPos + 1) % indices.length]!
          : indices[0]!;
      goalStep = nextStep;
      paintGoalSteps(false);
    });
  }

  const codes = page.blocks.flatMap((block) => (block.kind === 'code' ? [block.code] : []));
  const runnerHost = root.querySelector<HTMLElement>('[data-role="runner"]');
  const first = codes[0];
  if (!runnerHost || first === undefined) return;

  const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  const autoStart = shouldAutoStart(currentMemoryTier(), saveData === true);
  // 课程元数据优先；没有声明时才按代码里的 import 兜底推断。
  const requiredExtensions: LessonLibrary[] =
    page.requires ?? (needsExtensionPacks(page) ? ['std', 'batteries'] : []);
  let reportProgress: ((progress: LeanPanelProgress) => void) | null = null;
  let loadedPanel: LeanPanel | null = null;
  let panelPromise: Promise<LeanPanel> | null = null;

  // 按需动态加载 Monaco + LSP：阅读课程正文时不再被 3.5MB 编辑器主包阻塞首屏。
  const ensurePanel = (): Promise<LeanPanel> => {
    if (!panelPromise) {
      panelPromise = import('../components/lean-panel')
        .then(({ createLeanPanel }) => {
          const created = createLeanPanel(runnerHost, {
            variant: 'compact',
            // 预置空文档：课程页的代码块按需 run；预先塞入第一块会让它被声明一次，
            // 用户再点同一块时就变成「重复声明」。面板本身是 sr-only，空文档不影响阅读。
            code: '',
            locale,
            // 只有真正 import Std / Batteries 的工程课才预加载扩展包：
            // 位运算与数组边界课只用 Init，提前挂载 75MB 的 Std 会白白吃掉内存。
            ...(requiredExtensions.length ? { requiredExtensions } : {}),
            // 低内存设备与省流模式都不自动下载 102MB，让用户先确认。
            autoStart,
            onProgress: (progress) => reportProgress?.(progress),
          });
          loadedPanel = created;
          return created;
        })
        .catch((error: unknown) => {
          panelPromise = null;
          throw error;
        });
    }
    return panelPromise;
  };

  if (autoStart) {
    void ensurePanel().catch(() => {});
  }

  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-run-index]'));

  const runCode = (code: string, output: HTMLElement) => {
    const initial = loadedPanel?.getProgress() ?? {
      label: messagesFor(locale).playground.statusLoading,
      kind: 'loading' as const,
      ratio: null,
    };
    output.hidden = false;
    output.innerHTML = renderRunProgress(initial.label, initial.ratio);
    for (const other of buttons) other.disabled = true;
    showLiveState({ badge: t.goalLive, text: t.goalChecking, tone: 'live' });

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

    void ensurePanel()
      .then((panel) => panel.run(code).then((list) => ({ panel, list })))
      .then(({ list }) => {
        const filtered = anchorImportDiagnostics(dropSpuriousRedeclarations(list, code), code);
        renderOutput(output, filtered, looksLikeProof(code) ? t.proofAccepted : t.noOutput);
        showLiveState(resolveLiveLessonGoalPanelState(filtered, code, t));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        renderRunFailure(output, message, loadedPanel, t, () => runCode(code, output));
        showLiveState({ badge: t.goalError, text: message, tone: 'error' });
      })
      .finally(() => {
        window.clearInterval(timer);
        reportProgress = null;
        for (const other of buttons) other.disabled = false;
      });
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.runIndex);
      const code = codes[index];
      const output = root.querySelector<HTMLElement>(`[data-output="${index}"]`);
      if (code === undefined || !output) return;
      runCode(code, output);
    });
  }
};
