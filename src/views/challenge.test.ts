import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHALLENGES } from '../challenges';
import { analyzeProofStyle } from '../exercise';
import { messagesFor } from '../i18n';
import { escapeHtml } from './html';

const { createLeanPanel } = vi.hoisted(() => ({ createLeanPanel: vi.fn() }));

vi.mock('../components/lean-panel', () => ({ createLeanPanel }));

const { challengeDraftKey, mountChallenge, mountChallenges, renderChallenge, renderChallenges } =
  await import('./challenge');

const challenge = CHALLENGES.find((item) => item.slug === 'double-induction')!;

const makePanel = () => ({
  setCode: vi.fn(),
  getCode: vi.fn(() => ''),
  focus: vi.fn(),
  insert: vi.fn(),
});

describe('挑战列表渲染', () => {
  it('中英文都渲染全部题目、直达链接、playground 预填链接与零基础导览', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderChallenges(locale);
      const intro = messagesFor(locale).challenges.intro;
      expect(html).toContain(`data-role="challenge-list"`);
      expect(html).toContain(`data-role="challenge-intro"`);
      for (const mode of ['classic', 'verdict', 'bugfix', 'bounty'] as const) {
        expect(html, mode).toContain(`data-challenge-section="${mode}"`);
        expect(html, mode).toContain(escapeHtml(messagesFor(locale).challenges.modeLeads[mode]));
      }
      expect(html).toContain(escapeHtml(intro.title));
      expect(html).toContain(escapeHtml(intro.body));
      for (const step of intro.steps) expect(html).toContain(escapeHtml(step.title));
      for (const item of CHALLENGES) {
        expect(html, item.slug).toContain(`href="/${locale}/challenges/${item.slug}"`);
        expect(html, item.slug).toContain(`href="/${locale}/playground?challenge=${item.slug}"`);
        expect(html, item.slug).toContain(item.title[locale]);
      }
    }
  });
  it('列表页顶部显示通关与勋章统计，卡片显示模式标签与勋章占位', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderChallenges(locale);
      const t = messagesFor(locale).challenges;
      expect(html).toContain('data-role="challenge-summary"');
      expect(html).toContain(escapeHtml(t.summary.solved(0, CHALLENGES.length)));
      expect(html).toContain(escapeHtml(t.summary.badges(0, 0, 0)));
      for (const item of CHALLENGES) {
        expect(html, item.slug).toContain(`data-challenge-slug="${item.slug}"`);
        expect(html, item.slug).toContain(escapeHtml(t.modes[item.mode]));
        expect(html, item.slug).toContain('data-role="card-badges"');
      }
    }
  });

  it('挂载列表页时从 localStorage 读取通关数、卡片勋章、悬赏层数、最短字符，并支持导入导出实时刷新', async () => {
    localStorage.setItem(
      'lean-init-ide:challenge-progress:v1',
      JSON.stringify({
        version: 1,
        challenges: {
          'double-induction': {
            solved: true,
            badges: ['automation', 'term-mode'],
            tiers: [],
            bestChars: 42,
          },
          'collatz-bounty': {
            solved: true,
            badges: ['automation'],
            tiers: ['bronze', 'silver'],
            bestChars: 96,
          },
        },
      }),
    );
    document.body.innerHTML = renderChallenges('zh');
    mountChallenges(document.body, 'zh');

    const t = messagesFor('zh').challenges;
    expect(document.body.querySelector('[data-role="summary-solved"]')?.textContent).toBe(
      t.summary.solved(2, CHALLENGES.length),
    );
    expect(document.body.querySelector('[data-role="summary-badges"]')?.textContent).toBe(
      t.summary.badges(2, 0, 1),
    );
    const card = document.body.querySelector('[data-challenge-slug="double-induction"]');
    expect(card?.className).toContain('border-ok/40');
    expect(card?.querySelector('[data-role="card-badges"]')?.textContent).toBe(
      `${t.badgeLabels.automation} · ${t.badgeLabels.termMode}`,
    );
    expect(card?.querySelector<HTMLElement>('[data-role="card-best"]')?.hidden).toBe(false);
    expect(card?.querySelector('[data-role="card-best"]')?.textContent).toBe(t.cardBestChars(42));

    const bountyCard = document.body.querySelector('[data-challenge-slug="collatz-bounty"]');
    expect(bountyCard?.querySelector('[data-role="card-badges"]')?.textContent).toBe(
      `${t.badgeLabels.automation} · ${t.detail.tierLabels.bronze} · ${t.detail.tierLabels.silver}`,
    );

    const untouched = document.body.querySelector('[data-challenge-slug="add-comm"]');
    expect(untouched?.querySelector('[data-role="card-badges"]')?.textContent).toBe('');
    expect(untouched?.querySelector<HTMLElement>('[data-role="card-best"]')?.hidden).toBe(true);

    // 导入新的 JSON 备份后，列表统计与卡片实时刷新。
    const input = document.body.querySelector<HTMLInputElement>(
      '[data-role="progress-import-input"]',
    )!;
    Object.defineProperty(input, 'files', {
      value: [
        {
          text: async () =>
            JSON.stringify({
              version: 1,
              challenges: {
                'budget-withdraw': {
                  solved: true,
                  badges: ['handcrafted'],
                  tiers: [],
                  bestChars: 88,
                },
              },
            }),
        },
      ],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(document.body.querySelector('[data-role="summary-solved"]')?.textContent).toBe(
        t.summary.solved(1, CHALLENGES.length),
      ),
    );
    expect(
      document.body
        .querySelector('[data-challenge-slug="budget-withdraw"]')
        ?.querySelector('[data-role="card-badges"]')?.textContent,
    ).toBe(t.badgeLabels.handcrafted);
    expect(untouched?.querySelector('[data-role="card-badges"]')?.textContent).toBe('');
  });
});

