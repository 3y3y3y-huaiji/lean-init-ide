/**
 * 挑战区的纯渲染与浏览器挂载。
 *
 * 渲染函数不读 location、不写 localStorage，SSG 与运行时回退共用；
 * 只有 mountChallenge 里才绑定编辑器与剪贴板，符合 views 层的边界约定。
 */
import { countGoalTargets } from '../challenge-goal';
import { ChallengeProgressStore } from '../challenge-progress';
import {
  challengeBySlug,
  challengePath,
  challengesPath,
  CHALLENGES,
  type Challenge,
} from '../challenges';
import { renderLeanMarkup, showEditorLoadFailure } from '../components/lean-markup';
import { buttonClass, ghostButtonClass, toolbarButtonClass } from '../components/ui';
import { currentMemoryTier, shouldAutoStart } from '../device';
import { draftKeyFor } from '../draft';
import {
  analyzeProofStyle,
  isChallengeSolved,
  solvedChallengeTiers,
  type ChallengeSpec,
  type ProofBadge,
} from '../exercise';
import { issueUrl } from '../feedback';
import { messagesFor, type Locale } from '../i18n';
import { renderNotFound } from '../page-meta';
import { escapeHtml } from './html';

type ChallengeMessages = ReturnType<typeof messagesFor>['challenges'];

/** 把判题需要的最小结构拼出来，视图不需要知道数据表的其余字段。 */
const challengeSpec = (challenge: Challenge, locale: Locale): ChallengeSpec => ({
  mode: challenge.mode,
  starter: challenge.starter[locale],
  verdict: challenge.verdict,
  requiredConclusion: challenge.requiredConclusion,
  bounty: challenge.bounty,
});

const badgeLabel = (t: ChallengeMessages, badge: ProofBadge): string =>
  badge === 'automation'
    ? t.badgeLabels.automation
    : badge === 'handcrafted'
      ? t.badgeLabels.handcrafted
      : t.badgeLabels.termMode;

/** 每道题一份独立草稿，避免不同题目的骨架互相覆盖。 */
export const challengeDraftKey = (slug: string): string => draftKeyFor(`challenge-${slug}`);

const playgroundLink = (locale: Locale, slug: string): string =>
  `/${locale}/playground?challenge=${encodeURIComponent(slug)}`;

/**
 * 零基础导览：先说明 Lean 在做什么，再给出「读题 → 看 Goal → 补证明」三步。
 * 默认展开，避免小白直接面对一块没有任何上下文的编辑器。
 */
const renderIntro = (locale: Locale): string => {
  const t = messagesFor(locale).challenges.intro;
  const steps = t.steps
    .map(
      (step) => `
        <li class="rounded-lg border border-line bg-panel-soft p-3">
          <p class="m-0 text-[13px] font-[650]">${escapeHtml(step.title)}</p>
          <p class="mt-1 mb-0 text-xs leading-relaxed text-muted">${escapeHtml(step.text)}</p>
        </li>`,
    )
    .join('');
  return `
    <details data-role="challenge-intro" open class="rounded-2xl border border-line bg-panel p-5">
      <summary class="flex min-h-9 max-[1024px]:min-h-11 touch:min-h-11 cursor-pointer items-center text-sm font-[650]">${escapeHtml(t.title)}</summary>
      <p class="mt-2 mb-0 max-w-[720px] text-sm leading-relaxed text-muted">${escapeHtml(t.body)}</p>
      <ol class="m-0 mt-3 grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2 p-0">${steps}</ol>
      <p class="mt-3 mb-0 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs leading-relaxed text-fg">${escapeHtml(t.codeNote)}</p>
    </details>`;
};

