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
      // 仅设防失控硬底线，不发 warn 噪声；高内聚领域模块允许附中文原因的局部豁免：
      // /* eslint-disable max-lines -- <原因> */
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
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
    files: ['public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['src/sw.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
);
