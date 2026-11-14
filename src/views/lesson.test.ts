import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createLeanPanel } = vi.hoisted(() => ({ createLeanPanel: vi.fn() }));

vi.mock('../components/lean-panel', () => ({ createLeanPanel }));

import type { LspDiagnostic } from '../components/lean-panel';
import { messagesFor } from '../i18n';
import { markLessonCompleted, markLessonVisited, readCompleted, readProgress } from '../progress';
import { bindLesson, dropSpuriousRedeclarations, renderLesson } from './lesson';

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

const lessonsOf = (locale: 'zh' | 'en') => messagesFor(locale).lesson.lessons;

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
    const lessons = lessonMsgs.lessons;

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

  it('不再渲染右侧编辑器栏', () => {
    const html = renderLesson('zh', 'first-proof');

    expect(html).not.toContain('data-role="lean-panel"');
    expect(html).toContain('data-role="runner"');
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
      t.completedCount(1, t.lessons.length),
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

  it('挂载隐藏的 runner，用紧凑变体且不预置代码', () => {
    bindLesson(document.body, 'zh', 'first-proof');

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

  it('代码块运行失败时显示重启按钮，点击后调用 panel.restart', async () => {
    const panel = makePanel();
    panel.run.mockRejectedValue(new Error('Lean pthread failed'));
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
    expect(panel.restart).toHaveBeenCalledTimes(1);
    expect(restart!.textContent).toContain(messagesFor('zh').lesson.restartDone);
  });

  it('缺少挂载点时安全退出', () => {
    document.body.innerHTML = '<div></div>';

    bindLesson(document.body, 'zh');

    expect(createLeanPanel).not.toHaveBeenCalled();
  });
});
