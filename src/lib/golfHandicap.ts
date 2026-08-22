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

/** Hardest hole → stroke index 1. */
export function assignStrokeIndexes(
  holes: Array<{ number: number; par?: number; yards: number }>,
): Record<number, number> {
  const ranked = [...holes].sort((a, b) => {
    const da = a.yards + ((a.par ?? 4) === 3 ? 35 : (a.par ?? 4) === 5 ? -15 : 0);
    const db = b.yards + ((b.par ?? 4) === 3 ? 35 : (b.par ?? 4) === 5 ? -15 : 0);
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