describe('挑战详情渲染', () => {
  it('只渲染一个 H1，并把题面、提示、参考解法、导览与策略说明都放进静态 HTML', () => {
    const html = renderChallenge('zh', challenge.slug);
    const t = messagesFor('zh').challenges;

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(challenge.title.zh);
    expect(html).toContain(challenge.body.zh);
    expect(html).toContain(challenge.hint.zh);
    expect(html).toContain(escapeHtml(challenge.solution.zh));
    expect(html).toContain('data-ssr-markup="full"');
    expect(html).toContain('data-role="challenge-panel"');
    expect(html).toContain('data-role="goal-progress"');
    expect(html).toContain('data-role="challenge-intro"');
    expect(html).not.toContain('data-role="challenge-intro" open');
    expect(html).toContain('data-role="challenge-tactics"');
    expect(html).not.toContain('data-role="verdict-tactics-disclosure"');
    expect(html).toContain('data-role="load-solution"');
    expect(html).toContain('data-role="copy-link"');
    expect(html).toContain('data-role="challenge-nav"');
    expect(html).toContain('data-role="next-challenge-cta"');
    expect(html).toContain(`href="/zh/playground?challenge=${challenge.slug}"`);
    expect(html).toContain(t.detail.tacticsTitle);
    expect(html).toContain(t.detail.tacticsHint);
    for (const tactic of challenge.tactics) {
      expect(html).toContain(escapeHtml(tactic.label.zh));
      expect(html).toContain(escapeHtml(tactic.description.zh));
    }

    const enHtml = renderChallenge('en', challenge.slug);
    for (const tactic of challenge.tactics) {
      expect(enHtml).toContain(escapeHtml(tactic.label.en));
    }
    const doc = new DOMParser().parseFromString(enHtml, 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
    const comments: Comment[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      comments.push(node as Comment);
    }
    for (const comment of comments) comment.remove();
    expect(doc.body.innerHTML).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('真假审判庭详情页默认折叠出招卡以防剧透，且最后一关跳转回挑战大厅', () => {
    const verdictHtml = renderChallenge('zh', 'nat-sub-trap');
    expect(verdictHtml).toContain('<details data-role="verdict-tactics-disclosure"');
    expect(verdictHtml).not.toContain('data-role="verdict-tactics-disclosure" open');

    const last = CHALLENGES[CHALLENGES.length - 1]!;
    const lastHtml = renderChallenge('en', last.slug);
    const t = messagesFor('en').challenges;
    expect(lastHtml).toContain(`data-role="next-challenge-cta" href="/en/challenges"`);
    expect(lastHtml).toContain(escapeHtml(t.detail.allClearedCta));
  });

  it('未知 slug 回退到 404 视图而不是抛错', () => {
    const html = renderChallenge('en', 'unknown');
    expect(html).toContain(messagesFor('en').notFound.title);
    expect(html).not.toContain('data-role="challenge-panel"');
  });
});

describe('挑战页挂载', () => {
  beforeEach(() => {
    createLeanPanel.mockReset();
    createLeanPanel.mockReturnValue(makePanel());
    localStorage.clear();
  });

  it('用题目骨架、独立草稿 key 与 onGoal 回调创建编辑器', async () => {
    document.body.innerHTML = renderChallenge('zh', challenge.slug);

    await mountChallenge(document.body, 'zh', challenge.slug);

    expect(createLeanPanel).toHaveBeenCalledTimes(1);
    const [host, options] = createLeanPanel.mock.calls[0] as [
      HTMLElement,
      {
        code: string;
        draftKey: string;
        onGoal: (text: string) => void;
        autoStart: boolean;
      },
    ];
    expect(host.dataset.role).toBe('challenge-panel');
    expect(options.code).toBe(challenge.starter.zh);
    expect(options.draftKey).toBe(challengeDraftKey(challenge.slug));
    expect(options.draftKey).toBe('lean:draft:challenge-double-induction');
    expect(typeof options.autoStart).toBe('boolean');

    options.onGoal('n : Nat\n⊢ double n = 2 * n');
    expect(document.body.querySelector('[data-role="goal-progress"]')?.textContent).toBe(
      messagesFor('zh').challenges.detail.goalsRemaining(1),
    );
    options.onGoal('');
    expect(document.body.querySelector('[data-role="goal-progress"]')?.textContent).toBe(
      messagesFor('zh').challenges.detail.goalsNone,
    );
  });

  it('点击出招卡会通过 getCode + setCode 智能替换，而不是盲目 insert', async () => {
    document.body.innerHTML = renderChallenge('zh', challenge.slug);
    await mountChallenge(document.body, 'zh', challenge.slug);
    const panel = createLeanPanel.mock.results[0]!.value as ReturnType<typeof makePanel>;

    const buttons = document.body.querySelectorAll<HTMLButtonElement>('[data-tactic-index]');
    expect(buttons).toHaveLength(challenge.tactics.length);

    buttons[0]!.click();
    expect(panel.getCode).toHaveBeenCalled();
    expect(panel.setCode).toHaveBeenCalledWith(challenge.tactics[0]!.insert.zh, { focus: true });
    expect(panel.insert).not.toHaveBeenCalled();
  });

  it('真假审判庭渲染两个立场按钮，点击及草稿恢复时自动同步 aria-pressed 状态', async () => {
    const verdict = CHALLENGES.find((item) => item.slug === 'nat-sub-trap')!;
    const falsePanel = makePanel();
    falsePanel.getCode.mockReturnValue(verdict.verdictBranches!.falseStarter.zh);
    createLeanPanel.mockReturnValueOnce(falsePanel);

    document.body.innerHTML = renderChallenge('zh', verdict.slug);
    await mountChallenge(document.body, 'zh', verdict.slug);

    const buttons = document.body.querySelectorAll<HTMLButtonElement>(
      '[data-role="verdict-branch"]',
    );
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.dataset.branch).toBe('true');
    expect(buttons[1]!.dataset.branch).toBe('false');
    expect(buttons[0]!.textContent).toBe(messagesFor('zh').challenges.detail.verdictTrue);
    expect(buttons[1]!.textContent).toBe(messagesFor('zh').challenges.detail.verdictFalse);
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]!.className).toContain('border-warn');

    buttons[0]!.click();
    expect(falsePanel.setCode).toHaveBeenCalledWith(verdict.verdictBranches!.trueStarter.zh, {
      focus: true,
    });
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0]!.className).toContain('border-warn');
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('false');

    buttons[1]!.click();
    expect(falsePanel.setCode).toHaveBeenCalledWith(verdict.verdictBranches!.falseStarter.zh, {
      focus: true,
    });
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('false');
  });

  it('载入参考解法并标记面板模式', async () => {
    document.body.innerHTML = renderChallenge('en', challenge.slug);
    await mountChallenge(document.body, 'en', challenge.slug);
    const panel = createLeanPanel.mock.results[0]!.value as ReturnType<typeof makePanel>;

    document.body.querySelector<HTMLButtonElement>('[data-role="load-solution"]')!.click();

    expect(panel.setCode).toHaveBeenCalledWith(challenge.solution.en, { focus: true });
    expect(
      document.body.querySelector<HTMLElement>('[data-role="challenge-panel"]')?.dataset.mode,
    ).toBe('solution');
  });

  it('底部反馈入口带上当前挑战并指向课程问题模板', () => {
    const html = renderChallenge('zh', challenge.slug);
    expect(html).toContain('issues/new?template=lesson-bug.yml');
    expect(html).toContain(encodeURIComponent(`Challenge: ${challenge.slug}`));
    expect(html).toContain(messagesFor('zh').challenges.detail.feedbackBug);
  });

  it('复制分享链接成功与失败都有可见反馈', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    document.body.innerHTML = renderChallenge('zh', challenge.slug);
    await mountChallenge(document.body, 'zh', challenge.slug);

    const status = document.body.querySelector<HTMLElement>('[data-role="copy-status"]')!;
    document.body.querySelector<HTMLButtonElement>('[data-role="copy-link"]')!.click();

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/zh/challenges/${challenge.slug}`);
    await vi.waitFor(() =>
      expect(status.textContent).toBe(messagesFor('zh').challenges.detail.copyLinkDone),
    );
    expect(status.hidden).toBe(false);

    writeText.mockRejectedValueOnce(new Error('denied'));
    document.body.querySelector<HTMLButtonElement>('[data-role="copy-link"]')!.click();
    await vi.waitFor(() =>
      expect(status.textContent).toBe(messagesFor('zh').challenges.detail.copyLinkFailed),
    );
  });

  it('零 Error 且判题通过时显示通关横幅、流派勋章、最短字符数与可复制战绩卡片', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    document.body.innerHTML = renderChallenge('zh', challenge.slug);
    await mountChallenge(document.body, 'zh', challenge.slug);

    const panel = createLeanPanel.mock.results[0]!.value as ReturnType<typeof makePanel>;
    panel.getCode.mockReturnValue(challenge.solution.zh);
    const [, options] = createLeanPanel.mock.calls[0] as [
      HTMLElement,
      { onDiagnostics: (diagnostics: Array<{ severity?: number }>) => void },
    ];

    options.onDiagnostics([]);

    const t = messagesFor('zh').challenges;
    const result = document.body.querySelector<HTMLElement>('[data-role="challenge-result"]')!;
    const chars = analyzeProofStyle(challenge.solution.zh).codeChars;
    expect(result.hidden).toBe(false);
    expect(result.querySelector('[data-role="result-title"]')?.textContent).toBe(
      t.detail.solvedTitle,
    );
    expect(result.querySelector('[data-role="result-badges"]')?.textContent).toBe(
      t.detail.solvedBadges(t.badgeLabels.automation),
    );
    expect(result.querySelector('[data-role="result-chars"]')?.textContent).toBe(
      t.detail.bestChars(chars),
    );

    const share = t.detail.shareText(challenge.title.zh, t.badgeLabels.automation, chars);
    document.body.querySelector<HTMLButtonElement>('[data-role="copy-card"]')!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(`${share}\n${location.origin}/zh/challenges/${challenge.slug}`),
    );

    const next = CHALLENGES[CHALLENGES.findIndex((item) => item.slug === challenge.slug) + 1]!;
    expect(
      result
        .querySelector<HTMLAnchorElement>('[data-role="next-challenge-cta"]')
        ?.getAttribute('href'),
    ).toBe(`/zh/challenges/${next.slug}`);
    const existingRecord = document.body.querySelector<HTMLElement>(
      '[data-role="challenge-record"]',
    )!;
    expect(existingRecord.hidden).toBe(false);
    expect(existingRecord.textContent).toContain(t.badgeLabels.automation);
    expect(existingRecord.textContent).toContain(t.cardBestChars(chars));

    options.onDiagnostics([{ severity: 1 }]);
    expect(result.hidden).toBe(true);
  });

  it('悬赏关卡在横幅里显示已点亮的铜牌与银牌层数', async () => {
    const bounty = CHALLENGES.find((item) => item.slug === 'collatz-bounty')!;
    document.body.innerHTML = renderChallenge('en', bounty.slug);
    await mountChallenge(document.body, 'en', bounty.slug);

    const panel = createLeanPanel.mock.results[0]!.value as ReturnType<typeof makePanel>;
    panel.getCode.mockReturnValue(bounty.solution.en);
    const [, options] = createLeanPanel.mock.calls[0] as [
      HTMLElement,
      { onDiagnostics: (diagnostics: Array<{ severity?: number }>) => void },
    ];
    options.onDiagnostics([]);

    const t = messagesFor('en').challenges;
    const tiers = document.body.querySelector<HTMLElement>('[data-role="result-tiers"]')!;
    expect(tiers.hidden).toBe(false);
    expect(tiers.textContent).toBe(
      t.detail.solvedTiers(`${t.detail.tierLabels.bronze} · ${t.detail.tierLabels.silver}`),
    );
  });

  it('未知 slug 或缺少面板容器时安全退出', async () => {
    document.body.innerHTML = renderChallenge('zh', 'unknown');
    await mountChallenge(document.body, 'zh', 'unknown');
    expect(createLeanPanel).not.toHaveBeenCalled();

    document.body.innerHTML = '<div></div>';
    await mountChallenge(document.body, 'zh', challenge.slug);
    expect(createLeanPanel).not.toHaveBeenCalled();
  });

  it('缺少 navigator.clipboard 时复制链接展示失败提示', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    document.body.innerHTML = renderChallenge('en', challenge.slug);
    await mountChallenge(document.body, 'en', challenge.slug);

    const status = document.body.querySelector<HTMLElement>('[data-role="copy-status"]')!;
    document.body.querySelector<HTMLButtonElement>('[data-role="copy-link"]')!.click();
    await vi.waitFor(() =>
      expect(status.textContent).toBe(messagesFor('en').challenges.detail.copyLinkFailed),
    );
  });

  it('主包加载前点击启动 Lean 会传递 startImmediately，并在加载失败时支持重试', async () => {
    document.body.innerHTML = renderChallenge('zh', challenge.slug);
    const pending = mountChallenge(document.body, 'zh', challenge.slug);
    document.body.querySelector<HTMLButtonElement>('[data-role="start"]')!.click();
    expect(document.body.querySelector<HTMLElement>('[data-role="status"]')?.dataset.state).toBe(
      'loading',
    );
    await pending;

    const [, options] = createLeanPanel.mock.calls[0] as [
      HTMLElement,
      { startImmediately?: boolean },
    ];
    expect(options.startImmediately).toBe(true);

    vi.resetModules();
    let shouldFail = true;
    vi.doMock('../components/lean-panel', () => {
      if (shouldFail) throw new Error('chunk error');
      return { createLeanPanel };
    });
    const { loadLocale } = await import('../i18n');
    await loadLocale('zh');
    const { mountChallenge: mountFresh, renderChallenge: renderFresh } =
      await import('./challenge');
    document.body.innerHTML = renderFresh('zh', challenge.slug);
    await mountFresh(document.body, 'zh', challenge.slug);

    const retry = document.body.querySelector<HTMLButtonElement>('[data-role="retry-editor"]')!;
    expect(retry).not.toBeNull();
    shouldFail = false;
    retry.click();
    await vi.waitFor(() => expect(createLeanPanel).toHaveBeenCalledTimes(2));

    vi.doUnmock('../components/lean-panel');
    vi.resetModules();
  });
});
