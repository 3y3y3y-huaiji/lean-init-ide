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
  `;
};

export const bindLesson = (root: HTMLElement, locale: Locale) => {
  const t = messagesFor(locale).lesson;
  const codes = [...t.sections.flatMap((section) => (section.code ? [section.code] : [])), t.starter];

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-code-index]')) {
    button.addEventListener('click', () => {
      const code = codes[Number(button.dataset.codeIndex)];
      if (code === undefined) return;
      try {
        sessionStorage.setItem('lean:code', code);
      } catch {
        // 存储不可用时仍然跳转，只是不会带上示例代码。
      }
      location.href = `/${locale}/playground`;
    });
  }
};
