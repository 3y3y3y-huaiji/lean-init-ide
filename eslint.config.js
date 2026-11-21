import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/wasm-lean4/**',
      'public/vendor/**',
      'public/sw.js',
      'scripts/assets/**',
      '.wrangler/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  {
    files: ['src/**/*.ts', 'functions/**/*.ts'],
    ignores: ['**/*.test.ts', 'src/i18n/**', 'src/challenges.ts'],
    rules: {
      'max-lines': ['error', { max: 520, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/views/lesson.ts'],
    rules: {
      'max-lines': ['error', { max: 750, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // PR B2 将把 lean-panel.ts 拆成职责单一的子模块并移除本豁免。
    files: ['src/components/lean-panel.ts'],
    rules: {
      'max-lines': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    // 共享模块同时被 Node 构建脚本、Service Worker 与 Vitest 引用。
    files: ['src/**/*.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['functions/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker, ReadableStream: 'readonly' },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // 递归深度探针运行在浏览器 Worker 里。
    files: ['scripts/depth-probe/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['src/sw.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
);