const challengeCard = (locale: Locale, challenge: Challenge, index: number): string => {
  const t = messagesFor(locale).challenges;
  return `
    <article data-challenge-slug="${escapeHtml(challenge.slug)}" class="flex flex-col rounded-2xl border border-line bg-panel p-5">
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="m-0 text-xs uppercase tracking-[0.08em] text-muted">0${index + 1}</p>
        <span class="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[11px] font-[650] text-accent">${escapeHtml(t.modes[challenge.mode])}</span>
      </div>
      <h2 class="m-0 mb-2 text-[17px] font-bold">${escapeHtml(challenge.title[locale])}</h2>
      <p class="m-0 mb-3 flex-1 text-sm leading-relaxed text-muted">${escapeHtml(challenge.summary[locale])}</p>
      <p data-role="card-badges" class="m-0 mb-3 text-xs leading-relaxed text-ok"></p>
      <div class="flex flex-wrap gap-2">
        <a class="${buttonClass}" href="${challengePath(locale, challenge.slug)}">${t.cardCta}</a>
        <a class="${ghostButtonClass}" href="${playgroundLink(locale, challenge.slug)}">${t.detail.openInPlayground}</a>
      </div>
    </article>`;
};

export const renderChallenges = (locale: Locale): string => {
  const t = messagesFor(locale).challenges;
  return `
    <section class="max-w-[760px]">
      <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${t.eyebrow}</p>
      <h1 class="mt-0 mb-4 text-[clamp(28px,4.4vw,42px)] tracking-[-0.02em]">${t.title}</h1>
      <p class="mt-0 mb-0 max-w-[640px] text-[clamp(15px,1.6vw,18px)] leading-relaxed text-muted">${t.lead}</p>
    </section>
    <section
      data-role="challenge-summary"
      class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] font-[650]"
    >
      <span data-role="summary-solved">${escapeHtml(t.summary.solved(0, CHALLENGES.length))}</span>
      <span data-role="summary-badges" class="text-muted">${escapeHtml(t.summary.badges(0, 0, 0))}</span>
    </section>
    <section class="mt-[clamp(24px,3.4vw,36px)] max-w-[760px]">${renderIntro(locale)}</section>
    <section
      data-role="challenge-list"
      class="mt-[clamp(28px,4vw,44px)] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5"
    >${CHALLENGES.map((challenge, index) => challengeCard(locale, challenge, index)).join('')}</section>
  `;
};

/** 浏览器挂载列表页：读取本地战绩并刷新顶部统计与卡片勋章。 */
export const mountChallenges = (root: HTMLElement, locale: Locale): void => {
  const t = messagesFor(locale).challenges;
  const store = new ChallengeProgressStore();
  const summary = store.summary(CHALLENGES.map((challenge) => challenge.slug));

  const solvedEl = root.querySelector<HTMLElement>('[data-role="summary-solved"]');
  if (solvedEl) solvedEl.textContent = t.summary.solved(summary.solved, CHALLENGES.length);
  const badgesEl = root.querySelector<HTMLElement>('[data-role="summary-badges"]');
  if (badgesEl) {
    badgesEl.textContent = t.summary.badges(
      summary.badges.automation,
      summary.badges.handcrafted,
      summary.badges['term-mode'],
    );
  }

  for (const card of root.querySelectorAll<HTMLElement>('[data-challenge-slug]')) {
    const slug = card.dataset.challengeSlug;
    const slot = card.querySelector<HTMLElement>('[data-role="card-badges"]');
    if (!slug || !slot) continue;
    const record = store.get(slug);
    slot.textContent = record.solved
      ? record.badges.map((badge) => badgeLabel(t, badge)).join(' · ')
      : '';
  }
};

