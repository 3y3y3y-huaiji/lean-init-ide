import { localeLabel, messagesFor, otherLocale, rememberLocale, type Locale } from '../i18n';
import { cycleThemePreference, getThemePreference } from '../theme';
import type { ThemePreference } from '../theme';

export type ActivePage = 'home' | 'lesson' | 'playground';

const REPO_URL = 'https://github.com/3y3y3y-huaiji/lean-init-ide';

export const renderLayout = (locale: Locale, active: ActivePage, content: string): string => {
  const t = messagesFor(locale);
  const other = otherLocale(locale);
  const rest = location.pathname.replace(/^\/(?:zh|en)(?=\/|$)/, '') || '/';
  const pref = getThemePreference();
  const themeLabel = `${t.theme.label} · ${t.theme[pref]}`;

  const navItems: Array<{ page: ActivePage; href: string; label: string }> = [
    { page: 'home', href: `/${locale}/`, label: t.nav.home },
    { page: 'lesson', href: `/${locale}/learn/first-proof`, label: t.nav.lesson },
    { page: 'playground', href: `/${locale}/playground`, label: t.nav.playground },
  ];

  const nav = navItems
    .map(
      (item) =>
        `<a class="site-nav-link${item.page === active ? ' is-active' : ''}" href="${item.href}">${item.label}</a>`,
    )
    .join('');

  return `
    <header class="site-header">
      <div class="site-header-inner">
        <a class="brand" href="/${locale}/">
          <span class="brand-mark">λ</span>
          <span>Lean Init IDE</span>
        </a>
        <nav class="site-nav">${nav}</nav>
        <div class="site-actions">
          <a id="lang-switch" class="ghost-button" href="/${other}${rest}" title="${t.language.label}">
            ${localeLabel(other)}
          </a>
          <button id="theme-toggle" class="ghost-button" type="button" title="${themeLabel}">
            ${themeLabel}
          </button>
        </div>
      </div>
    </header>
    <main id="main" class="page-main">${content}</main>
    <footer class="site-footer">
      <span>${t.footer.note}</span>
      <span class="site-footer-links">
        <a href="${REPO_URL}" target="_blank" rel="noreferrer">${t.footer.repo}</a>
        <span>${t.footer.license}</span>
      </span>
    </footer>
  `;
};

export const bindLayout = (root: HTMLElement, locale: Locale) => {
  const t = messagesFor(locale);
  const themeButton = root.querySelector<HTMLButtonElement>('#theme-toggle');

  const paintThemeButton = () => {
    if (!themeButton) return;
    const pref: ThemePreference = getThemePreference();
    const label = `${t.theme.label} · ${t.theme[pref]}`;
    themeButton.textContent = label;
    themeButton.title = label;
  };

  themeButton?.addEventListener('click', () => {
    cycleThemePreference();
    paintThemeButton();
  });

  root.querySelector<HTMLAnchorElement>('#lang-switch')?.addEventListener('click', () => {
    rememberLocale(otherLocale(locale));
  });

  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  paintThemeButton();
};
