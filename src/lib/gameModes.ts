/** Multiplayer / social golf game modes. */

export type GameModeId =
  | 'skins'
  | 'stroke'
  | 'match'
  | 'scramble'
  | 'stableford';

export type GameMode = {
  id: GameModeId;
  label: string;
  short: string;
  blurb: string;
  /** Primary board metric */
  primary: 'to_par' | 'skins' | 'points' | 'match';
  defaultFormat: string;
  defaultName: string;
};

export const GAME_MODES: GameMode[] = [
  {
    id: 'skins',
    label: 'Skins',
    short: 'Skins',
    blurb: 'Win the hole alone — carries stack the pot.',
    primary: 'skins',
    defaultFormat: '$10 / hole · net · carryovers',
    defaultName: 'Thursday Skins',
  },
  {
    id: 'stroke',
    label: 'Stroke play',
    short: 'Stroke',
    blurb: 'Lowest total to par wins. Classic medal play.',
    primary: 'to_par',
    defaultFormat: 'Stroke · net',
    defaultName: 'Stroke round',
  },
  {
    id: 'match',
    label: 'Match play',
    short: 'Match',
    blurb: 'Hole-by-hole. Most holes won takes the match.',
    primary: 'match',
    defaultFormat: 'Match play · net',
    defaultName: 'Match play',
  },
  {
    id: 'scramble',
    label: 'Scramble',
    short: 'Scramble',
    blurb: 'Team best ball — one score for the group side.',
    primary: 'to_par',
    defaultFormat: 'Scramble · team',
    defaultName: 'Scramble',
  },
  {
    id: 'stableford',
    label: 'Stableford',
    short: 'Stableford',
    blurb: 'Points per hole. Double bogey and worse = zero.',
    primary: 'points',
    defaultFormat: 'Stableford · net',
    defaultName: 'Stableford',
  },
];

export function getGameMode(id: string | null | undefined): GameMode {
  return GAME_MODES.find((m) => m.id === id) ?? GAME_MODES[0]!;
}

export function isGameModeId(v: string): v is GameModeId {
  return GAME_MODES.some((m) => m.id === v);
}

/** Sort members for the active mode (best first). */
export function sortMembersForMode<
  T extends {
    to_par: number;
    thru: number;
    skins_won: number;
    points?: number;
  },
>(members: T[], modeId: GameModeId): T[] {
  const copy = [...members];
  if (modeId === 'stableford') {
    return copy.sort((a, b) => {
      const pa = a.points ?? 0;
      const pb = b.points ?? 0;
      if (pb !== pa) return pb - pa;
      return b.thru - a.thru;
    });
  }
  if (modeId === 'skins' || modeId === 'match') {
    return copy.sort((a, b) => {
      if (b.skins_won !== a.skins_won) return b.skins_won - a.skins_won;
      if (a.to_par !== b.to_par) return a.to_par - b.to_par;
      return b.thru - a.thru;
    });
  }
  // stroke + scramble
  return copy.sort((a, b) => {
    if (a.to_par !== b.to_par) return a.to_par - b.to_par;
    return b.thru - a.thru;
  });
}

export function primaryStatLabel(modeId: GameModeId): string {
  const m = getGameMode(modeId);
  if (m.primary === 'skins') return 'Skins';
  if (m.primary === 'points') return 'Pts';
  if (m.primary === 'match') return 'Holes';
  return 'Score';
}

export function formatPrimaryStat(
  modeId: GameModeId,
  member: { to_par: number; skins_won: number; points?: number },
  formatToPar: (n: number) => string,
): string {
  const m = getGameMode(modeId);
  if (m.primary === 'skins') return String(member.skins_won);
  if (m.primary === 'points') return String(member.points ?? 0);
  if (m.primary === 'match') {
    const n = member.skins_won;
    if (n === 0) return 'AS';
    return n > 0 ? `${n} up` : `${Math.abs(n)} dn`;
  }
  return formatToPar(member.to_par);
}
