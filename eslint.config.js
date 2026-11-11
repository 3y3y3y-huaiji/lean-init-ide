import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/wasm-lean4/**',
      'public/sw.js',
      'scripts/assets/**',
      '.wrangler/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
