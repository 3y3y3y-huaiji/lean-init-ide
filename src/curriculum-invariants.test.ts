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

  // 课程页说证 A、starter 却是 B，是这轮审计里占比最高的问题。
  // 规则：starter 里出现、正文代码块里没有的定理名，必须在题干或提示里被点名。
  it('练习独有的定理名必须出现在题干或提示里，避免文题不符', async () => {
    const DECLARATION =
      /\b(?:theorem|lemma|def|structure|inductive|class|abbrev|opaque|instance)\s+([A-Za-z_][A-Za-z0-9_']*)/g;

    for (const locale of LOCALES) {
      for (const lesson of await loadLessons(locale)) {
        if (!lesson.exercise) continue;
        const blockCode = lesson.blocks
          .flatMap((block) => (block.kind === 'code' ? [block.code] : []))
          .join('\n');
        const starterNames = Array.from(
          lesson.exercise.starter.matchAll(DECLARATION),
          (match) => match[1]!,
        );
        const exerciseOnly = [...new Set(starterNames)].filter(
          (name) => !new RegExp(`(?<![A-Za-z0-9_'])${name}(?![A-Za-z0-9_'])`).test(blockCode),
        );
        if (exerciseOnly.length === 0) continue;

        const text = `${lesson.exercise.body}\n${lesson.exercise.hint ?? ''}`;
        const mentioned = exerciseOnly.some((name) =>
          new RegExp(`(?<![A-Za-z0-9_'])${name}(?![A-Za-z0-9_'])`).test(text),
        );
        expect(mentioned, `${locale}:${lesson.slug}: ${exerciseOnly.join(', ')}`).toBe(true);
      }
    }
  });

  it('Std / Batteries 依赖必须同时出现在代码与 requires 元数据里', async () => {
    for (const locale of LOCALES) {
      for (const lesson of await loadLessons(locale)) {
        const code = [
          ...lesson.blocks.flatMap((block) => (block.kind === 'code' ? [block.code] : [])),
          lesson.exercise?.starter ?? '',
        ].join('\n');
        const requires = new Set(lesson.requires ?? []);
        const importsStd = /import\s+Std\./.test(code);
        const importsBatteries = /import\s+Batteries\./.test(code);

        expect(requires.has('batteries'), `${locale}:${lesson.slug}`).toBe(importsBatteries);
        if (importsStd || requires.has('std')) {
          expect(requires.has('std'), `${locale}:${lesson.slug}`).toBe(true);
          expect(importsStd, `${locale}:${lesson.slug}`).toBe(true);
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
        expect(pageTitle(resolved.route).length).toBeGreaterThan(0);
        expect(pageDescription(resolved.route)).toContain(lesson.lead);
      }
    }
  });
});
