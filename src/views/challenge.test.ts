import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHALLENGES } from '../challenges';
import { messagesFor } from '../i18n';
import { escapeHtml } from './html';

const { createLeanPanel } = vi.hoisted(() => ({ createLeanPanel: vi.fn() }));

vi.mock('../components/lean-panel', () => ({ createLeanPanel }));

const { challengeDraftKey, mountChallenge, renderChallenge, renderChallenges } =
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
    expect(html).toContain('data-role="challenge-tactics"');
    expect(html).toContain('data-role="load-solution"');
    expect(html).toContain('data-role="copy-link"');
    expect(html).toContain(`href="/zh/playground?challenge=${challenge.slug}"`);
    expect(html).toContain(t.detail.tacticsTitle);
    expect(html).toContain(t.detail.tacticsHint);
    for (const tactic of challenge.tactics) {
      expect(html).toContain(tactic.label);
      expect(html).toContain(escapeHtml(tactic.description.zh));
    }
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

  it('点击快捷策略把片段插入编辑器', async () => {
    document.body.innerHTML = renderChallenge('zh', challenge.slug);
    await mountChallenge(document.body, 'zh', challenge.slug);
    const panel = createLeanPanel.mock.results[0]!.value as ReturnType<typeof makePanel>;

    const buttons = document.body.querySelectorAll<HTMLButtonElement>('[data-tactic-index]');
    expect(buttons).toHaveLength(challenge.tactics.length);

    buttons[0]!.click();
    expect(panel.insert).toHaveBeenCalledWith(challenge.tactics[0]!.insert);
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

  it('未知 slug 或缺少面板容器时安全退出', async () => {
    document.body.innerHTML = renderChallenge('zh', 'unknown');
    await mountChallenge(document.body, 'zh', 'unknown');
    expect(createLeanPanel).not.toHaveBeenCalled();

    document.body.innerHTML = '<div></div>';
    await mountChallenge(document.body, 'zh', challenge.slug);
    expect(createLeanPanel).not.toHaveBeenCalled();
  });
});