export const renderChallenge = (locale: Locale, slug: string | undefined): string => {
  const challenge = challengeBySlug(slug);
  if (!challenge) return renderNotFound(locale);

  const messages = messagesFor(locale);
  const t = messages.challenges;
  const detail = t.detail;
  const panelMessages = {
    ...messages.playground,
    title: t.editorTitle,
    hint: detail.starterNote,
  };
  const tactics = challenge.tactics
    .map(
      (tactic, index) => `
        <div class="rounded-lg border border-line bg-panel-soft p-2.5">
          <button type="button" class="${toolbarButtonClass}" data-tactic-index="${index}">${escapeHtml(tactic.label)}</button>
          <p class="mt-1.5 mb-0 text-xs leading-relaxed text-muted">${escapeHtml(tactic.description[locale])}</p>
        </div>`,
    )
    .join('');

  return `
    <section data-role="challenge" class="pb-4">
      <a class="inline-flex min-h-9 max-[1024px]:min-h-11 touch:min-h-11 items-center text-[13px] text-muted no-underline hover:text-accent" href="${challengesPath(locale)}">${detail.back}</a>
      <div class="mt-3 max-w-[760px]">
        <p class="m-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${t.eyebrow}</p>
        <h1 class="mt-0 mb-3 text-[clamp(26px,4vw,38px)] tracking-[-0.02em]">${escapeHtml(challenge.title[locale])}</h1>
        <p class="m-0 text-[15px] leading-relaxed text-muted">${escapeHtml(challenge.body[locale])}</p>
      </div>

      <div class="mt-4 max-w-[760px]">${renderIntro(locale)}</div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <a class="${ghostButtonClass}" href="${playgroundLink(locale, challenge.slug)}">${detail.openInPlayground}</a>
        <button class="${ghostButtonClass}" type="button" data-role="copy-link">${detail.copyLink}</button>
        <span
          data-role="copy-status"
          role="status"
          aria-live="polite"
          class="min-w-0 text-xs text-muted"
          hidden
        ></span>
      </div>

      <section
        data-role="challenge-tactics"
        class="mt-6 rounded-xl border border-line bg-panel p-3.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span data-role="goal-progress" class="text-[13px] font-[650] text-fg">${detail.goalsNone}</span>
          <span class="text-xs uppercase tracking-[0.08em] text-muted">${detail.tacticsTitle}</span>
        </div>
        <p class="mt-1.5 mb-0 text-xs leading-relaxed text-muted">${detail.tacticsHint}</p>
        <div class="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2">${tactics}</div>
      </section>

      <div data-role="challenge-panel" class="mt-3">${renderLeanMarkup(
        locale,
        'full',
        panelMessages,
        undefined,
        { heading: false },
      )}</div>

      <section
        data-role="challenge-result"
        class="mt-4 rounded-xl border border-ok/40 bg-ok/10 p-4 text-ok"
        aria-live="polite"
        hidden
      >
        <p data-role="result-title" class="m-0 text-[15px] font-bold"></p>
        <p data-role="result-badges" class="m-0 mt-1.5 text-sm"></p>
        <p data-role="result-tiers" class="m-0 mt-1 text-sm" hidden></p>
        <p data-role="result-chars" class="m-0 mt-1 text-sm"></p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button class="${ghostButtonClass}" type="button" data-role="copy-card">${detail.copyCard}</button>
          <span
            data-role="result-copy-status"
            role="status"
            aria-live="polite"
            class="min-w-0 text-xs"
            hidden
          ></span>
        </div>
      </section>

      <div class="mt-6 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3.5">
        <details data-role="hint" class="rounded-xl border border-line bg-panel p-4">
          <summary class="flex min-h-9 max-[1024px]:min-h-11 touch:min-h-11 cursor-pointer items-center text-[13px] font-[650]">${detail.hintLabel}</summary>
          <p class="mt-2 mb-0 text-sm leading-relaxed text-muted">${escapeHtml(challenge.hint[locale])}</p>
        </details>
        <details data-role="solution" class="rounded-xl border border-line bg-panel p-4">
          <summary class="flex min-h-9 max-[1024px]:min-h-11 touch:min-h-11 cursor-pointer items-center text-[13px] font-[650]">${detail.solutionTitle}</summary>
          <p class="mt-2 mb-2 text-sm leading-relaxed text-muted">${detail.solutionHint}</p>
          <button class="${ghostButtonClass}" type="button" data-role="load-solution">${detail.loadSolution}</button>
          <pre class="mt-3 mb-0 overflow-auto rounded-lg border border-line bg-panel-soft p-3 font-mono text-xs leading-[1.65] text-fg"><code>${escapeHtml(
            challenge.solution[locale],
          )}</code></pre>
        </details>
      </div>

      <div class="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span class="mr-1 text-xs text-muted">${escapeHtml(detail.feedbackHint)}</span>
        <a class="${ghostButtonClass}" target="_blank" rel="noopener noreferrer" href="${escapeHtml(
          issueUrl('lesson-bug.yml', {
            title: detail.feedbackIssueTitle(challenge.title[locale]),
            body: `Challenge: ${challenge.slug}\nPath: /${locale}/challenges/${challenge.slug}\n\n`,
          }),
        )}">${escapeHtml(detail.feedbackBug)}</a>
      </div>
    </section>
  `;
};

