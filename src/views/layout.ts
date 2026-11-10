import { ghostButtonClass } from '../components/ui';
import { localeLabel, messagesFor, otherLocale, rememberLocale, type Locale } from '../i18n';
import { getAutoStart, setAutoStart } from '../settings';
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

  const navLink = (isActive: boolean) =>
    isActive
      ? 'rounded-lg bg-accent-soft px-2.5 py-1.5 text-sm text-fg no-underline'
      : 'rounded-lg px-2.5 py-1.5 text-sm text-muted no-underline hover:bg-panel-soft hover:text-fg';

  const nav = navItems
    .map((item) => `<a class="${navLink(item.page === active)}" href="${item.href}">${item.label}</a>`)
    .join('');

  const isPlayground = active === 'playground';

  return `
    <header class="sticky top-0 z-20 border-b border-line bg-bg/82 backdrop-blur-md">
      <div class="mx-auto flex max-w-[1160px] items-center gap-5 gutter-x py-3.5 max-[900px]:flex-wrap max-[900px]:gap-2.5">
        <a class="inline-flex items-center gap-2.5 whitespace-nowrap font-[650] text-fg no-underline" href="/${locale}/">
          <span class="grid size-7 place-items-center rounded-lg bg-accent text-[17px] font-bold text-accent-contrast">λ</span>
          <span>Lean Init IDE</span>
        </a>
        <nav class="ml-2 flex flex-1 flex-wrap gap-1 max-[900px]:order-3 max-[900px]:ml-0 max-[900px]:w-full">${nav}</nav>
        <div class="flex gap-2">
          <a id="lang-switch" class="${ghostButtonClass}" href="/${other}${rest}" title="${t.language.label}">
            ${localeLabel(other)}
          </a>
          <button id="theme-toggle" class="${ghostButtonClass}" type="button" title="${themeLabel}">
            ${themeLabel}
          </button>
          <div class="relative">
            <button
              id="settings-toggle"
              class="${ghostButtonClass}"
              type="button"
              aria-expanded="false"
              aria-controls="settings-panel"
            >
              ${t.settings.label}
            </button>
            <div
              id="settings-panel"
              class="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(320px,calc(100vw-32px))] rounded-xl border border-line bg-panel p-4 shadow-[var(--shadow)]"
              hidden
            >
              <h2 class="mt-0 mb-3 text-xs font-[650] uppercase tracking-[0.07em] text-muted">${t.settings.title}</h2>
              <label class="flex cursor-pointer items-start gap-2.5">
                <input id="auto-start" class="mt-[3px] accent-accent" type="checkbox" />
                <span>
                  <strong class="block text-[13px] font-semibold">${t.settings.autoStart}</strong>
                  <small class="mt-1 block text-xs leading-normal text-muted">${t.settings.autoStartHint}</small>
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </header>
    <main
      id="main"
      class="${isPlayground ? 'w-full max-w-none p-0' : 'mx-auto w-full max-w-[1160px] gutter-x pb-12 pt-[clamp(24px,5vw,56px)]'} flex-1"
    >${content}</main>
    <footer
      class="mx-auto flex w-full flex-wrap justify-between gap-x-6 gap-y-2 gutter-x pb-6 pt-4 text-xs text-muted ${isPlayground ? 'max-w-none' : 'max-w-[1160px]'}"
    >
      <span>${t.footer.note}</span>
      <span class="inline-flex gap-4">
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

  const settingsToggle = root.querySelector<HTMLButtonElement>('#settings-toggle');
  const settingsPanel = root.querySelector<HTMLElement>('#settings-panel');
  const autoStart = root.querySelector<HTMLInputElement>('#auto-start');

  if (autoStart) autoStart.checked = getAutoStart();
  autoStart?.addEventListener('change', () => setAutoStart(autoStart.checked));

  settingsToggle?.addEventListener('click', (event) => {
    if (!settingsPanel) return;
    event.stopPropagation();
    settingsPanel.hidden = !settingsPanel.hidden;
    settingsToggle.setAttribute('aria-expanded', String(!settingsPanel.hidden));
  });

  document.addEventListener('click', (event) => {
    if (!settingsPanel || settingsPanel.hidden) return;
    const target = event.target;
    if (target instanceof Node && settingsPanel.parentElement?.contains(target)) return;
    settingsPanel.hidden = true;
    settingsToggle?.setAttribute('aria-expanded', 'false');
  });

  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  paintThemeButton();
};
