import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createLeanPanel } = vi.hoisted(() => ({ createLeanPanel: vi.fn() }));

vi.mock('../components/lean-panel', () => ({ createLeanPanel }));

import type { LspDiagnostic } from '../components/lean-panel';
import { lessonsFor, messagesFor } from '../i18n';
import { markLessonCompleted, markLessonVisited, readCompleted, readProgress } from '../progress';
import {
  bindLesson,
  dropSpuriousRedeclarations,
  extractLessonGoalSteps,
  extractLiveLessonGoal,
  renderLesson,
} from './lesson';
import { escapeHtml } from './html';

beforeEach(() => {
  localStorage.clear();
});

const makePanel = () => ({
  setCode: vi.fn(),
  getCode: vi.fn(() => ''),
  focus: vi.fn(),
  run: vi.fn(async (): Promise<LspDiagnostic[]> => []),
  getProgress: vi.fn(() => ({ label: '加载运行时…', kind: 'loading' as const, ratio: null })),
  restart: vi.fn(async () => true),
});

const lessonsOf = (locale: 'zh' | 'en') => lessonsFor(locale);

const diagnostic = (message: string): LspDiagnostic => ({
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  severity: 1,
  message,
});

describe('dropSpuriousRedeclarations', () => {
  it('过滤只声明一次却被报重复的假阳性', () => {
    const code =
      'theorem and_self (P Q : Prop) : P → Q → P ∧ Q := by\n  intro hp hq\n  exact ⟨hp, hq⟩';
    const kept = dropSpuriousRedeclarations(
      [diagnostic('`and_self` has already been declared')],
      code,
    );
    expect(kept).toHaveLength(0);
  });

  it('保留代码里真的声明了两次的重复', () => {
    const code = 'def answer := 1\ndef answer := 2';
    const kept = dropSpuriousRedeclarations(
      [diagnostic('`answer` has already been declared')],
      code,
    );
    expect(kept).toHaveLength(1);
  });

  it('不影响其它诊断', () => {
    const list = [diagnostic('类型不匹配'), diagnostic('`x` has already been declared')];
    expect(dropSpuriousRedeclarations(list, 'def x := 1')).toHaveLength(1);
  });
});

