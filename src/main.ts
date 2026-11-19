import './index.css';
import { applySourcePreference } from './asset-source';
import {
  detectLocale,
  loadLessons,
  loadLocale,
  readLocalePreference,
  shouldLocalizeRoot,
} from './i18n';
import { applyPageMeta, swapLocalePath } from './meta';
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
  await Promise.all([
    loadLocale(route.locale),
    route.page === 'lesson' ? loadLessons(route.locale) : Promise.resolve(),
  ]);
  document.title = pageTitle(route);
  applyPageMeta(document, {
    locale: route.locale,
    // 404 保留真实地址；其余路由使用规范路径（英文首页固定为 `/`）。
    pathname: route.page === 'notFound' ? location.pathname : canonicalRoutePath(route),
    title: document.title,
    description: pageDescription(route),
  });
  document.body.dataset.page = route.page === 'playground' ? 'playground' : 'content';
  track('boot', { page: route.page, locale: route.locale });

  const ssgPath = document.head.querySelector<HTMLMetaElement>('meta[name="lean-ssg"]')?.content;
  const canHydrate = Boolean(
    route.page !== 'notFound' && ssgPath && ssgPath === canonicalRoutePath(route),
  );

  if (canHydrate) {
    // SSG 已预先渲染首屏 DOM，这里只原地补充交互状态，避免替换 #app 导致 LCP 延后或布局抖动。
    if (location.search || location.hash) {
      const langSwitch = root.querySelector<HTMLAnchorElement>('#lang-switch');
      if (langSwitch) {
        langSwitch.href = `${swapLocalePath(location.pathname, route.locale)}${location.search}${location.hash}`;
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
      case 'challenge': {
        const { mountChallenge } = await import('./views/challenge');
        await mountChallenge(root, route.locale, route.slug);
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
    case 'challenges': {
      const { renderChallenges } = await import('./views/challenge');
      content = renderChallenges(route.locale);
      break;
    }
    case 'challenge': {
      const { renderChallenge, mountChallenge } = await import('./views/challenge');
      content = renderChallenge(route.locale, route.slug);
      mount = () => mountChallenge(root, route.locale, route.slug);
      break;
    }
    case 'notFound':
      content = renderNotFound(route.locale);
      break;
    default: {
      const visited = readProgress();
      const completed = readCompleted();
      content = renderHome(route.locale, visited, completed);
      mount = () => hydrateHome(root, route.locale, visited, completed);
    }
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

// 静态层始终输出英文首页给爬虫；真实中文用户且未手动选过语言时，
// 在客户端静默切到 /zh/，保留地址里的查询串与锚点。
if (
  shouldLocalizeRoot({
    pathname: location.pathname,
    savedLocale: readLocalePreference(),
    webdriver: navigator.webdriver === true,
    userAgent: navigator.userAgent,
    languages: navigator.languages?.length ? navigator.languages : [navigator.language],
  })
) {
  history.replaceState(null, '', `/zh/${location.search}${location.hash}`);
  resolution = resolveRoute(location.pathname, fallbackLocale);
}

if (resolution.kind === 'route' && app) {
  void boot(resolution.route, app);
}
