import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createLeanPanel } = vi.hoisted(() => ({ createLeanPanel: vi.fn() }));

vi.mock('../components/lean-panel', () => ({ createLeanPanel }));

import { messagesFor } from '../i18n';
import { bindLesson, renderLesson } from './lesson';

const makePanel = () => ({ setCode: vi.fn(), getCode: vi.fn(() => '') });

const codeSectionsOf = (locale: 'zh' | 'en') =>
  messagesFor(locale).lesson.sections.filter((section) => Boolean(section.code));

describe('课程页渲染', () => {
  it('每种语言都渲染出全部小节', () => {
    for (const locale of ['zh', 'en'] as const) {
      const expected = messagesFor(locale).lesson.sections.length;
      const html = renderLesson(locale);
      expect(html.match(/data-role="lesson-section"/g)?.length, locale).toBe(expected);
    }
  });

  it('只有带代码的小节才生成代码块', () => {
    for (const locale of ['zh', 'en'] as const) {
      const expected = codeSectionsOf(locale).length;
      expect(renderLesson(locale).match(/data-role="code-block"/g)?.length ?? 0, locale).toBe(
        expected,
      );
    }
  });

  it('代码块索引从 0 连续递增，练习按钮接在最后', () => {
    const locale = 'zh';
    const total = codeSectionsOf(locale).length;
    const indexes = [...renderLesson(locale).matchAll(/data-code-index="(\d+)"/g)].map((match) =>
      Number(match[1]),
    );

    expect(indexes).toEqual([...Array(total + 1).keys()]);
  });

  it('侧栏保留编辑器挂载点', () => {
    expect(renderLesson('zh')).toContain('data-role="lean-panel"');
  });
});

describe('课程页交互绑定', () => {
  beforeEach(() => {
    createLeanPanel.mockReset();
    createLeanPanel.mockReturnValue(makePanel());
    document.body.innerHTML = renderLesson('zh');
  });

  it('挂载时使用紧凑变体并载入第一段代码', () => {
    bindLesson(document.body, 'zh');

    expect(createLeanPanel).toHaveBeenCalledTimes(1);
    const [host, options] = createLeanPanel.mock.calls[0] as [
      HTMLElement,
      { variant: string; code: string; locale: string },
    ];
    expect(host.dataset.role).toBe('lean-panel');
    expect(options.variant).toBe('compact');
    expect(options.locale).toBe('zh');
    expect(options.code.length).toBeGreaterThan(0);
  });

  it('默认高亮第一个代码块', () => {
    bindLesson(document.body, 'zh');

    const loaded = [...document.body.querySelectorAll<HTMLElement>('[data-role="code-block"]')].map(
      (block) => block.dataset.loaded,
    );
    expect(loaded[0]).toBe('true');
    expect(loaded.slice(1).every((value) => value === 'false')).toBe(true);
  });

  it('缺少挂载点时安全退出', () => {
    document.body.innerHTML = '<div></div>';

    bindLesson(document.body, 'zh');

    expect(createLeanPanel).not.toHaveBeenCalled();
  });
});
