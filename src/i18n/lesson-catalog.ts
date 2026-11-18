import type { LessonTrack } from './types';

export type LessonCatalogEntry = {
  slug: string;
  track: LessonTrack;
};

/** 轻量课程索引：供首页与路由预渲染枚举路径，避免下载整套课程正文。 */
export const LESSON_CATALOG: readonly LessonCatalogEntry[] = [
  { slug: 'what-is-lean', track: 'intro' },
  { slug: 'first-proof', track: 'intro' },
  { slug: 'implication', track: 'intro' },
  { slug: 'connectives', track: 'intro' },
  { slug: 'induction', track: 'intro' },
  { slug: 'rewrite', track: 'intro' },
  { slug: 'simp', track: 'intro' },
  { slug: 'quantifiers', track: 'intro' },
  { slug: 'list-structure', track: 'intro' },
  { slug: 'math-proof-style', track: 'math' },
  { slug: 'math-divisibility', track: 'math' },
  { slug: 'math-parity', track: 'math' },
  { slug: 'math-gcd', track: 'math' },
  { slug: 'math-primes', track: 'math' },
  { slug: 'math-sets', track: 'math' },
  { slug: 'math-functions', track: 'math' },
  { slug: 'math-relations', track: 'math' },
  { slug: 'math-strong-induction', track: 'math' },
  { slug: 'code-sorting', track: 'math' },
  { slug: 'code-sum', track: 'math' },
  { slug: 'math-axioms', track: 'math' },
  { slug: 'math-mathlib', track: 'math' },
  { slug: 'eng-hashmap', track: 'eng' },
  { slug: 'eng-bitvec', track: 'eng' },
  { slug: 'eng-rbmap', track: 'eng' },
  { slug: 'eng-array-bounds', track: 'eng' },
  { slug: 'eng-state-machine', track: 'eng' },
];
