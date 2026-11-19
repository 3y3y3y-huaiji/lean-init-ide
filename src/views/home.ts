import { buttonClass, ghostButtonLgClass } from '../components/ui';
import { CHALLENGES } from '../challenges';
import { LESSON_CATALOG, messagesFor, type Locale } from '../i18n';
import { firstUncompletedLesson } from '../progress';
import { FIRST_LESSON_SLUG } from '../router';
import { escapeHtml } from './html';

const computeHomeState = (
  locale: Locale,
  visited: ReadonlySet<string> = new Set(),
  completed: ReadonlySet<string> = new Set(),
) => {
  const t = messagesFor(locale).home;
  const lessonMsgs = messagesFor(locale).lesson;
  const lessonSlugs = LESSON_CATALOG.map((lesson) => lesson.slug);
  const target = firstUncompletedLesson(lessonSlugs, completed) ?? FIRST_LESSON_SLUG;
  const cta = visited.size > 0 || completed.size > 0 ? t.continueCta : t.ctaPrimary;

  const introLessons = LESSON_CATALOG.filter((lesson) => lesson.track === 'intro');
  const mathLessons = LESSON_CATALOG.filter((lesson) => lesson.track === 'math');
  const engLessons = LESSON_CATALOG.filter((lesson) => lesson.track === 'eng');
  const introTarget =
    firstUncompletedLesson(
      introLessons.map((lesson) => lesson.slug),
      completed,
    ) ?? FIRST_LESSON_SLUG;
  const mathTarget =
    mathLessons.length > 0
      ? firstUncompletedLesson(
          mathLessons.map((lesson) => lesson.slug),
          completed,
        )
      : undefined;
  const engTarget =
    engLessons.length > 0
      ? firstUncompletedLesson(
          engLessons.map((lesson) => lesson.slug),
          completed,
        )
      : undefined;

  return {
    t,
    lessonMsgs,
    target,
    cta,
    facts: t.facts(LESSON_CATALOG.length, CHALLENGES.length),
    introLessons,
    mathLessons,
    engLessons,
    introTarget,
    mathTarget,
    engTarget,
  };
};

export const renderHome = (
  locale: Locale,
  visited: ReadonlySet<string> = new Set(),
  completed: ReadonlySet<string> = new Set(),
): string => {
  const {
    t,
    lessonMsgs,
    target,
    cta,
    facts,
    introLessons,
    mathLessons,
    engLessons,
    introTarget,
    mathTarget,
    engTarget,
  } = computeHomeState(locale, visited, completed);

  const pathCard = (
    track: 'intro' | 'math' | 'eng',
    lessons: typeof introLessons,
    href: string,
  ) => {
    const ctaLabel = escapeHtml(`${t.courseCta}: ${lessonMsgs.tracks[track].title}`);
    return `
    <article class="rounded-2xl border border-line bg-panel p-6">
      <h3 class="mt-0 mb-2 text-[17px] font-bold">${lessonMsgs.tracks[track].title}</h3>
      <p class="mt-0 mb-3 text-sm text-muted">${lessonMsgs.tracks[track].lead}</p>
      <p class="mt-0 mb-4 text-xs uppercase tracking-[0.08em] text-muted">${t.pathMeta(lessons.length)}</p>
      <a class="${buttonClass}" data-home-cta="${track}" href="/${locale}/learn/${href}" aria-label="${ctaLabel}">${t.courseCta}</a>
    </article>`;
  };

  const features = t.features
    .map(
      (feature) => `
      <article class="rounded-[14px] border border-line bg-panel p-5">
        <h3 class="mt-0 mb-2 text-[15px] font-bold">${feature.title}</h3>
        <p class="m-0 text-sm text-muted">${feature.body}</p>
      </article>`,
    )
    .join('');

  const demo = t.demo;
  const demoStep = demo.steps[0]!;
  const demoSection = `
    <section class="mt-[clamp(36px,5vw,56px)]">
      <div class="rounded-2xl border border-accent bg-accent-soft p-6" data-role="home-demo">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="m-0 text-[17px] font-bold">${demo.title}</h2>
          <span data-role="demo-count" class="font-mono text-xs tabular-nums text-muted">${demo.stepLabel(1, demo.steps.length)}</span>
        </div>
        <p class="mt-2 mb-4 text-sm leading-relaxed text-muted">${demo.body}</p>
        <pre data-role="demo-goal" class="m-0 overflow-auto rounded-lg border border-line bg-panel px-4 py-3 font-mono text-[13.5px] leading-[1.7] text-fg">${escapeHtml(demoStep.goal)}</pre>
        <p data-role="demo-note" class="mt-2 mb-4 text-sm leading-relaxed text-muted">${escapeHtml(demoStep.note)}</p>
        <div class="flex flex-wrap gap-2">
          <button class="${buttonClass}" type="button" data-role="demo-next">${demo.next}</button>
          <button class="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line bg-panel px-3.5 text-sm text-muted hover:text-fg" type="button" data-role="demo-reset">${demo.reset}</button>
        </div>
      </div>
    </section>`;

  return `
    <section class="max-w-[760px]">
      <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${t.eyebrow}</p>
      <h1 class="mt-0 mb-4 text-[clamp(32px,5.4vw,52px)] tracking-[-0.02em]">${t.title}</h1>
      <p class="mt-0 mb-3 max-w-[640px] text-[clamp(15px,1.6vw,18px)] text-muted">${t.lead}</p>
      <ul
        aria-label="${escapeHtml(t.factsTitle)}"
        class="mt-0 mb-5 grid max-w-[640px] list-disc gap-1.5 pl-5 text-sm leading-relaxed text-muted"
      >
        ${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('\n        ')}
      </ul>
      <p class="mt-0 mb-6.5 max-w-[640px] text-sm leading-relaxed text-muted">${t.heroNote}</p>
      <div class="flex flex-wrap gap-3">
        <a class="${buttonClass}" data-home-cta="primary" href="/${locale}/learn/${target}">${cta}</a>
        <a class="${ghostButtonLgClass}" href="/${locale}/playground">${t.ctaSecondary}</a>
      </div>
    </section>

    ${demoSection}

    <section class="mt-[clamp(40px,6vw,72px)]">
      <h2 class="mt-0 mb-4.5 text-sm uppercase tracking-[0.08em] text-muted">${t.pathsTitle}</h2>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5">
        ${pathCard('intro', introLessons, introTarget)}
        ${mathTarget ? pathCard('math', mathLessons, mathTarget) : ''}
        ${engTarget ? pathCard('eng', engLessons, engTarget) : ''}
      </div>
    </section>

    <section class="mt-[clamp(40px,6vw,72px)]">
      <article class="rounded-2xl border border-line bg-panel p-6">
        <h2 class="mt-0 mb-2.5 text-[17px] font-bold">${t.challengesTitle}</h2>
        <p class="mt-0 mb-4 text-sm text-muted">${t.challengesBody}</p>
        <a class="${buttonClass}" data-home-cta="challenges" href="/${locale}/challenges">${t.challengesCta}</a>
      </article>
    </section>

    <section class="mt-[clamp(40px,6vw,72px)]">
      <h2 class="mt-0 mb-4.5 text-sm uppercase tracking-[0.08em] text-muted">${t.featuresTitle}</h2>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5">${features}</div>
    </section>

    <section class="mt-[clamp(40px,6vw,72px)]">
      <article class="rounded-2xl border border-line bg-panel p-6">
        <h2 class="mt-0 mb-2.5 text-[17px] font-bold">${t.limitsTitle}</h2>
        <p class="mt-0 mb-4 text-sm text-muted last:mb-0">${t.limitsBody}</p>
      </article>
    </section>
  `;
};

