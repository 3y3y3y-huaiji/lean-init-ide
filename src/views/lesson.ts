import { createLeanPanel } from '../components/lean-panel';
import { buttonClass, ghostButtonClass } from '../components/ui';
import { messagesFor, type Locale } from '../i18n';
import type { LessonPage } from '../i18n/types';
import { escapeHtml } from './html';

const codeBlockOpen =
  'overflow-hidden rounded-xl border border-line bg-panel-soft data-[loaded=true]:border-accent data-[loaded=true]:ring-1 data-[loaded=true]:ring-accent-soft';

const codeBlockHead =
  'flex items-center justify-between gap-3 border-b border-line py-1.5 pl-3.5 pr-2 text-xs uppercase tracking-[0.06em] text-muted';

const tocLink = (active: boolean) =>
  active
    ? 'block rounded-lg bg-accent-soft px-2.5 py-1.5 text-[13px] leading-snug text-fg no-underline'
    : 'block rounded-lg px-2.5 py-1.5 text-[13px] leading-snug text-muted no-underline hover:bg-panel-soft hover:text-fg';

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
        <div data-role="code-block" data-code-index="${index}" class="my-5 ${codeBlockOpen}">
          <div class="${codeBlockHead}">
            <span>Lean 4</span>
            <button class="${ghostButtonClass}" type="button" data-code-index="${index}">${escapeHtml(runLabel)}</button>
          </div>
          <pre class="m-0 overflow-auto px-4 py-3.5 font-mono text-[13.5px] leading-[1.65]"><code>${escapeHtml(block.code)}</code></pre>
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
        <a class="${tocLink(i === index)}" href="/${locale}/learn/${lesson.slug}"${
          i === index ? ' aria-current="page"' : ''
        }>${escapeHtml(lesson.navTitle)}</a>
      </li>`,
    )
    .join('');

  const pager = `
    <nav class="mt-12 flex items-start justify-between gap-6 border-t border-line pt-6">
      ${
        prev
          ? `<a class="group no-underline" href="/${locale}/learn/${prev.slug}">
               <span class="block text-xs text-muted">← ${escapeHtml(t.prev)}</span>
               <span class="mt-1 block text-sm text-fg group-hover:text-accent">${escapeHtml(prev.navTitle)}</span>
             </a>`
          : '<span></span>'
      }
      ${
        next
          ? `<a class="group block text-right no-underline" href="/${locale}/learn/${next.slug}">
               <span class="block text-xs text-muted">${escapeHtml(t.next)} →</span>
               <span class="mt-1 block text-sm text-fg group-hover:text-accent">${escapeHtml(next.navTitle)}</span>
             </a>`
          : '<span></span>'
      }
    </nav>`;

  const exercise = page.exercise
    ? `
      <section class="mt-8 rounded-2xl border border-accent bg-accent-soft p-6">
        <h2 class="mt-0 mb-2.5 text-lg font-bold">${escapeHtml(page.exercise.title)}</h2>
        <p class="mt-0 mb-4 text-muted">${escapeHtml(page.exercise.body)}</p>
        <button class="${buttonClass}" type="button" data-code-index="${body.codeCount}">${escapeHtml(page.exercise.cta)}</button>
      </section>`
    : '';

  return `
    <div class="grid grid-cols-[190px_minmax(0,1fr)_400px] items-start gap-8 max-[1240px]:grid-cols-[minmax(0,1fr)_380px] max-[960px]:grid-cols-1">
      <nav class="sticky top-[84px] max-h-[calc(100vh-100px)] overflow-auto max-[1240px]:hidden" aria-label="${escapeHtml(t.tocTitle)}">
        <p class="m-0 mb-2 px-2.5 text-xs uppercase tracking-[0.08em] text-muted">${escapeHtml(t.tocTitle)}</p>
        <ol class="m-0 list-none space-y-0.5 p-0">${toc}</ol>
      </nav>

      <article class="min-w-0 max-w-[760px]">
        <header>
          <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${escapeHtml(t.eyebrow)}</p>
          <h1 class="mt-0 mb-3 text-[clamp(28px,4.2vw,40px)] tracking-[-0.015em]">${escapeHtml(page.title)}</h1>
          <p class="mt-0 mb-8 text-base leading-relaxed text-muted">${escapeHtml(page.lead)}</p>
        </header>
        ${body.html}
        ${exercise}
        ${pager}
      </article>

      <aside class="sticky top-[84px] flex max-h-[calc(100vh-100px)] flex-col gap-2.5 overflow-auto max-[960px]:static">
        <p class="m-0 text-xs leading-[1.55] text-muted">${escapeHtml(t.editorHint)}</p>
        <div data-role="lean-panel"></div>
      </aside>
    </div>
  `;
};

export const bindLesson = (root: HTMLElement, locale: Locale, slug?: string) => {
  const t = messagesFor(locale).lesson;
  const { page } = pickLesson(t.lessons, slug);

  const codes = [
    ...page.blocks.flatMap((block) => (block.kind === 'code' ? [block.code] : [])),
    ...(page.exercise ? [page.exercise.starter] : []),
  ];

  const host = root.querySelector<HTMLElement>('[data-role="lean-panel"]');
  const initial = codes[0];
  if (!host || initial === undefined) return;

  const panel = createLeanPanel(host, { variant: 'compact', code: initial, locale });

  const blocks = [...root.querySelectorAll<HTMLElement>('[data-role="code-block"]')];
  const highlight = (index: number) => {
    for (const block of blocks) {
      block.dataset.loaded = String(block.dataset.codeIndex === String(index));
    }
  };

  // 只绑按钮：code-block 容器上也有 data-code-index，用属性选择器会一次点击触发两次。
  for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-code-index]')) {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.codeIndex);
      const code = codes[index];
      if (code === undefined) return;
      panel.setCode(code, { focus: true });
      highlight(index);
    });
  }

  highlight(0);
};
