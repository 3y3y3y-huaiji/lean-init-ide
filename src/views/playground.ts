import { renderLeanMarkup } from '../components/lean-markup';
import { currentMemoryTier } from '../device';
import { draftKeyFor } from '../draft';
import { messagesFor, type Locale } from '../i18n';
import { getAutoStart } from '../settings';

const DEFAULT_CODE = `def bad : Nat := true

theorem add_comm (a b : Nat) : a + b = b + a := by
  induction a with
  | zero => simp
  | succ a ih => simp only [Nat.succ_add, Nat.add_succ, ih]

#check Nat.add
`;

export const renderPlayground = (locale: Locale = 'zh'): string =>
  `<div data-role="playground">${renderLeanMarkup(locale, 'full', messagesFor(locale).playground)}</div>`;

export const mountPlayground = async (root: HTMLElement, locale: Locale): Promise<void> => {
  const host = root.querySelector<HTMLElement>('[data-role="playground"]');
  if (!host) return;

  // 在 3.5MB Monaco 主包异步加载期间捕获点击「启动 Lean」，避免 SSG 首帧按钮静默丢点击。
  let startRequested = false;
  const earlyStartEl = host.querySelector<HTMLButtonElement>('[data-role="start"]');
  const earlyStatusEl = host.querySelector<HTMLElement>('[data-role="status"]');
  const onEarlyStart = () => {
    startRequested = true;
    if (earlyStartEl) earlyStartEl.disabled = true;
    if (earlyStatusEl) {
      earlyStatusEl.textContent = messagesFor(locale).playground.statusLoading;
      earlyStatusEl.dataset.state = 'loading';
    }
  };
  earlyStartEl?.addEventListener('click', onEarlyStart, { once: true });

  // 课程页的「练习」按钮会带 ?lesson=<slug> 过来，直接载入该课的 starter。
  const slug = new URLSearchParams(location.search).get('lesson');
  const lesson = messagesFor(locale).lesson.lessons.find((item) => item.slug === slug);
  const code = lesson?.exercise?.starter ?? DEFAULT_CODE;

  // 把 3.5MB Monaco 与 LSP 推迟到页面骨架渲染完再按需加载，不阻塞首屏 H1 绘制。
  const { createLeanPanel } = await import('../components/lean-panel');
  earlyStartEl?.removeEventListener('click', onEarlyStart);
  if (earlyStartEl) earlyStartEl.disabled = false;

  // 低内存设备忽略自动启动偏好：下载 102MB 前必须有明确的人工确认（已点击启动除外）。
  createLeanPanel(host, {
    variant: 'full',
    code,
    locale,
    lessonSlug: lesson?.slug,
    draftKey: draftKeyFor(lesson?.slug),
    autoStart: getAutoStart() && currentMemoryTier() !== 'low',
    startImmediately: startRequested,
  });
};
