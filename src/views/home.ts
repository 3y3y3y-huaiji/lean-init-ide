import { messagesFor, type Locale } from '../i18n';

export const renderHome = (locale: Locale): string => {
  const t = messagesFor(locale).home;

  const features = t.features
    .map(
      (feature) => `
      <article class="feature-card">
        <h3>${feature.title}</h3>
        <p>${feature.body}</p>
      </article>`,
    )
    .join('');

  return `
    <section class="hero">
      <p class="eyebrow">${t.eyebrow}</p>
      <h1>${t.title}</h1>
      <p class="hero-lead">${t.lead}</p>
      <div class="hero-actions">
        <a class="button" href="/${locale}/learn/first-proof">${t.ctaPrimary}</a>
        <a class="ghost-button ghost-button-lg" href="/${locale}/playground">${t.ctaSecondary}</a>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">${t.featuresTitle}</h2>
      <div class="feature-grid">${features}</div>
    </section>

    <section class="section callout-grid">
      <article class="callout">
        <h2>${t.limitsTitle}</h2>
        <p>${t.limitsBody}</p>
      </article>
      <article class="callout callout-accent">
        <h2>${t.courseTitle}</h2>
        <p>${t.courseBody}</p>
        <a class="button" href="/${locale}/learn/first-proof">${t.courseCta}</a>
      </article>
    </section>
  `;
};
