import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'functions/**/*.test.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.mjs', 'functions/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'functions/**/*.test.ts',
        'src/**/*.d.ts',
        'src/**/*.d.mts',
        'src/test-setup.ts',
        // 纯类型声明，没有可执行代码。
        'src/i18n/types.ts',
        // 只有 Monaco contribution 的副作用 import，单测无法覆盖。
        'src/monaco-contrib.ts',
        // Monaco 装配层：依赖真实编辑器实例与 Web Worker，行为由线上冒烟兜底。
        'src/components/lean-panel.ts',
        // 入口文件只做装配，逻辑都在被覆盖的模块里。
        'src/main.ts',
        'src/sw.ts',
      ],
      // 阈值留在当前水位下方几个点：防止改动时悄悄丢掉测试，又不至于卡住正常迭代。
      thresholds: {
        statements: 78,
        branches: 76,
        functions: 62,
        lines: 80,
        // 资产分发网关是线上关键路径，不允许降级。
        '**/functions/**': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
      },
    },
  },
});
