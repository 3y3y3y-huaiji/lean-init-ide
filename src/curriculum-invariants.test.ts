import { beforeAll, describe, expect, it } from 'vitest';
import { isExerciseStarter } from './exercise';
import { loadLessons, loadLocale, LOCALES } from './i18n';
import { pageDescription, pageTitle } from './page-meta';
import { canonicalRoutePath, FIRST_LESSON_SLUG, resolveRoute } from './router';

describe('curriculum & route invariants', () => {
  beforeAll(async () => {
    await Promise.all([...LOCALES.map(loadLocale), ...LOCALES.map(loadLessons)]);
  });

  it('zh 与 en 保持一一对应的课时 slug、路径分类与练习配置', async () => {
    const [zhLessons, enLessons] = await Promise.all([loadLessons('zh'), loadLessons('en')]);

    expect(zhLessons.length).toBeGreaterThan(0);
    expect(zhLessons.map((lesson) => lesson.slug)).toEqual(enLessons.map((lesson) => lesson.slug));
    expect(zhLessons[0]?.slug).toBe(FIRST_LESSON_SLUG);

    for (let index = 0; index < zhLessons.length; index += 1) {
      const zhLesson = zhLessons[index]!;
      const enLesson = enLessons[index]!;
      expect(zhLesson.track ?? 'intro', zhLesson.slug).toBe(enLesson.track ?? 'intro');
      expect(Boolean(zhLesson.exercise), zhLesson.slug).toBe(Boolean(enLesson.exercise));
    }
  });

  it('每节课程都有合法唯一的 slug、非空正文块和可判定的练习模板', async () => {
    for (const locale of LOCALES) {
      const lessons = await loadLessons(locale);
      const seen = new Set<string>();

      for (const lesson of lessons) {
        expect(lesson.slug, locale).toMatch(/^[a-z0-9-]+$/);
        expect(seen.has(lesson.slug), `${locale}:${lesson.slug}`).toBe(false);
        seen.add(lesson.slug);

        expect(lesson.navTitle.trim().length, `${locale}:${lesson.slug}:navTitle`).toBeGreaterThan(
          0,
        );
        expect(lesson.title.trim().length, `${locale}:${lesson.slug}:title`).toBeGreaterThan(0);
        expect(lesson.lead.trim().length, `${locale}:${lesson.slug}:lead`).toBeGreaterThan(0);
        expect(lesson.blocks.length, `${locale}:${lesson.slug}:blocks`).toBeGreaterThan(0);

        for (const block of lesson.blocks) {
          if (block.kind === 'code') {
            expect(block.code.trim().length, `${locale}:${lesson.slug}:code`).toBeGreaterThan(0);
          } else {
            expect(
              block.text.trim().length,
              `${locale}:${lesson.slug}:${block.kind}`,
            ).toBeGreaterThan(0);
          }
        }

        if (lesson.exercise) {
          expect(
            lesson.exercise.title.trim().length,
            `${locale}:${lesson.slug}:exTitle`,
          ).toBeGreaterThan(0);
          expect(
            lesson.exercise.body.trim().length,
            `${locale}:${lesson.slug}:exBody`,
          ).toBeGreaterThan(0);
          expect(
            lesson.exercise.cta.trim().length,
            `${locale}:${lesson.slug}:exCta`,
          ).toBeGreaterThan(0);
          expect(
            isExerciseStarter(lesson.exercise.starter),
            `${locale}:${lesson.slug}:starter`,
          ).toBe(true);
        }
      }
    }
  });

  it('所有课时路由、canonical 路径与页面元信息均能精确解析而不回退', async () => {
    for (const locale of LOCALES) {
      const lessons = await loadLessons(locale);
      for (const lesson of lessons) {
        const path = `/${locale}/learn/${lesson.slug}`;
        const resolved = resolveRoute(path, locale);
        expect(resolved, path).toEqual({
          kind: 'route',
          route: { page: 'lesson', locale, slug: lesson.slug },
        });
        if (resolved.kind !== 'route') continue;
        expect(canonicalRoutePath(resolved.route)).toBe(path);
        expect(pageTitle(resolved.route)).toBe(`${lesson.title} · Lean Init IDE`);
        expect(pageDescription(resolved.route)).toBe(lesson.lead);
      }
    }
  });
});