/** SSG 静态页水合：就地更新进度相关的 CTA 链接与文案，避免整树重建重置 LCP。 */
export const hydrateHome = (
  root: HTMLElement,
  locale: Locale,
  visited: ReadonlySet<string> = new Set(),
  completed: ReadonlySet<string> = new Set(),
): void => {
  const { t, cta, target, introTarget, mathTarget, engTarget } = computeHomeState(
    locale,
    visited,
    completed,
  );
  const primary = root.querySelector<HTMLAnchorElement>('[data-home-cta="primary"]');
  if (primary) {
    primary.href = `/${locale}/learn/${target}`;
    primary.textContent = cta;
  }
  const intro = root.querySelector<HTMLAnchorElement>('[data-home-cta="intro"]');
  if (intro) intro.href = `/${locale}/learn/${introTarget}`;
  const math = root.querySelector<HTMLAnchorElement>('[data-home-cta="math"]');
  if (math && mathTarget) math.href = `/${locale}/learn/${mathTarget}`;
  const eng = root.querySelector<HTMLAnchorElement>('[data-home-cta="eng"]');
  if (eng && engTarget) eng.href = `/${locale}/learn/${engTarget}`;

  // 零下载演示：纯前端状态切换，不触碰 Lean 运行时，也不会触发资产下载。
  const demo = root.querySelector<HTMLElement>('[data-role="home-demo"]');
  if (!demo || demo.dataset.bound === 'true') return;
  demo.dataset.bound = 'true';

  const steps = t.demo.steps;
  const countEl = demo.querySelector<HTMLElement>('[data-role="demo-count"]');
  const goalEl = demo.querySelector<HTMLElement>('[data-role="demo-goal"]');
  const noteEl = demo.querySelector<HTMLElement>('[data-role="demo-note"]');
  const nextEl = demo.querySelector<HTMLButtonElement>('[data-role="demo-next"]');
  const resetEl = demo.querySelector<HTMLButtonElement>('[data-role="demo-reset"]');
  let step = 0;

  const paint = () => {
    const current = steps[step] ?? steps[0]!;
    if (goalEl) goalEl.textContent = current.goal;
    if (noteEl) noteEl.textContent = current.note;
    if (countEl) countEl.textContent = t.demo.stepLabel(step + 1, steps.length);
    if (nextEl) nextEl.disabled = step >= steps.length - 1;
  };

  nextEl?.addEventListener('click', () => {
    step = Math.min(step + 1, steps.length - 1);
    paint();
  });
  resetEl?.addEventListener('click', () => {
    step = 0;
    paint();
  });
  paint();
};
