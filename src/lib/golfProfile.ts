export type MissBias = 'left' | 'right' | 'both' | 'straight';

export interface GolfPlayerProfile {
  commonCourses: string[];
  handicap: number;
  miss: MissBias;
  sevenIronYards: number;
  driverYards: number;
}

export interface BagClub {
  key: string;
  label: string;
  /** Total average — where the ball typically finishes (carry + roll). */
  yards: number;
  carryYards?: number;
}

const STORAGE_KEY = 'golf-player-v1';

/** Typical roll on top of air carry, so planning uses finish distance. */
const ROLL_PCT: Record<string, number> = {
  dr: 0.1,
  '3w': 0.08,
  '5w': 0.06,
  '4i': 0.05,
  '5i': 0.05,
  '6i': 0.04,
  '7i': 0.04,
  '8i': 0.025,
  '9i': 0.025,
  pw: 0.015,
  gw: 0.01,
  sw: 0.01,
};

export function totalAvgYards(carryYards: number, clubKey: string): number {
  const pct = ROLL_PCT[clubKey] ?? 0.03;
  return Math.max(40, Math.round(carryYards * (1 + pct)));
}

export const DEFAULT_PROFILE: GolfPlayerProfile = {
  commonCourses: [],
  handicap: 18,
  miss: 'right',
  sevenIronYards: 150,
  driverYards: 225,
};

export function bagFromStocks(
  driverYards: number,
  sevenIronYards: number,
): BagClub[] {
  const ironGap = Math.max(8, Math.min(14, sevenIronYards * 0.075));
  const clubs: BagClub[] = [
    { key: 'dr', label: 'Driver', yards: driverYards },
    { key: '3w', label: '3W', yards: Math.round(driverYards * 0.9) },
    { key: '5w', label: '5W', yards: Math.round(driverYards * 0.82) },
    { key: '4i', label: '4i', yards: Math.round(sevenIronYards + ironGap * 3) },
    { key: '5i', label: '5i', yards: Math.round(sevenIronYards + ironGap * 2) },
    { key: '6i', label: '6i', yards: Math.round(sevenIronYards + ironGap) },
    { key: '7i', label: '7i', yards: sevenIronYards },
    { key: '8i', label: '8i', yards: Math.round(sevenIronYards - ironGap) },
    { key: '9i', label: '9i', yards: Math.round(sevenIronYards - ironGap * 2) },
    { key: 'pw', label: 'PW', yards: Math.round(sevenIronYards - ironGap * 3) },
    { key: 'gw', label: 'GW', yards: Math.round(sevenIronYards - ironGap * 4) },
    { key: 'sw', label: 'SW', yards: Math.max(45, Math.round(sevenIronYards - ironGap * 5)) },
  ];
  return clubs
    .filter((club, index, all) =>
      index === 0 || club.yards < all[index - 1]!.yards - 2,
    )
    .map((club) => {
      const carry = Math.max(40, Math.round(club.yards));
      return {
        ...club,
        carryYards: carry,
        yards: totalAvgYards(carry, club.key),
      };
    });
}

export function missLabel(miss: MissBias): string {
  if (miss === 'left') return 'Left miss';
  if (miss === 'right') return 'Right miss';
  if (miss === 'both') return 'Two-way miss';
  return 'Straight pattern';
}

export function loadGolfProfile(): GolfPlayerProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GolfPlayerProfile>;
    if (
      !Number.isFinite(parsed.handicap) ||
      !Number.isFinite(parsed.sevenIronYards) ||
      !Number.isFinite(parsed.driverYards)
    ) {
      return null;
    }
    return {
      commonCourses: Array.isArray(parsed.commonCourses)
        ? parsed.commonCourses.filter((x): x is string => typeof x === 'string')
        : [],
      handicap: Number(parsed.handicap),
      miss:
        parsed.miss === 'left' ||
        parsed.miss === 'right' ||
        parsed.miss === 'both' ||
        parsed.miss === 'straight'
          ? parsed.miss
          : DEFAULT_PROFILE.miss,
      sevenIronYards: Number(parsed.sevenIronYards),
      driverYards: Number(parsed.driverYards),
    };
  } catch {
    return null;
  }
}

export function saveGolfProfile(
  profile: GolfPlayerProfile,
): GolfPlayerProfile {
  const safe: GolfPlayerProfile = {
    commonCourses: profile.commonCourses.slice(0, 8),
    handicap: Math.max(0, Math.min(54, profile.handicap)),
    miss: profile.miss,
    sevenIronYards: Math.max(80, Math.min(220, profile.sevenIronYards)),
    driverYards: Math.max(140, Math.min(360, profile.driverYards)),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Profile still works for this session when storage is unavailable.
  }
  return safe;
}