const setCopyStatus = (el: HTMLElement | null, text: string, ok: boolean) => {
  if (!el) return;
  el.textContent = text;
  el.className = `min-w-0 text-xs ${ok ? 'text-ok' : 'text-err'}`;
  el.hidden = false;
};

export const mountChallenge = async (
  root: HTMLElement,
  locale: Locale,
  slug: string | undefined,
): Promise<void> => {
  const challenge = challengeBySlug(slug);
  const panelHost = root.querySelector<HTMLElement>('[data-role="challenge-panel"]');
  if (!challenge || !panelHost) return;

  const t = messagesFor(locale).challenges;
  const progressEl = root.querySelector<HTMLElement>('[data-role="goal-progress"]');
  const paintGoals = (text: string) => {
    if (!progressEl) return;
    const count = countGoalTargets(text);
    progressEl.textContent = count > 0 ? t.detail.goalsRemaining(count) : t.detail.goalsNone;
  };
  paintGoals('');

  // Monaco 主包异步加载期间先记下「启动 Lean」点击：低内存设备不会自动启动，
  // 用户看到按钮就点是很自然的动作，不能因为装配还没完成把这次点击吞掉。
  let startRequested = false;
  const earlyStartEl = panelHost.querySelector<HTMLButtonElement>('[data-role="start"]');
  const earlyStatusEl = panelHost.querySelector<HTMLElement>('[data-role="status"]');
  const onEarlyStart = () => {
    startRequested = true;
    if (earlyStartEl) earlyStartEl.disabled = true;
    if (earlyStatusEl) {
      earlyStatusEl.textContent = messagesFor(locale).playground.statusLoading;
      earlyStatusEl.dataset.state = 'loading';
    }
  };
  earlyStartEl?.addEventListener('click', onEarlyStart, { once: true });

  let createLeanPanel: typeof import('../components/lean-panel').createLeanPanel;
  try {
    ({ createLeanPanel } = await import('../components/lean-panel'));
  } catch {
    earlyStartEl?.removeEventListener('click', onEarlyStart);
    if (earlyStartEl) earlyStartEl.disabled = false;
    const panelMessages = {
      ...messagesFor(locale).playground,
      title: t.editorTitle,
      hint: t.detail.starterNote,
    };
    showEditorLoadFailure(panelHost, panelMessages, () => {
      panelHost.innerHTML = renderLeanMarkup(locale, 'full', panelMessages, undefined, {
        heading: false,
      });
      void mountChallenge(root, locale, slug);
    });
    return;
  }
  earlyStartEl?.removeEventListener('click', onEarlyStart);
  if (earlyStartEl) earlyStartEl.disabled = false;

  const store = new ChallengeProgressStore();
  const spec = challengeSpec(challenge, locale);
  const resultEl = root.querySelector<HTMLElement>('[data-role="challenge-result"]');
  const resultTitleEl = root.querySelector<HTMLElement>('[data-role="result-title"]');
  const resultBadgesEl = root.querySelector<HTMLElement>('[data-role="result-badges"]');
  const resultTiersEl = root.querySelector<HTMLElement>('[data-role="result-tiers"]');
  const resultCharsEl = root.querySelector<HTMLElement>('[data-role="result-chars"]');
  const copyCardStatus = root.querySelector<HTMLElement>('[data-role="result-copy-status"]');
  let shareText = '';
  let readCode = () => challenge.starter[locale];

  const paintResult = (diagnostics: Parameters<typeof isChallengeSolved>[2]) => {
    if (!resultEl) return;
    const code = readCode();
    if (!isChallengeSolved(spec, code, diagnostics)) {
      resultEl.hidden = true;
      shareText = '';
      return;
    }

    const style = analyzeProofStyle(code);
    const tiers = challenge.mode === 'bounty' ? solvedChallengeTiers(spec, code, diagnostics) : [];
    const record = store.recordRun(challenge.slug, {
      badges: style.badges,
      tiers,
      codeChars: style.codeChars,
    });
    const labels = style.badges.map((badge) => badgeLabel(t, badge));
    const badgeText = labels.length > 0 ? labels.join(' · ') : '—';

    if (resultTitleEl) resultTitleEl.textContent = t.detail.solvedTitle;
    if (resultBadgesEl) resultBadgesEl.textContent = t.detail.solvedBadges(badgeText);
    if (resultTiersEl) {
      const tierText = record.tiers.map((tier) => t.detail.tierLabels[tier]).join(' · ');
      resultTiersEl.hidden = tierText.length === 0;
      resultTiersEl.textContent = tierText.length > 0 ? t.detail.solvedTiers(tierText) : '';
    }
    const best = record.bestChars ?? style.codeChars;
    if (resultCharsEl) resultCharsEl.textContent = t.detail.bestChars(best);
    shareText = t.detail.shareText(challenge.title[locale], badgeText, best);
    resultEl.hidden = false;
  };

  const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  const panel = createLeanPanel(panelHost, {
    variant: 'full',
    code: challenge.starter[locale],
    locale,
    draftKey: challengeDraftKey(challenge.slug),
    // 与课程页一致：标准设备打开挑战即启动；低内存/省流模式仍需用户手动确认。
    autoStart: shouldAutoStart(currentMemoryTier(), saveData === true),
    startImmediately: startRequested,
    onGoal: paintGoals,
    onDiagnostics: paintResult,
  });
  readCode = panel.getCode;

  const copyCardButton = root.querySelector<HTMLButtonElement>('[data-role="copy-card"]');
  copyCardButton?.addEventListener('click', async () => {
    const url = `${location.origin}${challengePath(locale, challenge.slug)}`;
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(`${shareText}\n${url}`);
      setCopyStatus(copyCardStatus, t.detail.copyCardDone, true);
    } catch {
      setCopyStatus(copyCardStatus, t.detail.copyCardFailed, false);
    }
  });

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-tactic-index]')) {
    const tactic = challenge.tactics[Number(button.dataset.tacticIndex)];
    if (!tactic) continue;
    button.addEventListener('click', () => panel.insert(tactic.insert));
  }

  const copyButton = root.querySelector<HTMLButtonElement>('[data-role="copy-link"]');
  const copyStatus = root.querySelector<HTMLElement>('[data-role="copy-status"]');
  copyButton?.addEventListener('click', async () => {
    const url = `${location.origin}${challengePath(locale, challenge.slug)}`;
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setCopyStatus(copyStatus, t.detail.copyLinkDone, true);
    } catch {
      setCopyStatus(copyStatus, t.detail.copyLinkFailed, false);
    }
  });

  root
    .querySelector<HTMLButtonElement>('[data-role="load-solution"]')
    ?.addEventListener('click', () => {
      panel.setCode(challenge.solution[locale], { focus: true });
      // 供 E2E 区分「骨架诊断」与「参考解法诊断」。
      panelHost.dataset.mode = 'solution';
    });
};
