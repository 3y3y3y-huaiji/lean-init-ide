import { describe, expect, it } from 'vitest';
import { LESSON_CATALOG, messagesFor } from '../i18n';
import { hydrateHome, renderHome } from './home';

describe('首页渲染', () => {
  it('主行动按钮指向当前语言的课程页', () => {
    expect(renderHome('zh')).toContain('href="/zh/learn/what-is-lean"');
    expect(renderHome('en')).toContain('href="/en/learn/what-is-lean"');
  });

  it('次要行动按钮指向 playground', () => {
    expect(renderHome('zh')).toContain('href="/zh/playground"');
    expect(renderHome('en')).toContain('href="/en/playground"');
  });

  it('有完成进度时继续学习指向第一节未完成课', () => {
    const html = renderHome('zh', new Set(['what-is-lean']), new Set(['what-is-lean']));
    expect(html).toContain('href="/zh/learn/first-proof"');
    expect(html).toContain(messagesFor('zh').home.continueCta);
  });

  it('只有已读、没有完成时，继续学习回到第一节未完成课', () => {
    const html = renderHome('zh', new Set(['first-proof']), new Set());
    expect(html).toContain('href="/zh/learn/what-is-lean"');
  });

  it('每条特性都渲染成独立卡片', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderHome(locale);
      const expected = messagesFor(locale).home.features.length;
      expect(html.match(/<article/g)?.length, locale).toBe(expected + 5);
    }
  });

  it('趣味数学挑战入口与系统课程并列分流', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderHome(locale);
      expect(html).toContain(`href="/${locale}/challenges"`);
      expect(html).toContain(messagesFor(locale).home.challengesTitle);
      expect(html).toContain(messagesFor(locale).home.challengesCta);
    }
  });

  it('数学与验证路径入口指向第一节数学课', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderHome(locale);
      const mathLessons = LESSON_CATALOG.filter((lesson) => lesson.track === 'math');
      expect(html).toContain(messagesFor(locale).lesson.tracks.math.title);
      expect(html).toContain(`href="/${locale}/learn/${mathLessons[0]!.slug}"`);
    }
  });

  it('中文数学路径文案说的是「中学数学直觉」', () => {
    expect(messagesFor('zh').lesson.tracks.math.lead).toContain('中学数学直觉');
    expect(messagesFor('zh').lesson.tracks.math.lead).not.toContain('中文数学直觉');
  });

  it('工程实战路径入口指向第一节工程课', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderHome(locale);
      const engLessons = LESSON_CATALOG.filter((lesson) => lesson.track === 'eng');
      expect(engLessons.length, locale).toBe(5);
      expect(html).toContain(messagesFor(locale).lesson.tracks.eng.title);
      expect(html).toContain(`href="/${locale}/learn/${engLessons[0]!.slug}"`);
    }
  });

  it('三条学习路径卡片的开始按钮各自拥有区分用途的 aria-label', () => {
    for (const locale of ['zh', 'en'] as const) {
      document.body.innerHTML = renderHome(locale);
      const t = messagesFor(locale);
      const labels = (['intro', 'math', 'eng'] as const).map((track) => {
        const anchor = document.body.querySelector<HTMLAnchorElement>(`[data-home-cta="${track}"]`);
        const label = anchor?.getAttribute('aria-label') ?? '';
        expect(label, `${locale}:${track}`).toContain(t.home.courseCta);
        expect(label, `${locale}:${track}`).toContain(t.lesson.tracks[track].title);
        return label;
      });
      expect(new Set(labels).size, locale).toBe(3);
    }
  });

  it('两种语言的标题都出现在页面里', () => {
    expect(renderHome('zh')).toContain(messagesFor('zh').home.title);
    expect(renderHome('en')).toContain(messagesFor('en').home.title);
  });

  it('hydrateHome 原地更新进度链接与文案且不替换主标题节点', () => {
    document.body.innerHTML = renderHome('zh');
    const originalH1 = document.body.querySelector('h1');

    hydrateHome(document.body, 'zh', new Set(['what-is-lean']), new Set(['what-is-lean']));

    expect(document.body.querySelector('h1')).toBe(originalH1);
    const primary = document.body.querySelector<HTMLAnchorElement>('[data-home-cta="primary"]');
    expect(primary?.getAttribute('href')).toBe('/zh/learn/first-proof');
    expect(primary?.textContent).toBe(messagesFor('zh').home.continueCta);
    const intro = document.body.querySelector<HTMLAnchorElement>('[data-home-cta="intro"]');
    expect(intro?.getAttribute('href')).toBe('/zh/learn/first-proof');
    const mathLessons = LESSON_CATALOG.filter((lesson) => lesson.track === 'math');
    if (mathLessons.length >= 2) {
      hydrateHome(document.body, 'zh', new Set(), new Set([mathLessons[0]!.slug]));
      const math = document.body.querySelector<HTMLAnchorElement>('[data-home-cta="math"]');
      expect(math?.getAttribute('href')).toBe(`/zh/learn/${mathLessons[1]!.slug}`);
    }
  });

  it('首屏零下载演示可以逐步骤推进，并在最后一步禁用下一步', () => {
    document.body.innerHTML = renderHome('zh');
    hydrateHome(document.body, 'zh');

    const t = messagesFor('zh').home.demo;
    const goal = document.body.querySelector<HTMLElement>('[data-role="demo-goal"]')!;
    const count = document.body.querySelector<HTMLElement>('[data-role="demo-count"]')!;
    const next = document.body.querySelector<HTMLButtonElement>('[data-role="demo-next"]')!;
    const reset = document.body.querySelector<HTMLButtonElement>('[data-role="demo-reset"]')!;

    expect(goal.textContent).toBe(t.steps[0]!.goal);
    expect(count.textContent).toBe(t.stepLabel(1, t.steps.length));

    next.click();
    expect(goal.textContent).toBe(t.steps[1]!.goal);

    next.click();
    expect(goal.textContent).toBe(t.steps[2]!.goal);
    expect(next.disabled).toBe(true);

    reset.click();
    expect(goal.textContent).toBe(t.steps[0]!.goal);
    expect(next.disabled).toBe(false);
  });

  it('renderHome 嵌入静态演示步骤数据，hydrateHome 接管时保留加载前已点到的步骤', () => {
    document.body.innerHTML = renderHome('zh');
    const demo = document.body.querySelector<HTMLElement>('[data-role="home-demo"]')!;
    const t = messagesFor('zh').home.demo;
    expect(JSON.parse(demo.dataset.demoSteps ?? '[]')).toHaveLength(t.steps.length);
    expect(JSON.parse(demo.dataset.demoLabels ?? '[]')).toEqual(
      t.steps.map((_, i) => t.stepLabel(i + 1, t.steps.length)),
    );

    // 模拟在异步加载完成前内联代理已推进到第 2 步。
    demo.dataset.demoStep = '1';
    hydrateHome(document.body, 'zh');

    expect(document.body.querySelector('[data-role="demo-goal"]')?.textContent).toBe(
      t.steps[1]!.goal,
    );
    expect(document.body.querySelector('[data-role="demo-count"]')?.textContent).toBe(
      t.stepLabel(2, t.steps.length),
    );
  });

  it('hydrateHome 对越界或非法的 data-demo-step 安全夹紧，并在缺少 eng/math 进度时仍更新其它 CTA', () => {
    document.body.innerHTML = renderHome('en');
    const demo = document.body.querySelector<HTMLElement>('[data-role="home-demo"]')!;
    demo.dataset.demoStep = 'not-a-number';
    hydrateHome(document.body, 'en');
    expect(demo.dataset.demoStep).toBe('0');

    // 已绑定后再次调用 hydrateHome 不重复绑定事件，且推进工程课链接。
    const engLessons = LESSON_CATALOG.filter((lesson) => lesson.track === 'eng');
    hydrateHome(document.body, 'en', new Set(), new Set([engLessons[0]!.slug]));
    const eng = document.body.querySelector<HTMLAnchorElement>('[data-home-cta="eng"]');
    expect(eng?.getAttribute('href')).toBe(`/en/learn/${engLessons[1]!.slug}`);
  });

  it('hydrateHome 在空容器中安全无操作', () => {
    const empty = document.createElement('div');
    expect(() => hydrateHome(empty, 'en')).not.toThrow();
  });
});
