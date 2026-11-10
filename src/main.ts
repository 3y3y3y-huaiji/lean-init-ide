import { detectLocale, isLocale, messagesFor, type Locale } from './i18n';
import { bindLayout, renderLayout } from './views/layout';
import { renderHome } from './views/home';
import { bindLesson, renderLesson } from './views/lesson';
import { mountPlayground, renderPlayground } from './views/playground';

type Page = 'home' | 'lesson' | 'playground' | 'notFound';

type Route = {
  page: Page;
  locale: Locale;
};

const app = document.querySelector<HTMLElement>('#app');

/**
 * 路由约定：/{locale}/、/{locale}/learn/first-proof、/{locale}/playground。
 * 没有语言前缀时按浏览器语言重定向，保证每条链接都可分享。
 */
const parseRoute = (): Route | null => {
  const segments = location.pathname.split('/').filter(Boolean);
  const first = segments[0];

  if (!isLocale(first)) {
    const locale = detectLocale();
    const rest = segments.length ? `/${segments.join('/')}` : '/';
    location.replace(`/${locale}${rest}`);
    return null;
  }

  const rest = segments.slice(1);
  if (rest.length === 0) return { page: 'home', locale: first };
  if (rest[0] === 'playground') return { page: 'playground', locale: first };
  if (rest[0] === 'learn' && rest[1] === 'first-proof') return { page: 'lesson', locale: first };
  return { page: 'notFound', locale: first };
};

const renderNotFound = (locale: Locale): string => {
  const t = messagesFor(locale).notFound;
  return `
    <section class="not-found">
      <h1>${t.title}</h1>
      <p>${t.body}</p>
      <a class="button" href="/${locale}/">${t.cta}</a>
    </section>
  `;
};

const renderPage = (page: Page, locale: Locale): string => {
  switch (page) {
    case 'home':
      return renderHome(locale);
    case 'lesson':
      return renderLesson(locale);
    case 'playground':
      return renderPlayground(locale);
    default:
      return renderNotFound(locale);
  }
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

const route = parseRoute();

if (route && app) {
  document.title = pageTitle(route.page, route.locale);
  document.body.dataset.page = route.page === 'playground' ? 'playground' : 'content';
  app.innerHTML = renderLayout(route.locale, route.page === 'notFound' ? 'home' : route.page, renderPage(route.page, route.locale));
  bindLayout(app, route.locale);

  if (route.page === 'lesson') bindLesson(app, route.locale);
  if (route.page === 'playground') mountPlayground(app, route.locale);
}
