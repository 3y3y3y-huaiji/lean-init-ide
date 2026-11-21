/**
 * Service Worker 资产下载桥接器：
 * 注册 /sw.js，按当前架构过滤分片进度与回退消息，并上报首字节/完成埋点。
 */
import type { LeanRuntimeArch } from '../../device';
import type { Messages } from '../../i18n/types';
import { track } from '../../telemetry';

export type SwProgressKind = 'idle' | 'loading' | 'ready' | 'error';

export type AssetFallbackInfo = {
  readonly name: string;
  readonly message: string;
};

type SwMessagePayload = {
  type?: string;
  name?: string;
  loaded?: number;
  total?: number;
  overallLoaded?: number;
  overallTotal?: number;
  message?: string;
  source?: string;
  arch?: string;
};

export type SwBridgeOptions = {
  readonly t: Messages['playground'];
  readonly getSelectedArch: () => LeanRuntimeArch;
  readonly log: (message: string) => void;
  readonly setStatus: (text: string, kind: SwProgressKind) => void;
  readonly setProgress: (ratio: number | null) => void;
  readonly trackEvent?: typeof track;
  readonly serviceWorker?: Pick<
    ServiceWorkerContainer,
    'register' | 'ready' | 'addEventListener' | 'removeEventListener'
  > | null;
  readonly perfNow?: () => number;
};

export type SwBridge = {
  readonly resetProgressState: () => void;
  readonly hasAssetProgress: () => boolean;
  readonly getLastAssetFallback: () => AssetFallbackInfo | null;
  readonly clearLastAssetFallback: () => void;
  readonly dispose: () => void;
};

const MIB = 1048576;

export const createSwBridge = (options: SwBridgeOptions): SwBridge => {
  const {
    t,
    getSelectedArch,
    log,
    setStatus,
    setProgress,
    trackEvent = track,
    perfNow = () => performance.now(),
  } = options;
  const sw =
    options.serviceWorker !== undefined
      ? options.serviceWorker
      : typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? navigator.serviceWorker
        : null;

  let assetProgressSeen = false;
  let lastAssetFallback: AssetFallbackInfo | null = null;
  const assetTelemetry = { started: false, completed: false, startedAt: 0 };

  const registerServiceWorker = async () => {
    if (!sw) return;
    const startedAt = perfNow();
    try {
      await sw.register('/sw.js', { updateViaCache: 'none' });
      await sw.ready;
      log(t.logSwReady);
      trackEvent('sw', { ok: true, ms: perfNow() - startedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(t.logSwFailed(message));
      trackEvent('sw', { ok: false, ms: perfNow() - startedAt, message });
    }
  };
  void registerServiceWorker();

  const onMessage = (event: MessageEvent<SwMessagePayload>) => {
    const data = event.data;
    const arch = getSelectedArch();
    // 同源多标签页可能同时使用不同架构；只看当前面板架构的进度与回退。
    if (data?.arch && data.arch !== arch) return;
    if (data?.type === 'lean-asset-fallback' && data.name) {
      lastAssetFallback = { name: data.name, message: data.message ?? 'unknown error' };
      log(t.statusChunkFallback(data.name, lastAssetFallback.message));
      return;
    }
    if (data?.type !== 'lean-asset-progress' || !data.name || !data.loaded || !data.total) return;

    const loaded = data.overallLoaded ?? data.loaded;
    const total = data.overallTotal ?? data.total;
    if (total <= 0) return;
    assetProgressSeen = true;
    const downloaded = loaded >= total;

    if (!assetTelemetry.started) {
      assetTelemetry.started = true;
      assetTelemetry.startedAt = perfNow();
      trackEvent('assets', {
        phase: 'first_bytes',
        source: data.source ?? 'unknown',
        arch,
      });
    }
    if (downloaded && !assetTelemetry.completed) {
      assetTelemetry.completed = true;
      trackEvent('assets', {
        phase: 'complete',
        bytes: total,
        ms: perfNow() - assetTelemetry.startedAt,
        arch,
      });
    }
    setStatus(
      downloaded
        ? t.statusStarting
        : total < 0.1 * MIB
          ? t.statusLoading
          : t.statusChunks((loaded / MIB).toFixed(1), (total / MIB).toFixed(1)),
      'loading',
    );
    setProgress(loaded / total);
  };

  sw?.addEventListener('message', onMessage as EventListener);

  return {
    resetProgressState: () => {
      assetProgressSeen = false;
      assetTelemetry.started = false;
      assetTelemetry.completed = false;
    },
    hasAssetProgress: () => assetProgressSeen,
    getLastAssetFallback: () => lastAssetFallback,
    clearLastAssetFallback: () => {
      lastAssetFallback = null;
    },
    dispose: () => {
      sw?.removeEventListener('message', onMessage as EventListener);
    },
  };
};
