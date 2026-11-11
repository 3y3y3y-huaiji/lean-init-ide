import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createLeanPanel } = vi.hoisted(() => ({ createLeanPanel: vi.fn() }));

vi.mock('../components/lean-panel', () => ({ createLeanPanel }));

import { messagesFor } from '../i18n';
import { bindLesson, renderLesson } from './lesson';

const makePanel = () => ({ setCode: vi.fn(), getCode: vi.fn(() => '') });

const lessonsOf = (locale: 'zh' | 'en') => messagesFor(locale).lesson.lessons;

describe('课程页渲染', () => {
  it('目录列出全部课时，并标出当前一节', () => {
    const lessons = lessonsOf('zh');
    const html = renderLesson('zh', lessons[1]!.slug);

    for (const lesson of lessons) {
      expect(html).toContain(`href="/zh/learn/${lesson.slug}"`);
    }
    expect(html).toContain('aria-current="page"');
  });

  it('只渲染当前课时的代码块', () => {
    for (const lesson of lessonsOf('zh')) {
      const expected = lesson.blocks.filter((block) => block.kind === 'code').length;
      const html = renderLesson('zh', lesson.slug);
      expect((html.match(/data-role="code-block"/g) ?? []).length, lesson.slug).toBe(expected);
    }
  });

  it('无效 slug 回退到第一节而不是空白页', () => {
    const first = lessonsOf('zh')[0]!;
    const html = renderLesson('zh', 'no-such-lesson');

    expect(html).toContain(first.title);
    expect(html).toContain(first.lead);
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

  it('练习按钮的索引排在所有代码块之后', () => {
    const lesson = lessonsOf('zh').find((item) => item.exercise);
    expect(lesson).toBeDefined();

    const codeCount = lesson!.blocks.filter((block) => block.kind === 'code').length;
    const html = renderLesson('zh', lesson!.slug);
    const indexes = [...html.matchAll(/data-code-index="(\d+)"/g)].map((match) => Number(match[1]));

    expect(Math.max(...indexes)).toBe(codeCount);
  });

  it('每节课的正文都能渲染出非空内容', () => {
    for (const lesson of lessonsOf('zh')) {
      const html = renderLesson('zh', lesson.slug);
      expect(html).toContain(lesson.title);
      expect(html.length, lesson.slug).toBeGreaterThan(1000);
    }
  });
});

describe('课程页交互绑定', () => {
  beforeEach(() => {
    createLeanPanel.mockReset();
    createLeanPanel.mockReturnValue(makePanel());
    document.body.innerHTML = renderLesson('zh', 'first-proof');
  });

  it('挂载紧凑编辑器并预载第一段代码', () => {
    bindLesson(document.body, 'zh', 'first-proof');

    expect(createLeanPanel).toHaveBeenCalledTimes(1);
    const [, options] = createLeanPanel.mock.calls[0] as [
      HTMLElement,
      { variant: string; code: string; locale: string },
    ];
    expect(options.variant).toBe('compact');
    expect(options.locale).toBe('zh');
    expect(options.code.length).toBeGreaterThan(0);
  });

  it('点代码块按钮把对应代码送进面板并高亮', () => {
    bindLesson(document.body, 'zh', 'first-proof');
    const panel = createLeanPanel.mock.results[0]!.value as ReturnType<typeof makePanel>;

    const blocks = [...document.body.querySelectorAll<HTMLElement>('[data-role="code-block"]')];
    expect(blocks.length).toBeGreaterThan(1);

    blocks[1]!.querySelector<HTMLButtonElement>('button')!.click();

    expect(panel.setCode).toHaveBeenCalledTimes(1);
    expect(blocks[1]!.dataset.loaded).toBe('true');
    expect(blocks[0]!.dataset.loaded).toBe('false');
  });

  it('练习按钮载入该课的 starter 代码', () => {
    bindLesson(document.body, 'zh', 'first-proof');
    const panel = createLeanPanel.mock.results[0]!.value as ReturnType<typeof makePanel>;
    const starter = lessonsOf('zh')[0]!.exercise!.starter;

    const exerciseButton = document.body.querySelector<HTMLButtonElement>(
      'section button[data-code-index]',
    );
    expect(exerciseButton).not.toBeNull();
    exerciseButton!.click();

    expect(panel.setCode).toHaveBeenCalledWith(starter, { focus: true });
  });

  it('缺少挂载点时安全退出', () => {
    document.body.innerHTML = '<div></div>';

    bindLesson(document.body, 'zh');

    expect(createLeanPanel).not.toHaveBeenCalled();
  });
});
