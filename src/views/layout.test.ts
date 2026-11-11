import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesFor } from '../i18n';
import { setAutoStart } from '../settings';
import { getThemePreference, setThemePreference } from '../theme';
import { bindLayout, renderLayout } from './layout';

const setPath = (path: string) => window.history.replaceState({}, '', path);

const mount = (locale: 'zh' | 'en' = 'zh') => {
  document.body.innerHTML = renderLayout(locale, 'home', '<p id="probe">内容</p>');
  bindLayout(document.body, locale);
};

describe('页面骨架渲染', () => {
  beforeEach(() => {
    setThemePreference('system');
    setPath('/zh/learn/first-proof');
  });

  it('导航渲染三项并高亮当前页', () => {
    const t = messagesFor('zh');
    const html = renderLayout('zh', 'lesson', '');

    expect(html).toContain(t.nav.home);
    expect(html).toContain(t.nav.lesson);
    expect(html).toContain(t.nav.playground);
    expect(html).toContain(`href="/zh/learn/first-proof"`);
    expect(html).toContain('bg-accent-soft');
  });

  it('语言切换保留当前路径的其余部分', () => {
    expect(renderLayout('zh', 'lesson', '')).toContain('href="/en/learn/first-proof"');

    setPath('/en/playground');
    expect(renderLayout('en', 'playground', '')).toContain('href="/zh/playground"');
  });

  it('根路径下语言切换回到对应首页', () => {
    setPath('/zh');
    expect(renderLayout('zh', 'home', '')).toContain('href="/en/"');
  });

  it('playground 页面让主区域撑满宽度', () => {
    const playground = renderLayout('zh', 'playground', '');
    const home = renderLayout('zh', 'home', '');

    expect(playground).toContain('max-w-none');
    expect(home).not.toContain('max-w-none');
  });

  it('内容被原样注入主区域', () => {
    expect(renderLayout('zh', 'home', '<p id="probe">内容</p>')).toContain(
      '<p id="probe">内容</p>',
    );
  });

  it('主题按钮同时带标签与当前偏好', () => {
    setThemePreference('dark');
    const t = messagesFor('zh');

    const html = renderLayout('zh', 'home', '');
    expect(html).toContain(`${t.theme.label} · ${t.theme.dark}`);
  });
});

describe('骨架交互绑定', () => {
  beforeEach(() => {
    localStorage.clear();
    setPath('/zh/');
    setThemePreference('system');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('点击主题按钮切到下一个偏好并更新文案', () => {
    mount('zh');
    const button = document.body.querySelector<HTMLButtonElement>('#theme-toggle');
    expect(button).not.toBeNull();

    const before = button!.textContent;
    const previous = getThemePreference();
    button!.click();

    expect(getThemePreference()).not.toBe(previous);
    expect(button!.textContent).not.toBe(before);
  });

  it('设置面板可开合并同步 aria-expanded', () => {
    mount('zh');
    const toggle = document.body.querySelector<HTMLButtonElement>('#settings-toggle')!;
    const panel = document.body.querySelector<HTMLElement>('#settings-panel')!;

    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('自动启动开关回显已保存的偏好', () => {
    setAutoStart(true);
    mount('zh');

    expect(document.body.querySelector<HTMLInputElement>('#auto-start')!.checked).toBe(true);
  });

  it('切换开关会写回存储', () => {
    setAutoStart(false);
    mount('zh');
    const input = document.body.querySelector<HTMLInputElement>('#auto-start')!;
    const spy = vi.spyOn(Storage.prototype, 'setItem');

    input.checked = true;
    input.dispatchEvent(new Event('change'));

    expect(spy).toHaveBeenCalledWith('lean:auto-start', 'true');
  });

  it('点击语言切换记住目标语言但不触发导航', () => {
    mount('zh');
    const link = document.body.querySelector<HTMLAnchorElement>('#lang-switch')!;
    const spy = vi.spyOn(Storage.prototype, 'setItem');

    // jsdom 会把 <a> 的默认行为当成真实导航并打印未实现警告。
    link.addEventListener('click', (event) => event.preventDefault(), {
      capture: true,
      once: true,
    });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(spy).toHaveBeenCalledWith('lean:locale', 'en');
  });

  it('把文档语言同步到当前 locale', () => {
    mount('en');
    expect(document.documentElement.lang).toBe('en');

    mount('zh');
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
