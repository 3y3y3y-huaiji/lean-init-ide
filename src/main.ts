import './index.css';
import { buttonClass } from './components/ui';
import { detectLocale, messagesFor, type Locale } from './i18n';
import { resolveRoute, type Page, type Route } from './router';
import { bindLayout, renderLayout } from './views/layout';
import { renderHome } from './views/home';

const app = document.querySelector<HTMLElement>('#app');

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

const pageTitle = (page: Page, locale: Locale): string => {
  const t = messagesFor(locale);
  switch (page) {
    case 'lesson':
      return `${t.lesson.title} · Lean Init IDE`;
    case 'playground':
      return `${t.playground.title} · Lean Init IDE`;
    case 'notFound':
      return `${t.notFound.title} · Lean Init IDE`;
    default:
      return 'Lean Init IDE';
  }
};

const boot = async (route: Route, root: HTMLElement) => {
  document.title = pageTitle(route.page, route.locale);
  document.body.dataset.page = route.page === 'playground' ? 'playground' : 'content';

  let content: string;
  let mount: (() => void) | undefined;

  switch (route.page) {
    case 'lesson': {
      const { renderLesson, bindLesson } = await import('./views/lesson');
      content = renderLesson(route.locale);
      mount = () => bindLesson(root, route.locale);
      break;
    }
    case 'playground': {
      const { renderPlayground, mountPlayground } = await import('./views/playground');
      content = renderPlayground();
      mount = () => mountPlayground(root, route.locale);
      break;
    }
    case 'notFound':
      content = renderNotFound(route.locale);
      break;
    default:
      content = renderHome(route.locale);
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