describe('课程页渲染', () => {
  it('目录列出全部课时，并标出当前一节', () => {
    const lessons = lessonsOf('zh');
    const html = renderLesson('zh', lessons[1]!.slug);

    for (const lesson of lessons) {
      expect(html).toContain(`href="/zh/learn/${lesson.slug}"`);
    }
    expect(html).toContain('aria-current="page"');
  });

  it('只渲染当前课时的代码块，每块都带输出容器', () => {
    for (const lesson of lessonsOf('zh')) {
      const expected = lesson.blocks.filter((block) => block.kind === 'code').length;
      const html = renderLesson('zh', lesson.slug);

      expect((html.match(/data-role="code-block"/g) ?? []).length, lesson.slug).toBe(expected);
      expect((html.match(/data-output="/g) ?? []).length, lesson.slug).toBe(expected);
    }
  });

  it('渲染 Goal 旁白和练习折叠提示', () => {
    const html = renderLesson('zh', 'induction');
    const t = messagesFor('zh').lesson;

    expect(html).toContain(t.goalLabel);
    expect(html).toContain('⊢ a + b = b + a');
    expect(html).toContain('为什么 0 + a = a 不能 rfl？');
    expect(html).toContain(t.hintLabel);
  });

  it('正文里的反引号渲染成行内代码，而不是漏出纯文本', () => {
    const lesson = lessonsOf('zh').find((item) => item.slug === 'what-is-lean')!;
    const paragraph = lesson.blocks.find(
      (block): block is { kind: 'p'; text: string } =>
        block.kind === 'p' && /`[^`\n]+`/.test(block.text),
    );
    expect(paragraph).toBeDefined();
    const token = /`([^`\n]+)`/.exec(paragraph!.text)![1]!;
    const html = renderLesson('zh', lesson.slug);

    expect(html).toContain(
      'class="rounded bg-panel-soft px-1 py-0.5 font-mono text-[0.92em] leading-normal text-fg"',
    );
    expect(html).toContain(`>${escapeHtml(token)}</code>`);
    expect(html).not.toContain(`\`${token}\``);
  });

  it('练习说明里的反引号同样按行内代码渲染', () => {
    const lesson = lessonsOf('zh').find((item) => item.exercise?.body.includes('`'));
    expect(lesson).toBeDefined();

    const html = renderLesson('zh', lesson!.slug);
    expect(html).not.toContain('`sorry`');
    expect(html).toContain('>sorry</code>');
  });

  it('窄屏目录把全部课时收进可展开的 details', () => {
    const lessons = lessonsOf('zh');
    const html = renderLesson('zh', lessons[1]!.slug);

    expect(html).toContain('<details');
    expect(html).toContain('group-open:rotate-180');
    for (const lesson of lessons) {
      expect(html).toContain(`href="/zh/learn/${lesson.slug}"`);
    }
  });

  it('无效 slug 回退到第一节而不是空白页', () => {
    const first = lessonsOf('zh')[0]!;
    const html = renderLesson('zh', 'no-such-lesson');

    expect(html).toContain(first.title);
    expect(html).toContain(first.lead);
  });

  it('目录按路径分组并包含数学课', () => {
    const html = renderLesson('zh', 'math-divisibility');
    expect(html).toContain(messagesFor('zh').lesson.tracks.math.title);
    expect(html).toContain('href="/zh/learn/math-sets"');
    expect(html).toContain('href="/zh/learn/math-mathlib"');
  });

  it('首节没有上一篇，末节没有下一篇', () => {
    const lessonMsgs = messagesFor('zh').lesson;
    const lessons = lessonsOf('zh');

    const first = renderLesson('zh', lessons[0]!.slug);
    expect(first).toContain(lessonMsgs.next);
    expect(first).not.toContain(lessonMsgs.prev);

    const last = renderLesson('zh', lessons.at(-1)!.slug);
    expect(last).toContain(lessonMsgs.prev);
    expect(last).not.toContain(lessonMsgs.next);
  });

  it('练习区改成跳转到 playground 的链接，带上课时 slug', () => {
    const lesson = lessonsOf('zh').find((item) => item.exercise);
    expect(lesson).toBeDefined();

    const html = renderLesson('zh', lesson!.slug);
    expect(html).toContain(`href="/zh/playground?lesson=${lesson!.slug}"`);
  });

  it('底部反馈入口带上当前课时并指向对应 Issue 模板', () => {
    const html = renderLesson('zh', 'connectives');
    const body = encodeURIComponent('Lesson: connectives\nPath: /zh/learn/connectives\n\n');

    expect(html).toContain('issues/new?template=clarity-gap.yml');
    expect(html).toContain('issues/new?template=lesson-bug.yml');
    expect(html).toContain(body);
    expect(html).toContain(messagesFor('zh').lesson.feedbackClarity);
    expect(html).toContain(messagesFor('zh').lesson.feedbackBug);
  });

  it('不再渲染右侧编辑器栏，但每节课都渲染轻量 Goal 面板', () => {
    for (const locale of ['zh', 'en'] as const) {
      for (const lesson of lessonsOf(locale)) {
        const html = renderLesson(locale, lesson.slug);
        expect(html, `${locale}:${lesson.slug}`).not.toContain('data-role="lean-panel"');
        expect(html, `${locale}:${lesson.slug}`).toContain('data-role="runner"');
        expect(html, `${locale}:${lesson.slug}`).toContain('data-role="lesson-goal-panel"');
        expect(html, `${locale}:${lesson.slug}`).toContain('data-role="lesson-goal-text"');
      }
    }
  });

  it('extractLessonGoalSteps 合并缩进续行、冒号引导行与目标行', () => {
    const steps = extractLessonGoalSteps({
      slug: 'demo',
      navTitle: 'Demo',
      title: 'Demo',
      lead: 'Lead',
      blocks: [
        {
          kind: 'goal',
          text: '0 + a = a：\nzero 分支：⊢ 0 + 0 = 0\nsucc 分支：ih : 0 + a = a\n目标：⊢ 0 + succ a = succ a\n        = succ (0 + a)',
        },
      ],
    });
    expect(steps).toEqual([
      '0 + a = a：\nzero 分支：⊢ 0 + 0 = 0',
      'succ 分支：ih : 0 + a = a\n目标：⊢ 0 + succ a = succ a\n= succ (0 + a)',
    ]);
  });

  it('extractLiveLessonGoal 仅在存在未解决目标或证明通过时返回实时 Goal', () => {
    expect(
      extractLiveLessonGoal(
        [diagnostic('unsolved goals\nh : P\n⊢ Q')],
        'theorem t : Q := by sorry',
        'done',
      ),
    ).toBe('unsolved goals\nh : P\n⊢ Q');
    expect(extractLiveLessonGoal([], 'theorem t : True := trivial', 'done')).toBe('done');
    expect(extractLiveLessonGoal([], '#eval 1 + 1', 'done')).toBeNull();
    expect(
      extractLiveLessonGoal([diagnostic('type mismatch')], 'theorem t : True := 1', 'done'),
    ).toBeNull();
  });
});

describe('课程页交互绑定', () => {
  beforeEach(() => {
    createLeanPanel.mockReset();
    createLeanPanel.mockReturnValue(makePanel());
    document.body.innerHTML = renderLesson('zh', 'first-proof');
  });

  it('进入课程记为已读，但未完成时目录不显示标记', () => {
    markLessonVisited('first-proof');
    document.body.innerHTML = renderLesson('zh', 'implication');
    bindLesson(document.body, 'zh', 'implication');

    const seen = document.body.querySelector<HTMLAnchorElement>('[data-lesson-slug="first-proof"]');
    expect(seen?.textContent).not.toContain('○');
    expect(seen?.querySelector('span')).toBeNull();
    expect(readProgress().has('implication')).toBe(true);
  });

  it('练习完成的课时在目录里显示实心勾，并更新顶部计数', () => {
    markLessonCompleted('first-proof');
    document.body.innerHTML = renderLesson('zh', 'implication');
    bindLesson(document.body, 'zh', 'implication');

    const t = messagesFor('zh').lesson;
    const done = document.body.querySelector<HTMLAnchorElement>('[data-lesson-slug="first-proof"]');
    expect(done?.textContent).toContain('✓');
    expect(done?.querySelector('span')?.title).toBe(t.completedLabel);
    expect(readCompleted().has('first-proof')).toBe(true);
    expect(document.body.querySelector('[data-role="toc-progress"]')?.textContent).toBe(
      t.completedCount(1, lessonsOf('zh').length),
    );
  });

  it('练习区显示完成条件，完成后换成徽章', () => {
    document.body.innerHTML = renderLesson('zh', 'first-proof');
    bindLesson(document.body, 'zh', 'first-proof');

    const t = messagesFor('zh').lesson;
    const status = document.body.querySelector<HTMLElement>('[data-role="exercise-status"]');
    expect(status?.textContent).toBe(t.exerciseCompletionHint);

    markLessonCompleted('first-proof');
    document.body.innerHTML = renderLesson('zh', 'first-proof');
    bindLesson(document.body, 'zh', 'first-proof');

    const done = document.body.querySelector<HTMLElement>('[data-role="exercise-status"]');
    expect(done?.textContent).toContain('✓');
    expect(done?.textContent).toContain(t.completedLabel);
  });

  it('挂载隐藏的 runner，用紧凑变体且不预置代码', async () => {
    bindLesson(document.body, 'zh', 'first-proof');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(createLeanPanel).toHaveBeenCalledTimes(1);
    const [, options] = createLeanPanel.mock.calls[0] as [
      HTMLElement,
      { variant: string; code: string; locale: string },
    ];
    expect(options.variant).toBe('compact');
    expect(options.locale).toBe('zh');
    // 预置代码会被语言服务器先声明一次，用户点同一块时就变成重复声明。
    expect(options.code).toBe('');
  });

  it('低内存或省流模式下不主动挂载 Monaco，直到用户点击运行才按需加载一次', async () => {
    Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true });
    const panel = makePanel();
    panel.run.mockResolvedValue([]);
    createLeanPanel.mockReturnValue(panel);
    document.body.innerHTML = renderLesson('zh', 'first-proof');

    bindLesson(document.body, 'zh', 'first-proof');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createLeanPanel).not.toHaveBeenCalled();

    const first = document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]')!;
    first.click();
    const output = document.body.querySelector<HTMLElement>('[data-output="0"]')!;
    expect(output.hidden).toBe(false);
    expect(output.textContent).toContain('加载运行时…');
    expect(first.disabled).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createLeanPanel).toHaveBeenCalledTimes(1);
    expect(panel.run).toHaveBeenCalledTimes(1);
    expect(first.disabled).toBe(false);

    document.body.querySelector<HTMLButtonElement>('button[data-run-index="1"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createLeanPanel).toHaveBeenCalledTimes(1);
    expect(panel.run).toHaveBeenCalledTimes(2);

    delete (navigator as { deviceMemory?: number }).deviceMemory;
  });

  it('点运行把对应代码交给引擎，并把诊断渲染到输出区', async () => {
    const panel = makePanel();
    panel.run.mockResolvedValue([
      {
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 6 } },
        severity: 1,
        message: '类型不匹配',
      },
    ]);
    createLeanPanel.mockReturnValue(panel);
    document.body.innerHTML = renderLesson('zh', 'first-proof');
    bindLesson(document.body, 'zh', 'first-proof');

    const button = document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]');
    expect(button).not.toBeNull();
    button!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(panel.run).toHaveBeenCalledTimes(1);
    const output = document.body.querySelector<HTMLElement>('[data-output="0"]');
    expect(output?.hidden).toBe(false);
    expect(output?.innerHTML).toContain('类型不匹配');
  });

  it('引擎没跑出内容时显示提示而不是空白', async () => {
    const panel = makePanel();
    panel.run.mockResolvedValue([]);
    createLeanPanel.mockReturnValue(panel);
    document.body.innerHTML = renderLesson('zh', 'first-proof');
    bindLesson(document.body, 'zh', 'first-proof');

    document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const output = document.body.querySelector<HTMLElement>('[data-output="0"]');
    expect(output?.textContent).toContain(messagesFor('zh').lesson.noOutput);
  });

  it('证明类代码通过时给出「证明通过」而不是空输出', async () => {
    const panel = makePanel();
    panel.run.mockResolvedValue([]);
    createLeanPanel.mockReturnValue(panel);
    document.body.innerHTML = renderLesson('zh', 'implication');
    bindLesson(document.body, 'zh', 'implication');

    document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const output = document.body.querySelector<HTMLElement>('[data-output="0"]');
    expect(output?.textContent).toContain(messagesFor('zh').lesson.proofAccepted);
    expect(output?.textContent).not.toContain(messagesFor('zh').lesson.noOutput);
  });

  it('运行期间在输出区显示加载进度和已用时间，完成后替换为结果', async () => {
    const panel = makePanel();
    let finish!: (list: LspDiagnostic[]) => void;
    panel.run.mockReturnValue(
      new Promise<LspDiagnostic[]>((resolve) => {
        finish = resolve;
      }),
    );
    createLeanPanel.mockReturnValue(panel);
    document.body.innerHTML = renderLesson('zh', 'first-proof');
    bindLesson(document.body, 'zh', 'first-proof');

    const button = document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]')!;
    button.click();

    const output = document.body.querySelector<HTMLElement>('[data-output="0"]')!;
    expect(output.querySelector('[data-role="run-progress"]')).not.toBeNull();
    expect(output.textContent).toContain('加载运行时…');
    expect(output.textContent).toContain('0.0s');
    expect(button.disabled).toBe(true);
    expect(
      document.body.querySelector<HTMLButtonElement>('button[data-run-index="1"]')!.disabled,
    ).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    const options = createLeanPanel.mock.calls[0]?.[1] as {
      onProgress?: (progress: { label: string; kind: string; ratio: number | null }) => void;
    };
    options.onProgress?.({ label: '12.3 / 136.4 MB', kind: 'loading', ratio: 0.5 });
    expect(output.textContent).toContain('12.3 / 136.4 MB');
    expect(output.querySelector<HTMLElement>('[data-role="run-bar"]')!.style.width).toBe('50%');

    finish([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(output.querySelector('[data-role="run-progress"]')).toBeNull();
    expect(output.textContent).toContain(messagesFor('zh').lesson.noOutput);
    expect(button.disabled).toBe(false);
  });

  it('代码块运行失败时显示重启按钮，重启成功后就地自动重跑当前代码块', async () => {
    const panel = makePanel();
    panel.run.mockRejectedValueOnce(new Error('Lean pthread failed')).mockResolvedValueOnce([]);
    panel.restart.mockResolvedValueOnce(true);
    createLeanPanel.mockReturnValue(panel);
    document.body.innerHTML = renderLesson('zh', 'first-proof');
    bindLesson(document.body, 'zh', 'first-proof');

    document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const output = document.body.querySelector<HTMLElement>('[data-output="0"]');
    expect(output?.textContent).toContain(messagesFor('zh').lesson.runCrashed);
    const restart = output?.querySelector<HTMLButtonElement>('[data-role="restart-lean"]');
    expect(restart).not.toBeNull();

    restart!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(panel.restart).toHaveBeenCalledTimes(1);
    expect(panel.run).toHaveBeenCalledTimes(2);
    expect(output?.textContent).toContain(messagesFor('zh').lesson.noOutput);
  });

  it('课程页重启失败时恢复按钮可再次尝试', async () => {
    const panel = makePanel();
    panel.run.mockRejectedValue(new Error('Lean worker crashed'));
    panel.restart.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('boom'));
    createLeanPanel.mockReturnValue(panel);
    document.body.innerHTML = renderLesson('zh', 'first-proof');
    bindLesson(document.body, 'zh', 'first-proof');

    document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const output = document.body.querySelector<HTMLElement>('[data-output="0"]');
    const restart = document.body.querySelector<HTMLButtonElement>(
      '[data-output="0"] [data-role="restart-lean"]',
    )!;
    restart.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(restart.disabled).toBe(false);
    expect(output?.textContent).toContain(messagesFor('zh').lesson.restartFailed);

    restart.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(restart.disabled).toBe(false);
    expect(output?.textContent).toContain(messagesFor('zh').lesson.restartFailed);
  });

  it('编辑器分片尚未挂载就失败时同样渲染错误卡片并支持就地重试', async () => {
    const panel = makePanel();
    panel.run.mockResolvedValueOnce([]);
    createLeanPanel
      .mockImplementationOnce(() => {
        throw new Error('Failed to fetch dynamically imported module');
      })
      .mockReturnValueOnce(panel);
    document.body.innerHTML = renderLesson('zh', 'first-proof');
    bindLesson(document.body, 'zh', 'first-proof');

    document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const output = document.body.querySelector<HTMLElement>('[data-output="0"]');
    expect(output?.textContent).toContain(messagesFor('zh').lesson.runCrashed);
    expect(output?.textContent).toContain('Failed to fetch dynamically imported module');
    const retry = document.body.querySelector<HTMLButtonElement>(
      '[data-output="0"] [data-role="restart-lean"]',
    )!;
    retry.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(panel.run).toHaveBeenCalledTimes(1);
    expect(output?.textContent).toContain(messagesFor('zh').lesson.noOutput);
  });

  it('缺少挂载点时安全退出', () => {
    document.body.innerHTML = '<div></div>';

    bindLesson(document.body, 'zh');

    expect(createLeanPanel).not.toHaveBeenCalled();
  });

  it('右侧 Goal 面板支持逐步演练、运行后显示实时 Goal 并可回到步骤演示', async () => {
    const panel = makePanel();
    panel.run
      .mockResolvedValueOnce([diagnostic('unsolved goals\nh : P\n⊢ P')])
      .mockResolvedValueOnce([]);
    createLeanPanel.mockReturnValue(panel);
    document.body.innerHTML = renderLesson('zh', 'implication');
    bindLesson(document.body, 'zh', 'implication');

    const t = messagesFor('zh').lesson;
    const textEl = document.body.querySelector<HTMLElement>('[data-role="lesson-goal-text"]')!;
    const badgeEl = document.body.querySelector<HTMLElement>('[data-role="lesson-goal-badge"]')!;
    const prevBtn = document.body.querySelector<HTMLButtonElement>(
      '[data-role="lesson-goal-prev"]',
    )!;
    const nextBtn = document.body.querySelector<HTMLButtonElement>(
      '[data-role="lesson-goal-next"]',
    )!;
    const resetBtn = document.body.querySelector<HTMLButtonElement>(
      '[data-role="lesson-goal-reset"]',
    )!;

    const firstStep = textEl.textContent;
    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(false);

    nextBtn.click();
    expect(textEl.textContent).not.toBe(firstStep);
    expect(prevBtn.disabled).toBe(false);

    prevBtn.click();
    expect(textEl.textContent).toBe(firstStep);

    // 第一次运行：包含未解决目标时 Goal 面板切到实时结果并显示「回到步骤演示」。
    document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(badgeEl.textContent).toBe(t.goalLive);
    expect(textEl.textContent).toContain('⊢ P');
    expect(resetBtn.hidden).toBe(false);

    resetBtn.click();
    expect(textEl.textContent).toBe(firstStep);
    expect(resetBtn.hidden).toBe(true);

    // 第二次运行：证明通过后显示无剩余目标。
    document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(badgeEl.textContent).toBe(t.goalLive);
    expect(textEl.textContent).toBe(t.goalNoRemaining);
  });

  it('Goal 步骤切换会高亮左侧代码行，点击代码行也会同步跳回对应步骤', () => {
    const panel = makePanel();
    createLeanPanel.mockReturnValue(panel);
    document.body.innerHTML = renderLesson('zh', 'implication');
    bindLesson(document.body, 'zh', 'implication');

    const goalPanel = document.body.querySelector<HTMLElement>('[data-role="lesson-goal-panel"]')!;
    const locEl = document.body.querySelector<HTMLElement>('[data-role="lesson-goal-step-label"]')!;
    const nextBtn = document.body.querySelector<HTMLButtonElement>(
      '[data-role="lesson-goal-next"]',
    )!;

    const initialActive = document.body.querySelector<HTMLElement>(
      '[data-role="code-block"] [data-active-line="true"]',
    );
    expect(initialActive).not.toBeNull();
    expect(locEl.hidden).toBe(false);

    nextBtn.click();
    expect(goalPanel.dataset.goalStep).toBe('1');
    const secondActive = document.body.querySelector<HTMLElement>(
      '[data-role="code-block"] [data-active-line="true"]',
    );
    expect(secondActive).not.toBe(initialActive);

    const linkedLines = Array.from(
      document.body.querySelectorAll<HTMLElement>('[data-role="code-block"] [data-step-index]'),
    );
    expect(linkedLines.length).toBeGreaterThan(1);
    const firstLinked = linkedLines[0]!;
    firstLinked.click();
    expect(goalPanel.dataset.goalStep).toBe(firstLinked.dataset.stepIndex);
    expect(firstLinked.dataset.activeLine).toBe('true');
  });

  it('运行代码块期间显示 Checking 状态，完成后分别展示编译报错或运行输出', async () => {
    let finish!: (list: LspDiagnostic[]) => void;
    const panel = makePanel();
    panel.run
      .mockImplementationOnce(
        () =>
          new Promise<LspDiagnostic[]>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce([diagnostic('type mismatch')])
      .mockResolvedValueOnce([
        {
          severity: 3,
          message: '2',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      ]);
    createLeanPanel.mockReturnValue(panel);
    document.body.innerHTML = renderLesson('zh', 'first-proof');
    bindLesson(document.body, 'zh', 'first-proof');

    const t = messagesFor('zh').lesson;
    const badgeEl = document.body.querySelector<HTMLElement>('[data-role="lesson-goal-badge"]')!;
    const textEl = document.body.querySelector<HTMLElement>('[data-role="lesson-goal-text"]')!;
    const runBtn = document.body.querySelector<HTMLButtonElement>('button[data-run-index="0"]')!;

    runBtn.click();
    expect(badgeEl.textContent).toBe(t.goalLive);
    expect(textEl.textContent).toBe(t.goalChecking);
    await new Promise((resolve) => setTimeout(resolve, 0));

    finish([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(badgeEl.textContent).toBe(t.goalOutput);

    runBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(badgeEl.textContent).toBe(t.goalError);
    expect(textEl.textContent).toContain('type mismatch');

    runBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(badgeEl.textContent).toBe(t.goalOutput);
    expect(textEl.textContent).toContain('2');
  });
});
