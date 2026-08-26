/** Course / playing handicap helpers (−10 plus through 54 index). */

export const MIN_HANDICAP = -10;
export const MAX_HANDICAP = 54;

export function clampHandicap(hcp: number): number {
  if (!Number.isFinite(hcp)) return 0;
  return Math.max(MIN_HANDICAP, Math.min(MAX_HANDICAP, hcp));
}

/** Negative stored values display as plus handicaps (e.g. −2 → +2). */
export function formatHandicap(hcp: number): string {
  if (!Number.isFinite(hcp)) return '—';
  const n = clampHandicap(hcp);
  if (n < 0) {
    const abs = Math.abs(n);
    return `+${Number.isInteger(abs) ? abs : abs.toFixed(1)}`;
  }
  if (n === 0) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Default improvement target — toward scratch from either side. */
export function defaultTargetHandicap(hcp: number): number {
  const n = clampHandicap(hcp);
  if (n < 0) return clampHandicap(Math.min(0, n + 3));
  return clampHandicap(Math.max(0, n - 3));
}

/** Hardest hole → stroke index 1. Uses yards only when par is unknown. */
export function assignStrokeIndexes(
  holes: Array<{ number: number; par?: number; yards: number }>,
): Record<number, number> {
  const ranked = [...holes].sort((a, b) => {
    const pa =
      typeof a.par === 'number' && Number.isFinite(a.par) ? a.par : null;
    const pb =
      typeof b.par === 'number' && Number.isFinite(b.par) ? b.par : null;
    const da = a.yards + (pa === 3 ? 35 : pa === 5 ? -15 : 0);
    const db = b.yards + (pb === 3 ? 35 : pb === 5 ? -15 : 0);
    if (db !== da) return db - da;
    return a.number - b.number;
  });
  const out: Record<number, number> = {};
  ranked.forEach((h, i) => {
    out[h.number] = i + 1;
  });
  return out;
}

/**
 * Strokes received on a hole for net scoring.
 * Positive = strokes given to the player; negative = strokes added (plus handicap).
 */
export function strokesReceived(
  courseHcp: number,
  strokeIndex: number,
  holeCount = 18,
): number {
  if (!Number.isFinite(courseHcp) || !Number.isFinite(strokeIndex)) return 0;
  const h = Math.trunc(clampHandicap(courseHcp));
  if (h === 0) return 0;

  if (h < 0) {
    const inverted = holeCount + 1 - strokeIndex;
    return -strokesOnHardest(Math.abs(h), inverted, holeCount);
  }

  return strokesOnHardest(h, strokeIndex, holeCount);
}

function strokesOnHardest(
  handicap: number,
  strokeIndex: number,
  holeCount: number,
): number {
  let s = 0;
  if (strokeIndex <= handicap) s = 1;
  if (strokeIndex <= handicap - holeCount) s = 2;
  if (strokeIndex <= handicap - holeCount * 2) s = 3;
  return s;
}

export function netStrokes(gross: number, received: number): number {
  return gross - received;
}

export function toParLabel(diff: number): string {
  if (!Number.isFinite(diff)) return '—';
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

/** Birdie / bogey color language used by 18Birdies-style score UIs. */
export function scoreVsParStyle(diff: number): {
  text: string;
  bg: string;
  ring: string;
} {
  if (diff <= -2) {
    return {
      text: 'text-brand',
      bg: 'bg-brand-soft',
      ring: 'ring-brand/40',
    };
  }
  if (diff === -1) {
    return {
      text: 'text-[var(--cool)]',
      bg: 'bg-[var(--cool-glow)]',
      ring: 'ring-[var(--cool)]/35',
    };
  }
  if (diff === 0) {
    return {
      text: 'text-ink',
      bg: 'bg-canvas',
      ring: 'ring-line',
    };
  }
  if (diff === 1) {
    return {
      text: 'text-warn',
      bg: 'bg-accent-soft',
      ring: 'ring-warn/40',
    };
  }
  return {
    text: 'text-bad',
    bg: 'bg-[color-mix(in_srgb,var(--bad)_14%,transparent)]',
    ring: 'ring-bad/35',
  };
}

/** Birdie, bogey, etc. — Grint / 18Birdies style hole result label. */
export function holeScoreName(strokes: number, par: number): string {
  const d = strokes - par;
  if (d <= -3) return 'Albatross';
  if (d === -2) return 'Eagle';
  if (d === -1) return 'Birdie';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Double';
  if (d === 3) return 'Triple';
  return `+${d}`;
}

export function holeScoreTone(
  strokes: number,
  par: number,
): 'great' | 'good' | 'even' | 'bad' | 'worse' {
  const d = strokes - par;
  if (d <= -2) return 'great';
  if (d === -1) return 'good';
  if (d === 0) return 'even';
  if (d === 1) return 'bad';
  return 'worse';
}
