import { buttonClass, ghostButtonLgClass } from '../components/ui';
import { messagesFor, type Locale } from '../i18n';

export const renderHome = (locale: Locale): string => {
  const t = messagesFor(locale).home;

  const features = t.features
    .map(
      (feature) => `
      <article class="rounded-[14px] border border-line bg-panel p-5">
        <h3 class="mt-0 mb-2 text-[15px] font-bold">${feature.title}</h3>
        <p class="m-0 text-sm text-muted">${feature.body}</p>
      </article>`,
    )
    .join('');

  return `
    <section class="max-w-[760px]">
      <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${t.eyebrow}</p>
      <h1 class="mt-0 mb-4 text-[clamp(32px,5.4vw,52px)] tracking-[-0.02em]">${t.title}</h1>
      <p class="mt-0 mb-6.5 max-w-[640px] text-[clamp(15px,1.6vw,18px)] text-muted">${t.lead}</p>
      <div class="flex flex-wrap gap-3">
        <a class="${buttonClass}" href="/${locale}/learn/first-proof">${t.ctaPrimary}</a>
        <a class="${ghostButtonLgClass}" href="/${locale}/playground">${t.ctaSecondary}</a>
      </div>
    </section>

    <section class="mt-[clamp(40px,6vw,72px)]">
      <h2 class="mt-0 mb-4.5 text-sm uppercase tracking-[0.08em] text-muted">${t.featuresTitle}</h2>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5">${features}</div>
    </section>

    <section class="mt-[clamp(40px,6vw,72px)] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5">
      <article class="rounded-2xl border border-line bg-panel p-6">
        <h2 class="mt-0 mb-2.5 text-[17px] font-bold">${t.limitsTitle}</h2>
        <p class="mt-0 mb-4 text-sm text-muted last:mb-0">${t.limitsBody}</p>
      </article>
      <article class="rounded-2xl border border-accent bg-panel bg-[linear-gradient(150deg,var(--accent-soft),transparent_70%)] p-6">
        <h2 class="mt-0 mb-2.5 text-[17px] font-bold">${t.courseTitle}</h2>
        <p class="mt-0 mb-4 text-sm text-muted last:mb-0">${t.courseBody}</p>
        <a class="${buttonClass}" href="/${locale}/learn/first-proof">${t.courseCta}</a>
      </article>
    </section>
  `;
};
