import './index.css';
import { applySourcePreference } from './asset-source';
import { buttonClass } from './components/ui';
import { detectLocale, loadLocale, messagesFor, type Locale } from './i18n';
import { applyPageMeta } from './meta';
import { readCompleted, readProgress } from './progress';
import { resolveRoute, type Route } from './router';
import { initTelemetry, track } from './telemetry';
import { bindLayout, renderLayout } from './views/layout';
import { renderHome } from './views/home';
import { renderPrivacy } from './views/privacy';

const app = document.querySelector<HTMLElement>('#app');

initTelemetry();
void applySourcePreference(location.search);

const renderNotFound = (locale: Locale): string => {
  const t = messagesFor(locale).notFound;
  return `
    <section class="max-w-[560px] py-12">
      <h1 class="mt-0 mb-3">${t.title}</h1>
      <p class="mt-0 mb-5 text-muted">${t.body}</p>
      <a class="${buttonClass}" href="/${locale}/">${t.cta}</a>
    </section>
  `;
};

const pageTitle = (route: Route): string => {
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
    case 'notFound':
      return `${t.notFound.title} · Lean Init IDE`;
    default:
      return 'Lean Init IDE';
  }
};

const boot = async (route: Route, root: HTMLElement) => {
  await loadLocale(route.locale);
  document.title = pageTitle(route);
  applyPageMeta(document, {
    locale: route.locale,
    pathname: location.pathname,
    title: document.title,
  });
  document.body.dataset.page = route.page === 'playground' ? 'playground' : 'content';
  track('boot', { page: route.page, locale: route.locale });

  let content: string;
  let mount: (() => void) | undefined;

  switch (route.page) {
    case 'lesson': {
      const { renderLesson, bindLesson } = await import('./views/lesson');
      content = renderLesson(route.locale, route.slug);
      mount = () => bindLesson(root, route.locale, route.slug);
      break;
    }
    case 'playground': {
      const { renderPlayground, mountPlayground } = await import('./views/playground');
      content = renderPlayground();
      mount = () => mountPlayground(root, route.locale);
      break;
    }
    case 'privacy':
      content = renderPrivacy(route.locale);
      break;
    case 'reference': {
      const { renderReference } = await import('./views/reference');
      content = renderReference(route.locale);
      break;
    }
    case 'notFound':
      content = renderNotFound(route.locale);
      break;
    default:
      content = renderHome(route.locale, readProgress(), readCompleted());
  }

  root.innerHTML = renderLayout(
    route.locale,
    route.page === 'notFound' ? 'home' : route.page,
    content,
  );
  bindLayout(root, route.locale);
  mount?.();
};

const resolution = resolveRoute(location.pathname, detectLocale());

if (resolution.kind === 'redirect') {
  location.replace(resolution.path);
} else if (app) {
  void boot(resolution.route, app);
}
