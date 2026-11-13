import { buttonClass, ghostButtonLgClass } from '../components/ui';
import { messagesFor, type Locale } from '../i18n';
import { firstUncompletedLesson } from '../progress';
import { FIRST_LESSON_SLUG } from '../router';

export const renderHome = (
  locale: Locale,
  visited: ReadonlySet<string> = new Set(),
  completed: ReadonlySet<string> = new Set(),
): string => {
  const t = messagesFor(locale).home;
  const lessonMsgs = messagesFor(locale).lesson;
  const lessonSlugs = lessonMsgs.lessons.map((lesson) => lesson.slug);
  const target = firstUncompletedLesson(lessonSlugs, completed) ?? FIRST_LESSON_SLUG;
  const cta = visited.size > 0 || completed.size > 0 ? t.continueCta : t.ctaPrimary;

  const introLessons = lessonMsgs.lessons.filter((lesson) => (lesson.track ?? 'intro') === 'intro');
  const mathLessons = lessonMsgs.lessons.filter((lesson) => lesson.track === 'math');
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

  const pathCard = (track: 'intro' | 'math', lessons: typeof introLessons, href: string) => `
    <article class="rounded-2xl border border-line bg-panel p-6">
      <h3 class="mt-0 mb-2 text-[17px] font-bold">${lessonMsgs.tracks[track].title}</h3>
      <p class="mt-0 mb-3 text-sm text-muted">${lessonMsgs.tracks[track].lead}</p>
      <p class="mt-0 mb-4 text-xs uppercase tracking-[0.08em] text-muted">${t.pathMeta(lessons.length)}</p>
      <a class="${buttonClass}" href="/${locale}/learn/${href}">${t.courseCta}</a>
    </article>`;

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
        <a class="${buttonClass}" href="/${locale}/learn/${target}">${cta}</a>
        <a class="${ghostButtonLgClass}" href="/${locale}/playground">${t.ctaSecondary}</a>
      </div>
    </section>

    <section class="mt-[clamp(40px,6vw,72px)]">
      <h2 class="mt-0 mb-4.5 text-sm uppercase tracking-[0.08em] text-muted">${t.featuresTitle}</h2>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5">${features}</div>
    </section>

    <section class="mt-[clamp(40px,6vw,72px)]">
      <h2 class="mt-0 mb-4.5 text-sm uppercase tracking-[0.08em] text-muted">${t.pathsTitle}</h2>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5">
        ${pathCard('intro', introLessons, introTarget)}
        ${mathTarget ? pathCard('math', mathLessons, mathTarget) : ''}
      </div>
    </section>

    <section class="mt-[clamp(40px,6vw,72px)]">
      <article class="rounded-2xl border border-line bg-panel p-6">
        <h2 class="mt-0 mb-2.5 text-[17px] font-bold">${t.limitsTitle}</h2>
        <p class="mt-0 mb-4 text-sm text-muted last:mb-0">${t.limitsBody}</p>
      </article>
    </section>
  `;
};
