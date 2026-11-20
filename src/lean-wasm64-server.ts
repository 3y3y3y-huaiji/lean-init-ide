/**
 * 实验性 wasm64 语言服务器入口：加载 64 位运行时 → 起监督器 → 返回与 wasm32
 * 相同形状的 LeanSessionServer。不稳定，仅在用户手动选择 wasm64 且浏览器支持
 * Memory64 时使用；默认生产路径仍是 @wasm-idle/lsp 的 wasm32。
 */
import type { LeanSessionServer } from './lean-session';
import { wasm64Available } from './lean-wasm64-available';
import { loadWasm64Runtime, type Wasm64Manifest } from './lean-wasm64-runtime';
import { createWasm64Supervisor, type LeanProcessFactory } from './lean-wasm64-supervisor';

export { wasm64Available };

export type Wasm64ServerOptions = {
  readonly manifest?: Wasm64Manifest;
  /** 额外挂载的库 id（std / mathlib）；依赖会自动展开。 */
  readonly extensions?: readonly string[];
  /** 线性内存实际增长时回调（字节）；接内存守卫。 */
  readonly onMemoryBytes?: (bytes: number) => void;
  /** 进程崩溃等终态错误。 */
  readonly onError?: (message: string) => void;
  readonly onStage?: (stage: string) => void;
  readonly startupTimeoutMs?: number;
  /** 测试注入：替换真实的 Worker 进程工厂。 */
  readonly createFactory?: (
    runtime: Awaited<ReturnType<typeof loadWasm64Runtime>>,
    options: { onMemoryBytes?: (bytes: number) => void; startupTimeoutMs: number },
  ) => LeanProcessFactory;
};

export const createWasm64LanguageServer = async (
  options: Wasm64ServerOptions = {},
): Promise<LeanSessionServer> => {
  const runtime = await loadWasm64Runtime({
    ...(options.manifest ? { manifest: options.manifest } : {}),
    ...(options.extensions ? { extensions: options.extensions } : {}),
    ...(options.onStage ? { onStage: options.onStage } : {}),
  });
  try {
    const createFactory =
      options.createFactory ?? (await import('./wasm64-process')).createWasm64ProcessFactory;
    const factory = createFactory(runtime, {
      ...(options.onMemoryBytes ? { onMemoryBytes: options.onMemoryBytes } : {}),
      startupTimeoutMs: options.startupTimeoutMs ?? 10 * 60_000,
    });
    const server = await createWasm64Supervisor(factory, {
      ...(options.onError ? { onError: options.onError } : {}),
    });
    return {
      ...server,
      dispose: () => {
        server.dispose();
        runtime.dispose();
      },
    };
  } catch (error) {
    runtime.dispose();
    throw error;
  }
};
