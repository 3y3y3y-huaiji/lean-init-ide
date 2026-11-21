/**
 * 挑战战绩：记录通关、流派勋章、悬赏层数与最短字符数，只存在 localStorage。
 *
 * 读取与写入都经过 `ChallengeProgressBackend`，以后换 IndexedDB 或账号同步时
 * 只需要替换这一个实现，页面层与判题层都不用动。
 */
import type { ChallengeTier, ProofBadge } from './exercise';

export const CHALLENGE_PROGRESS_KEY = 'lean-init-ide:challenge-progress:v1';

export type ChallengeRecord = {
  solved: boolean;
  badges: ProofBadge[];
  tiers: ChallengeTier[];
  /** 通过时的最短有效字符数；还没通关时为 null。 */
  bestChars: number | null;
};

export type ChallengeProgressData = {
  version: 1;
  challenges: Record<string, ChallengeRecord>;
};

/** 预留的存储接口：默认实现是 localStorage，未来可替换成数据库。 */
export type ChallengeProgressBackend = {
  read: () => string | null;
  write: (value: string) => void;
};

const BADGES: readonly ProofBadge[] = ['automation', 'handcrafted', 'term-mode'];
const TIERS: readonly ChallengeTier[] = ['bronze', 'silver', 'legend'];

const isBadge = (value: unknown): value is ProofBadge =>
  typeof value === 'string' && (BADGES as readonly string[]).includes(value);

const isTier = (value: unknown): value is ChallengeTier =>
  typeof value === 'string' && (TIERS as readonly string[]).includes(value);

export const emptyChallengeRecord = (): ChallengeRecord => ({
  solved: false,
  badges: [],
  tiers: [],
  bestChars: null,
});

const sanitizeList = <T extends string>(
  value: unknown,
  guard: (item: unknown) => item is T,
): T[] => (Array.isArray(value) ? [...new Set(value.filter(guard))] : []);

const sanitizeRecord = (value: unknown): ChallengeRecord => {
  if (!value || typeof value !== 'object') return emptyChallengeRecord();
  const raw = value as Partial<ChallengeRecord>;
  const chars = raw.bestChars;
  return {
    solved: raw.solved === true,
    badges: sanitizeList(raw.badges, isBadge),
    tiers: sanitizeList(raw.tiers, isTier),
    bestChars:
      typeof chars === 'number' && Number.isFinite(chars) && chars >= 0 ? Math.floor(chars) : null,
  };
};

const emptyData = (): ChallengeProgressData => ({ version: 1, challenges: {} });

/** 解析并净化备份 JSON；结构不对时返回 null，避免坏数据覆盖本地战绩。 */
export const parseChallengeProgress = (raw: string): ChallengeProgressData | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const source = (parsed as { challenges?: unknown }).challenges;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const challenges: Record<string, ChallengeRecord> = {};
    for (const [slug, record] of Object.entries(source as Record<string, unknown>)) {
      if (slug.length > 0) challenges[slug] = sanitizeRecord(record);
    }
    return { version: 1, challenges };
  } catch {
    return null;
  }
};

const localBackend: ChallengeProgressBackend = {
  read: () => {
    try {
      return localStorage.getItem(CHALLENGE_PROGRESS_KEY);
    } catch {
      return null;
    }
  },
  write: (value) => {
    try {
      localStorage.setItem(CHALLENGE_PROGRESS_KEY, value);
    } catch {
      // 隐私模式或配额满时静默降级，不影响做题。
    }
  },
};

const union = <T extends string>(left: readonly T[], right: readonly T[]): T[] => [
  ...new Set([...left, ...right]),
];

export class ChallengeProgressStore {
  private readonly backend: ChallengeProgressBackend;

  constructor(backend: ChallengeProgressBackend = localBackend) {
    this.backend = backend;
  }

  private readData(): ChallengeProgressData {
    const raw = this.backend.read();
    if (!raw) return emptyData();
    return parseChallengeProgress(raw) ?? emptyData();
  }

  private writeData(data: ChallengeProgressData): void {
    this.backend.write(JSON.stringify(data));
  }

  /** 完整快照，供列表页统计与备份导出使用。 */
  snapshot(): ChallengeProgressData {
    return this.readData();
  }

  get(slug: string): ChallengeRecord {
    return this.readData().challenges[slug] ?? emptyChallengeRecord();
  }

  isSolved(slug: string): boolean {
    return this.get(slug).solved;
  }

  badges(slug: string): ProofBadge[] {
    return this.get(slug).badges;
  }

  tiers(slug: string): ChallengeTier[] {
    return this.get(slug).tiers;
  }

  bestChars(slug: string): number | null {
    return this.get(slug).bestChars;
  }

  /** 通关一次：勋章与悬赏层数取并集，最短字符数取历史最小值。 */
  recordRun(
    slug: string,
    result: { badges: readonly ProofBadge[]; tiers?: readonly ChallengeTier[]; codeChars: number },
  ): ChallengeRecord {
    const data = this.readData();
    const previous = data.challenges[slug] ?? emptyChallengeRecord();
    const next: ChallengeRecord = {
      solved: true,
      badges: union(previous.badges, result.badges),
      tiers: union(previous.tiers, result.tiers ?? []),
      bestChars:
        previous.bestChars === null
          ? result.codeChars
          : Math.min(previous.bestChars, result.codeChars),
    };
    data.challenges[slug] = next;
    this.writeData(data);
    return next;
  }

  /** 列表页统计：已通关关卡数与三类勋章各自的累计数。 */
  summary(slugs: readonly string[]): {
    solved: number;
    badges: Record<ProofBadge, number>;
  } {
    const data = this.readData();
    const badges: Record<ProofBadge, number> = {
      automation: 0,
      handcrafted: 0,
      'term-mode': 0,
    };
    let solved = 0;
    for (const slug of slugs) {
      const record = data.challenges[slug];
      if (!record) continue;
      if (record.solved) solved += 1;
      for (const badge of record.badges) badges[badge] += 1;
    }
    return { solved, badges };
  }

  /** 用导入的数据整体替换本地战绩。 */
  replace(data: ChallengeProgressData): void {
    this.writeData(data);
  }

  clear(): void {
    this.writeData(emptyData());
  }
}

const defaultStore = new ChallengeProgressStore();

/** 导出为可读 JSON，玩家可以自己保存到文件或粘贴到另一台设备。 */
export const exportChallengeProgressJson = (store: ChallengeProgressStore = defaultStore): string =>
  JSON.stringify(store.snapshot(), null, 2);

/** 导入备份；JSON 结构无效时返回 false 且不覆盖现有战绩。 */
export const importChallengeProgressJson = (
  raw: string,
  store: ChallengeProgressStore = defaultStore,
): boolean => {
  const data = parseChallengeProgress(raw);
  if (!data) return false;
  store.replace(data);
  return true;
};
