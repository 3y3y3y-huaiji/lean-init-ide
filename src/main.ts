import './index.css';
import { applySourcePreference } from './asset-source';
import { detectLocale, loadLocale, otherLocale } from './i18n';
import { applyPageMeta } from './meta';
import { pageDescription, pageTitle, renderNotFound } from './page-meta';
import { readCompleted, readProgress } from './progress';
import { canonicalRoutePath, resolveRoute, type Route } from './router';
import { initTelemetry, track } from './telemetry';
import { bindLayout, renderLayout } from './views/layout';
import { hydrateHome, renderHome } from './views/home';
import { renderPrivacy } from './views/privacy';

const app = document.querySelector<HTMLElement>('#app');

initTelemetry();
void applySourcePreference(location.search);

const boot = async (route: Route, root: HTMLElement) => {
  await loadLocale(route.locale);
  document.title = pageTitle(route);
  applyPageMeta(document, {
    locale: route.locale,
    pathname: location.pathname,
    title: document.title,
    description: pageDescription(route),
  });
  document.body.dataset.page = route.page === 'playground' ? 'playground' : 'content';
  track('boot', { page: route.page, locale: route.locale });

  const ssgPath = document.head.querySelector<HTMLMetaElement>('meta[name="lean-ssg"]')?.content;
  const canHydrate = Boolean(ssgPath && ssgPath === canonicalRoutePath(route));

  if (canHydrate) {
    // SSG 已预先渲染首屏 DOM，这里只原地补充交互状态，避免替换 #app 导致 LCP 延后或布局抖动。
    if (location.search || location.hash) {
      const langSwitch = root.querySelector<HTMLAnchorElement>('#lang-switch');
      if (langSwitch) {
        const rest = location.pathname.replace(/^\/(?:zh|en)(?=\/|$)/, '') || '/';
        langSwitch.href = `/${otherLocale(route.locale)}${rest}${location.search}${location.hash}`;
      }
    }
    bindLayout(root, route.locale);
    switch (route.page) {
      case 'home':
        hydrateHome(root, route.locale, readProgress(), readCompleted());
        break;
      case 'lesson': {
        const { bindLesson } = await import('./views/lesson');
        bindLesson(root, route.locale, route.slug);
        break;
      }
      case 'playground': {
        const { mountPlayground } = await import('./views/playground');
        await mountPlayground(root, route.locale);
        break;
      }
      default:
        break;
    }
    return;
  }

  let content: string;
  let mount: (() => void | Promise<void>) | undefined;

  switch (route.page) {
    case 'lesson': {
      const { renderLesson, bindLesson } = await import('./views/lesson');
      content = renderLesson(route.locale, route.slug);
      mount = () => bindLesson(root, route.locale, route.slug);
      break;
    }
    case 'playground': {
      const { renderPlayground, mountPlayground } = await import('./views/playground');
      content = renderPlayground(route.locale);
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
  await mount?.();
};

const fallbackLocale = detectLocale();
let resolution = resolveRoute(location.pathname, fallbackLocale);

// 用 history.replaceState 原地规范化 URL，避免再发一次整页 HTML 请求增加 TTFB。
if (resolution.kind === 'redirect') {
  history.replaceState(null, '', `${resolution.path}${location.search}${location.hash}`);
  resolution = resolveRoute(location.pathname, fallbackLocale);
}

if (resolution.kind === 'route' && app) {
  void boot(resolution.route, app);
}
