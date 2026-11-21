export const SLUGS: string[];
export const CHALLENGE_SLUGS: string[];
export function selectShard<T>(items: readonly T[], shardIndex: number, shardCount: number): T[];
export function pickSlugs(
  all: readonly string[],
  raw: string | undefined,
): { slugs: string[]; unknown: string[] };
