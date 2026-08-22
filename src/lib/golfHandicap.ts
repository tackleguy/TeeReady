/** Course / playing handicap helpers (0–54 index). */

export function formatHandicap(hcp: number): string {
  if (!Number.isFinite(hcp)) return '—';
  const n = Math.max(0, hcp);
  if (n === 0) return '0';
  return String(n);
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
 * Strokes received on a hole for net scoring (positive index only).
 * Strokes land on the hardest holes (lowest stroke index).
 */
export function strokesReceived(
  courseHcp: number,
  strokeIndex: number,
  holeCount = 18,
): number {
  if (!Number.isFinite(courseHcp) || !Number.isFinite(strokeIndex)) return 0;
  const h = Math.max(0, Math.trunc(courseHcp));
  if (h === 0) return 0;

  let s = 0;
  if (strokeIndex <= h) s = 1;
  if (strokeIndex <= h - holeCount) s = 2;
  if (strokeIndex <= h - holeCount * 2) s = 3;
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
