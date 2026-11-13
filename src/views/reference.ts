import { buttonClass, ghostButtonClass } from '../components/ui';
import { messagesFor, type Locale } from '../i18n';
import { FIRST_LESSON_SLUG } from '../router';
import { escapeHtml } from './html';

export const renderReference = (locale: Locale): string => {
  const t = messagesFor(locale).reference;

  const tactics = t.tactics
    .map(
      (tactic) => `
      <article class="rounded-2xl border border-line bg-panel p-5">
        <code class="font-mono text-[14px] font-[650] text-accent">${escapeHtml(tactic.name)}</code>
        <p class="mb-0 mt-2 text-sm leading-relaxed text-muted">${escapeHtml(tactic.body)}</p>
        <pre class="mt-3 overflow-auto whitespace-pre-wrap rounded-lg bg-panel-soft px-3 py-2 font-mono text-[12px] leading-relaxed text-fg">${escapeHtml(tactic.example)}</pre>
      </article>`,
    )
    .join('');

  const symbols = t.symbols
    .map(
      (item) => `
      <div class="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2">
        <span class="w-10 shrink-0 text-center font-mono text-lg text-fg">${escapeHtml(item.symbol)}</span>
        <code class="shrink-0 font-mono text-xs text-accent">${escapeHtml(item.abbreviation)}</code>
        <span class="min-w-0 text-xs leading-snug text-muted">${escapeHtml(item.meaning)}</span>
      </div>`,
    )
    .join('');

  const errors = t.errors
    .map(
      (item) => `
      <article class="rounded-2xl border border-line bg-panel p-5">
        <code class="font-mono text-[13px] font-[650] text-err">${escapeHtml(item.error)}</code>
        <p class="mb-0 mt-2 text-sm leading-relaxed text-muted">${escapeHtml(item.cause)}</p>
        <p class="mb-0 mt-2 text-sm leading-relaxed text-fg">${escapeHtml(item.fix)}</p>
      </article>`,
    )
    .join('');

  return `
    <section class="max-w-[820px]">
      <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${escapeHtml(t.eyebrow)}</p>
      <h1 class="mt-0 mb-4 text-[clamp(28px,4.2vw,40px)] tracking-[-0.015em]">${escapeHtml(t.title)}</h1>
      <p class="mt-0 mb-0 text-base leading-relaxed text-muted">${escapeHtml(t.lead)}</p>
    </section>

    <section class="mt-[clamp(36px,5vw,56px)]">
      <h2 class="mt-0 mb-1.5 text-lg font-bold">${escapeHtml(t.tacticsTitle)}</h2>
      <p class="mt-0 mb-4 text-sm text-muted">${escapeHtml(t.tacticsLead)}</p>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5">${tactics}</div>
    </section>

    <section class="mt-[clamp(36px,5vw,56px)]">
      <h2 class="mt-0 mb-1.5 text-lg font-bold">${escapeHtml(t.symbolsTitle)}</h2>
      <p class="mt-0 mb-4 text-sm text-muted">${escapeHtml(t.symbolsLead)}</p>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2">${symbols}</div>
    </section>

    <section class="mt-[clamp(36px,5vw,56px)]">
      <h2 class="mt-0 mb-1.5 text-lg font-bold">${escapeHtml(t.errorsTitle)}</h2>
      <p class="mt-0 mb-4 text-sm text-muted">${escapeHtml(t.errorsLead)}</p>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5">${errors}</div>
    </section>

    <section class="mt-[clamp(36px,5vw,56px)] rounded-2xl border border-line bg-panel p-6">
      <h2 class="mt-0 mb-2 text-lg font-bold">${escapeHtml(t.ctaTitle)}</h2>
      <p class="mt-0 mb-4 text-sm text-muted">${escapeHtml(t.ctaBody)}</p>
      <div class="flex flex-wrap gap-2">
        <a class="${buttonClass}" href="/${locale}/playground">${escapeHtml(t.ctaPlayground)}</a>
        <a class="${ghostButtonClass}" href="/${locale}/learn/${FIRST_LESSON_SLUG}">${escapeHtml(t.ctaLesson)}</a>
      </div>
    </section>
  `;
};
