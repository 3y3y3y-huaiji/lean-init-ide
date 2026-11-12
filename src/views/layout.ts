import { ghostButtonClass } from '../components/ui';
import { localeLabel, messagesFor, otherLocale, rememberLocale, type Locale } from '../i18n';
import { FIRST_LESSON_SLUG } from '../router';
import { clearRuntimeCache } from '../runtime-cache';
import { getAutoStart, setAutoStart } from '../settings';
import { cycleThemePreference, getThemePreference } from '../theme';
import type { ThemePreference } from '../theme';

export type ActivePage = 'home' | 'lesson' | 'playground' | 'privacy';

const REPO_URL = 'https://github.com/3y3y3y-huaiji/lean-init-ide';

const iconAttrs =
  'width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const themeIcons: Record<ThemePreference, string> = {
  system: `<svg ${iconAttrs}><rect x="2" y="2.5" width="12" height="8.5" rx="1.2"/><path d="M6 13.5h4"/></svg>`,
  light: `<svg ${iconAttrs}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1"/></svg>`,
  dark: `<svg ${iconAttrs}><path d="M13 9.6A5.5 5.5 0 0 1 6.4 3 5.5 5.5 0 1 0 13 9.6Z"/></svg>`,
};

const slidersIcon = `<svg ${iconAttrs}><path d="M2 4.5h3M9 4.5h5M2 11.5h5M11 11.5h3"/><circle cx="7" cy="4.5" r="1.6"/><circle cx="9" cy="11.5" r="1.6"/></svg>`;

export const renderLayout = (locale: Locale, active: ActivePage, content: string): string => {
  const t = messagesFor(locale);
  const other = otherLocale(locale);
  const rest = location.pathname.replace(/^\/(?:zh|en)(?=\/|$)/, '') || '/';
  // 切换语言时保留查询串：练习页的 ?lesson= 不能丢，否则会退回空白编辑器。
  const suffix = `${location.search}${location.hash}`;
  const pref = getThemePreference();
  const themeLabel = `${t.theme.label} · ${t.theme[pref]}`;

  const navItems: Array<{ page: ActivePage; href: string; label: string }> = [
    { page: 'home', href: `/${locale}/`, label: t.nav.home },
    { page: 'lesson', href: `/${locale}/learn/${FIRST_LESSON_SLUG}`, label: t.nav.lesson },
    { page: 'playground', href: `/${locale}/playground`, label: t.nav.playground },
  ];

  const navLink = (isActive: boolean) =>
    isActive
      ? 'inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-lg bg-accent-soft px-3 py-1.5 text-sm text-fg no-underline min-[901px]:min-h-0 min-[901px]:px-2.5'
      : 'inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted no-underline hover:bg-panel-soft hover:text-fg min-[901px]:min-h-0 min-[901px]:px-2.5';

  const nav = navItems
    .map(
      (item) => `<a class="${navLink(item.page === active)}" href="${item.href}">${item.label}</a>`,
    )
    .join('');

  const isPlayground = active === 'playground';
  const compactLocale = other === 'en' ? 'EN' : '中';

  return `
    <header class="sticky top-0 z-20 border-b border-line bg-bg/82 backdrop-blur-md max-[900px]:static">
      <div class="mx-auto flex max-w-[1160px] flex-wrap items-center gap-x-4 gap-y-2 gutter-x py-2.5 min-[901px]:py-3.5">
        <a class="inline-flex min-w-0 items-center gap-2.5 whitespace-nowrap font-[650] text-fg no-underline" href="/${locale}/">
          <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-[17px] font-bold text-accent-contrast">λ</span>
          <span class="truncate">Lean Init IDE</span>
        </a>
        <nav class="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-[640px]:order-3 max-[640px]:w-full min-[641px]:ml-2 min-[641px]:flex-1 min-[641px]:pb-0">${nav}</nav>
        <div class="order-2 ml-auto flex shrink-0 items-center gap-1.5 max-[400px]:gap-1 min-[641px]:order-none min-[641px]:ml-0 min-[901px]:gap-2">
          <a
            id="lang-switch"
            class="${ghostButtonClass} max-[900px]:size-10 max-[900px]:px-0"
            href="/${other}${rest}${suffix}"
            title="${t.language.label}"
            aria-label="${t.language.label}"
          >
            <span class="max-[900px]:hidden">${localeLabel(other)}</span>
            <span class="hidden text-xs font-semibold max-[900px]:inline">${compactLocale}</span>
          </a>
          <button
            id="theme-toggle"
            class="${ghostButtonClass} max-[900px]:size-10 max-[900px]:px-0"
            type="button"
            title="${themeLabel}"
            aria-label="${themeLabel}"
          >
            <span data-theme-text class="max-[900px]:hidden">${themeLabel}</span>
            <span data-theme-icon class="hidden max-[900px]:block">${themeIcons[pref]}</span>
          </button>
          <div class="relative">
            <button
              id="settings-toggle"
              class="${ghostButtonClass} max-[900px]:size-10 max-[900px]:px-0"
              type="button"
              aria-expanded="false"
              aria-controls="settings-panel"
              aria-label="${t.settings.label}"
            >
              <span class="max-[900px]:hidden">${t.settings.label}</span>
              <span class="hidden max-[900px]:block">${slidersIcon}</span>
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
              <div class="mt-4 border-t border-line pt-3">
                <button
                  id="clear-cache"
                  class="${ghostButtonClass} w-full justify-center"
                  type="button"
                >${t.settings.clearCache}</button>
                <small class="mt-2 block text-xs leading-normal text-muted">${t.settings.clearCacheHint}</small>
                <small
                  id="clear-cache-status"
                  class="mt-2 block text-xs leading-normal"
                  role="status"
                  aria-live="polite"
                  hidden
                ></small>
              </div>
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
        <a href="/${locale}/privacy">${t.footer.privacy}</a>
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
    themeButton.title = label;
    themeButton.setAttribute('aria-label', label);
    const text = themeButton.querySelector<HTMLElement>('[data-theme-text]');
    if (text) text.textContent = label;
    const icon = themeButton.querySelector<HTMLElement>('[data-theme-icon]');
    if (icon) icon.innerHTML = themeIcons[pref];
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

  const clearCache = root.querySelector<HTMLButtonElement>('#clear-cache');
  const clearCacheStatus = root.querySelector<HTMLElement>('#clear-cache-status');
  clearCache?.addEventListener('click', async () => {
    if (!clearCache) return;
    const label = clearCache.textContent;
    clearCache.disabled = true;
    clearCache.textContent = t.settings.clearCacheBusy;
    if (clearCacheStatus) {
      clearCacheStatus.hidden = true;
      clearCacheStatus.textContent = '';
    }
    try {
      await clearRuntimeCache();
      if (clearCacheStatus) {
        clearCacheStatus.textContent = t.settings.clearCacheDone;
        clearCacheStatus.className = 'mt-2 block text-xs leading-normal text-ok';
        clearCacheStatus.hidden = false;
      }
    } catch {
      if (clearCacheStatus) {
        clearCacheStatus.textContent = t.settings.clearCacheFailed;
        clearCacheStatus.className = 'mt-2 block text-xs leading-normal text-err';
        clearCacheStatus.hidden = false;
      }
    } finally {
      clearCache.disabled = false;
      clearCache.textContent = label;
    }
  });

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
