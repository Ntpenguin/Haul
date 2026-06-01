// Move difficulty rating — kept in sync with compute_gig_difficulty()
// (supabase/migrations/042) and the intake form. Tier 1 (Easy) .. 5 (Expert).
//
// The authoritative value is stamped on gigs.difficulty by a DB trigger; this
// mirrors that logic so the app can show the rating in the wizard before a gig
// exists, and label a gig's stored difficulty.

export type DifficultyTier = 1 | 2 | 3 | 4 | 5;

export const DIFFICULTY_LABELS: Record<DifficultyTier, string> = {
  1: 'Easy',
  2: 'Light',
  3: 'Moderate',
  4: 'Heavy',
  5: 'Expert',
};

// Accepts both the app vocab ('2br') and the intake vocab ('2 BR').
const SIZE_POINTS: Record<string, number> = {
  'few-items': 0, 'just a few items': 0,
  studio: 1,
  '1br': 1, '1 br': 1,
  '2br': 2, '2 br': 2,
  '3br+': 3, '3br': 3, '3 br': 3,
  '4br': 4, '4+ br / full house': 4,
};

const HARD_ITEM = /(piano|pool|hot ?tub|hot-tub|safe)/i;

export interface DifficultyInput {
  home_size?: string | null;
  stairs_from?: number | null;
  stairs_to?: number | null;
  heavy_items?: string[] | null;
  distance_miles?: number | null;
  staging?: boolean | null;
  packing_service?: boolean | null;
}

export function difficultyScore(g: DifficultyInput): number {
  let s = SIZE_POINTS[(g.home_size ?? '').toLowerCase()] ?? 1;
  const flights = (g.stairs_from || 0) + (g.stairs_to || 0);
  if (flights > 0) s += 1;
  if (flights >= 4) s += 1;
  const heavy = g.heavy_items ?? [];
  if (heavy.length > 0) {
    s += 1;
    if (heavy.some((i) => HARD_ITEM.test(i))) s += 1;
  }
  if ((g.distance_miles || 0) >= 50) s += 1;
  if (g.staging) s += 1;
  if (g.packing_service) s += 1;
  return s;
}

export function difficultyFor(g: DifficultyInput): DifficultyTier {
  const s = difficultyScore(g);
  if (s <= 1) return 1;
  if (s === 2) return 2;
  if (s <= 4) return 3;
  if (s <= 6) return 4;
  return 5;
}

export function difficultyLabel(tier: number | null | undefined): string {
  return DIFFICULTY_LABELS[(tier as DifficultyTier)] ?? 'Moderate';
}

// Tier color for badges (uses the warm theme family without importing theme here).
export const DIFFICULTY_COLORS: Record<DifficultyTier, { bg: string; fg: string }> = {
  1: { bg: '#E5F0EA', fg: '#2E5C47' }, // green
  2: { bg: '#EAF0E0', fg: '#5A6B2E' },
  3: { bg: '#F5EDE0', fg: '#8B5E2B' }, // amber
  4: { bg: '#F3E2D6', fg: '#A8521F' },
  5: { bg: '#F3D9D9', fg: '#9B2C2C' }, // red
};
