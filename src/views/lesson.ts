import { createLeanPanel } from '../components/lean-panel';
import { buttonClass, ghostButtonClass } from '../components/ui';
import { messagesFor, type Locale } from '../i18n';
import { escapeHtml } from './html';

export const renderLesson = (locale: Locale): string => {
  const t = messagesFor(locale).lesson;
  let codeIndex = 0;

  const sections = t.sections
    .map((section) => {
      const paragraphs = section.paragraphs
        .map((text) => `<p class="mt-0 mb-3">${text}</p>`)
        .join('');
      const code = section.code
        ? `
        <div
          data-role="code-block"
          class="my-4 overflow-hidden rounded-xl border border-line bg-panel-soft data-[loaded=true]:border-accent data-[loaded=true]:ring-1 data-[loaded=true]:ring-accent-soft"
        >
          <div class="flex items-center justify-between gap-3 border-b border-line py-1.5 pl-3.5 pr-2 text-xs uppercase tracking-[0.06em] text-muted">
            <span>Lean 4</span>
            <button class="${ghostButtonClass}" type="button" data-code-index="${codeIndex++}">${t.openInEditor}</button>
          </div>
          <pre class="m-0 overflow-auto px-4 py-3.5 font-mono text-[13.5px] leading-[1.65]"><code>${escapeHtml(section.code)}</code></pre>
        </div>`
        : '';
      const after = section.after
        ? `<p class="mt-0 mb-3 border-l-2 border-line-strong pl-3 text-sm text-muted">${section.after}</p>`
        : '';
      return `
      <section data-role="lesson-section" class="mt-[38px]">
        <h2 class="mt-0 mb-3 text-xl font-bold">${section.heading}</h2>
        ${paragraphs}${code}${after}
      </section>`;
    })
    .join('');

  return `
    <div class="grid grid-cols-[minmax(0,1fr)_minmax(360px,440px)] items-start gap-[clamp(20px,3vw,40px)] max-[960px]:grid-cols-1">
      <article class="max-w-[780px]">
        <header>
          <p class="mt-0 mb-2 text-xs uppercase tracking-[0.12em] text-accent">${t.eyebrow}</p>
          <h1 class="mt-0 mb-3 text-[clamp(28px,4.4vw,42px)] tracking-[-0.015em]">${t.title}</h1>
          <p class="m-0 text-base text-muted">${t.lead}</p>
        </header>
        ${sections}
        <section class="mt-11 rounded-2xl border border-accent bg-accent-soft p-6">
          <h2 class="mt-0 mb-2.5 text-lg font-bold">${t.exerciseTitle}</h2>
          <p class="mt-0 mb-4 text-muted">${t.exerciseBody}</p>
          <button class="${buttonClass}" type="button" data-code-index="${codeIndex}">${t.exerciseCta}</button>
        </section>
      </article>
      <aside
        class="sticky top-[84px] flex max-h-[calc(100vh-100px)] flex-col gap-2.5 overflow-auto max-[960px]:static"
      >
        <p class="m-0 text-xs leading-[1.55] text-muted">${t.editorHint}</p>
        <div data-role="lean-panel"></div>
      </aside>
    </div>
  `;
};

export const bindLesson = (root: HTMLElement, locale: Locale) => {
  const t = messagesFor(locale).lesson;
  const codes = [
    ...t.sections.flatMap((section) => (section.code ? [section.code] : [])),
    t.starter,
  ];
  const host = root.querySelector<HTMLElement>('[data-role="lean-panel"]');
  if (!host) return;

  const initialCode = codes[0] ?? t.starter;
  const panel = createLeanPanel(host, { variant: 'compact', code: initialCode, locale });
  const narrow = window.matchMedia('(max-width: 960px)');

  // 记录最近一次自动载入的代码：只有用户没改过内容时，滚动才继续跟随。
  let autoLoaded = initialCode;

  const blocks = [...root.querySelectorAll<HTMLElement>('[data-role="code-block"]')];
  const highlight = (index: number) => {
    for (const block of blocks) {
      const button = block.querySelector<HTMLButtonElement>('[data-code-index]');
      block.dataset.loaded = String(button?.dataset.codeIndex === String(index));
    }
  };

  const load = (index: number, options?: { focus?: boolean }) => {
    const code = codes[index];
    if (code === undefined) return;
    panel.setCode(code, { focus: options?.focus ?? true });
    autoLoaded = code;
    highlight(index);
  };

  highlight(0);

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-code-index]')) {
    button.addEventListener('click', () => {
      load(Number(button.dataset.codeIndex));
      if (narrow.matches) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // 跟随阅读：以视口上方 35% 处为基准，判定当前读到哪一节；
  // 编辑器仍是上次自动载入的内容（用户没改过）时，就换成这一节的代码。
  const sections = [...root.querySelectorAll<HTMLElement>('[data-role="lesson-section"]')];

  const followReader = () => {
    const marker = window.innerHeight * 0.35;
    let current: HTMLElement | undefined;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= marker) current = section;
    }
    if (!current) return;
    const button = current.querySelector<HTMLButtonElement>('[data-code-index]');
    if (!button) return;
    const index = Number(button.dataset.codeIndex);
    const code = codes[index];
    if (code === undefined || code === autoLoaded) return;
    if (panel.getCode() !== autoLoaded) return;
    load(index, { focus: false });
  };

  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        followReader();
      });
    },
    { passive: true },
  );

  followReader();
};
