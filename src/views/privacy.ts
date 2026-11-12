import { buttonClass } from '../components/ui';
import { messagesFor, type Locale } from '../i18n';
import { escapeHtml } from './html';

export const renderPrivacy = (locale: Locale): string => {
  const t = messagesFor(locale).privacy;

  const sections = t.sections
    .map(
      (section) => `
      <section class="mb-8">
        <h2 class="mt-0 mb-3 text-lg font-bold">${escapeHtml(section.heading)}</h2>
        ${section.paragraphs
          .map(
            (paragraph) =>
              `<p class="mt-0 mb-3 text-[15px] leading-[1.75] text-fg">${escapeHtml(paragraph)}</p>`,
          )
          .join('')}
      </section>`,
    )
    .join('');

  return `
    <article class="max-w-[760px]">
      <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${escapeHtml(t.eyebrow)}</p>
      <h1 class="mt-0 mb-3 text-[clamp(28px,4.2vw,40px)] tracking-[-0.015em]">${escapeHtml(t.title)}</h1>
      <p class="mt-0 mb-6 text-sm text-muted">${escapeHtml(t.updated)}</p>
      <p class="mt-0 mb-10 text-base leading-relaxed text-muted">${escapeHtml(t.intro)}</p>
      ${sections}
      <p class="mt-10 rounded-lg border border-line bg-panel-soft px-4 py-3 text-[13px] leading-relaxed text-muted">${escapeHtml(t.note)}</p>
      <p class="mt-8">
        <a class="${buttonClass}" href="/${locale}/">${escapeHtml(t.backHome)}</a>
      </p>
    </article>
  `;
};
