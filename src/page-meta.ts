import { buttonClass } from './components/ui';
import { challengeBySlug, CHALLENGES } from './challenges';
import { messagesFor, type Locale } from './i18n';
import type { Route } from './router';

export const renderNotFound = (locale: Locale): string => {
  const t = messagesFor(locale).notFound;
  return `
    <section class="max-w-[560px] py-12">
      <h1 class="mt-0 mb-3">${t.title}</h1>
      <p class="mt-0 mb-5 text-muted">${t.body}</p>
      <a class="${buttonClass}" href="/${locale}/">${t.cta}</a>
    </section>
  `;
};

export const pageTitle = (route: Route): string => {
  const t = messagesFor(route.locale);
  switch (route.page) {
    case 'lesson': {
      const lesson =
        t.lesson.lessons.find((item) => item.slug === route.slug) ?? t.lesson.lessons[0];
      return `${lesson?.title ?? t.lesson.tocTitle} · Lean Init IDE`;
    }
    case 'playground':
      return `${t.playground.title} · Lean Init IDE`;
    case 'privacy':
      return `${t.privacy.title} · Lean Init IDE`;
    case 'reference':
      return `${t.reference.title} · Lean Init IDE`;
    case 'challenges':
      return `${t.challenges.title} · Lean Init IDE`;
    case 'challenge': {
      const challenge = challengeBySlug(route.slug) ?? CHALLENGES[0]!;
      return `${challenge.title[route.locale]} · Lean Init IDE`;
    }
    case 'notFound':
      return `${t.notFound.title} · Lean Init IDE`;
    default:
      return 'Lean Init IDE';
  }
};

export const pageDescription = (route: Route): string => {
  const t = messagesFor(route.locale);
  switch (route.page) {
    case 'lesson': {
      const lesson =
        t.lesson.lessons.find((item) => item.slug === route.slug) ?? t.lesson.lessons[0];
      return lesson?.lead ?? t.home.lead;
    }
    case 'playground':
      return t.playground.hint;
    case 'privacy':
      return t.privacy.intro;
    case 'reference':
      return t.reference.lead;
    case 'challenges':
      return t.challenges.lead;
    case 'challenge': {
      const challenge = challengeBySlug(route.slug) ?? CHALLENGES[0]!;
      return challenge.summary[route.locale];
    }
    default:
      return t.home.lead;
  }
};
