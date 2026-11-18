import { resolveChallengeParam } from '../challenges';
import { renderLeanMarkup } from '../components/lean-markup';
import { currentMemoryTier } from '../device';
import { draftKeyFor, readDraft } from '../draft';
import { loadLessons, messagesFor, type Locale } from '../i18n';
import { getAutoStart } from '../settings';
import { escapeHtml } from './html';

export const renderPlayground = (locale: Locale = 'zh'): string =>
  `<div data-role="playground">${renderLeanMarkup(locale, 'full', messagesFor(locale).playground)}</div>`;

/**
 * 挑战入口会带 ?challenge=<slug> 过来。题面固定展示；如果本机已有个人草稿，
 * 编辑器仍然先恢复草稿，再由用户显式选择是否换成题目骨架。
 */
const renderChallengeNotice = (
  locale: Locale,
  slug: string,
  title: string,
  body: string,
  hasDraft: boolean,
): HTMLElement => {
  const t = messagesFor(locale).playground;
  const notice = document.createElement('section');
  notice.dataset.role = 'challenge-notice';
  notice.className = 'border-b border-line bg-panel-soft gutter-x py-3';
  const actions = hasDraft
    ? `<div class="mt-2 flex flex-wrap items-center gap-2">
         <button class="inline-flex min-h-8 cursor-pointer items-center rounded-lg bg-accent px-3 py-1 text-xs font-[650] text-accent-contrast" type="button" data-role="challenge-load">${t.challengeNoticeLoad}</button>
         <button class="inline-flex min-h-8 cursor-pointer items-center rounded-lg border border-line px-3 py-1 text-xs text-muted hover:text-fg" type="button" data-role="challenge-keep">${t.challengeNoticeKeep}</button>
         <span data-role="challenge-notice-status" role="status" aria-live="polite" class="text-xs text-muted"></span>
       </div>`
    : '';
  notice.innerHTML = `
    <p class="m-0 text-[11px] uppercase tracking-[0.08em] text-accent">${t.challengeNoticeTitle}</p>
    <p class="mt-1 mb-0 text-[13px] font-[650]">${escapeHtml(title)}</p>
    <p class="mt-1 mb-0 max-w-[820px] text-[13px] leading-relaxed text-muted">${escapeHtml(body)}</p>
    ${hasDraft ? `<p class="mt-1 mb-0 max-w-[820px] text-xs leading-relaxed text-muted">${t.challengeNoticeBody}</p>` : ''}
    ${actions}
  `;
  notice.dataset.challengeSlug = slug;
  return notice;
};

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

  // 课程页的「练习」按钮会带 ?lesson=<slug> 过来，直接载入该课的 starter；
  // 挑战页则会带 ?challenge=<slug>，两者同时出现时以课程为准。
  const slug = new URLSearchParams(location.search).get('lesson');
  const lesson = slug ? (await loadLessons(locale)).find((item) => item.slug === slug) : undefined;
  const challenge = lesson ? undefined : resolveChallengeParam(location.search);
  const code =
    lesson?.exercise?.starter ??
    challenge?.starter[locale] ??
    messagesFor(locale).playground.defaultCode;
  const draftKey = draftKeyFor(lesson?.slug);
  const draft = challenge ? readDraft(draftKey) : null;
  const hasPersonalDraft = Boolean(challenge && draft && draft.code !== challenge.starter[locale]);

  // 把 3.5MB Monaco 与 LSP 推迟到页面骨架渲染完再按需加载，不阻塞首屏 H1 绘制。
  const { createLeanPanel } = await import('../components/lean-panel');
  earlyStartEl?.removeEventListener('click', onEarlyStart);
  if (earlyStartEl) earlyStartEl.disabled = false;

  // 低内存设备忽略自动启动偏好：下载 102MB 前必须有明确的人工确认（已点击启动除外）。
  const panel = createLeanPanel(host, {
    variant: 'full',
    code,
    locale,
    lessonSlug: lesson?.slug,
    draftKey,
    autoStart: getAutoStart() && currentMemoryTier() !== 'low',
    startImmediately: startRequested,
  });

  if (!challenge) return;

  const notice = renderChallengeNotice(
    locale,
    challenge.slug,
    challenge.title[locale],
    challenge.body[locale],
    hasPersonalDraft,
  );
  host.prepend(notice);

  const statusEl = notice.querySelector<HTMLElement>('[data-role="challenge-notice-status"]');
  notice
    .querySelector<HTMLButtonElement>('[data-role="challenge-load"]')
    ?.addEventListener('click', () => {
      panel.setCode(challenge.starter[locale], { focus: true });
      if (statusEl) statusEl.textContent = messagesFor(locale).playground.challengeLoaded;
    });
  notice
    .querySelector<HTMLButtonElement>('[data-role="challenge-keep"]')
    ?.addEventListener('click', () => {
      if (statusEl) statusEl.textContent = messagesFor(locale).playground.challengeNoticeKept;
    });
};
