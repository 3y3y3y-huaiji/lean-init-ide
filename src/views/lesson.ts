import { createLeanPanel } from '../components/lean-panel';
import { messagesFor, type Locale } from '../i18n';
import { escapeHtml } from './html';

export const renderLesson = (locale: Locale): string => {
  const t = messagesFor(locale).lesson;
  let codeIndex = 0;

  const sections = t.sections
    .map((section) => {
      const paragraphs = section.paragraphs.map((text) => `<p>${text}</p>`).join('');
      const code = section.code
        ? `
        <div class="code-block">
          <div class="code-bar">
            <span>Lean 4</span>
            <button class="ghost-button" type="button" data-code-index="${codeIndex++}">${t.openInEditor}</button>
          </div>
          <pre><code>${escapeHtml(section.code)}</code></pre>
        </div>`
        : '';
      const after = section.after ? `<p class="lesson-note">${section.after}</p>` : '';
      return `
      <section class="lesson-section">
        <h2>${section.heading}</h2>
        ${paragraphs}${code}${after}
      </section>`;
    })
    .join('');

  return `
    <div class="lesson-layout">
      <article class="lesson">
        <header class="lesson-header">
          <p class="eyebrow">${t.eyebrow}</p>
          <h1>${t.title}</h1>
          <p class="lesson-lead">${t.lead}</p>
        </header>
        ${sections}
        <section class="lesson-exercise">
          <h2>${t.exerciseTitle}</h2>
          <p>${t.exerciseBody}</p>
          <button class="button" type="button" data-code-index="${codeIndex}">${t.exerciseCta}</button>
        </section>
      </article>
      <aside class="lesson-aside">
        <p class="lesson-hint">${t.editorHint}</p>
        <div class="lesson-panel" data-role="lean-panel"></div>
      </aside>
    </div>
  `;
};

export const bindLesson = (root: HTMLElement, locale: Locale) => {
  const t = messagesFor(locale).lesson;
  const codes = [...t.sections.flatMap((section) => (section.code ? [section.code] : [])), t.starter];
  const host = root.querySelector<HTMLElement>('[data-role="lean-panel"]');
  if (!host) return;

  const initialCode = codes[0] ?? t.starter;
  const panel = createLeanPanel(host, { variant: 'compact', code: initialCode, locale });
  const narrow = window.matchMedia('(max-width: 960px)');

  // 记录最近一次自动载入的代码：只有用户没改过内容时，滚动才继续跟随。
  let autoLoaded = initialCode;

  const blocks = [...root.querySelectorAll<HTMLElement>('.code-block')];
  const highlight = (index: number) => {
    for (const block of blocks) {
      const button = block.querySelector<HTMLButtonElement>('[data-code-index]');
      block.classList.toggle('is-loaded', button?.dataset.codeIndex === String(index));
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

  // 跟随阅读：滚动到某一节时，如果编辑器内容仍是上次自动载入的代码（用户没改过），
  // 就把这一节的代码换进去，让左右两边始终对得上。
  const sections = [...root.querySelectorAll<HTMLElement>('.lesson-section')];
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      const button = visible.target.querySelector<HTMLButtonElement>('[data-code-index]');
      if (!button) return;
      const index = Number(button.dataset.codeIndex);
      const code = codes[index];
      if (code === undefined || code === autoLoaded) return;
      if (panel.getCode() !== autoLoaded) return;
      load(index, { focus: false });
    },
    { rootMargin: '-20% 0px -55% 0px' },
  );

  for (const section of sections) observer.observe(section);
};
