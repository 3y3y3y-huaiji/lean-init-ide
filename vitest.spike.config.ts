import { defineConfig } from 'vitest/config';

// spike 分支专用的单测配置：只跑 scripts/ 下的 TS，不影响主应用的 vitest.config.ts。
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['scripts/lib/**/*.ts', 'scripts/*.ts', 'scripts/ci/**/*.ts'],
      exclude: [
        'scripts/**/*.test.ts',
        // 下面三个是进程级集成脚本：主体是启动 wasm/pthread 与真实 LSP 会话，
        // 单测只覆盖其中可导出的纯函数，整体行数不计入阈值（避免用假 wasm 刷覆盖率）。
        'scripts/wasm64-lsp-worker.ts',
        'scripts/wasm64-lsp-browser-worker.ts',
        'scripts/wasm64-lsp-diagnostics.ts',
        'scripts/wasm64-lsp-handshake.ts',
        'scripts/wasm64-browser-verify.ts',
        'scripts/wasm64-browser-harness.ts',
      ],
      thresholds: {
        lines: 75,
        statements: 75,
        branches: 60,
        functions: 60,
      },
    },
  },
});
