import manifestJson from '../config/lean4-wasm64-runtime.json';

export type Wasm64AvailabilityManifest = {
  readonly assets: readonly unknown[];
};

/** 清单里没有资产 = 还没发布；此时切到 wasm64 只会回退 wasm32，绝不伪造数据。 */
export const wasm64Available = (
  manifest: Wasm64AvailabilityManifest = manifestJson as unknown as Wasm64AvailabilityManifest,
): boolean => manifest.assets.length > 0;
