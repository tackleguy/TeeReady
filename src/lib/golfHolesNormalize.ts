/** Normalize OSM hole maps to a single standard 9- or 18-hole layout. */

export type HoleLike = {
  number: number;
  yards: number;
  source?: string;
  path?: unknown[];
  tees?: unknown[];
  loop?: string;
  green: { lat: number; lon: number };
  tee: { lat: number; lon: number };
};

function holeQuality(h: HoleLike): number {
  let score = h.yards;
  if (h.source === 'hole-way') score += 500;
  score += (h.tees?.length ?? 1) * 5;
  if (h.path && h.path.length >= 3) score += 50;
  return score;
}

function dedupeByNumber<T extends HoleLike>(holes: T[]): Map<number, T> {
  const byNum = new Map<number, T>();
  for (const h of holes) {
    if (!Number.isFinite(h.number) || h.number < 1 || h.number > 36) continue;
    const prev = byNum.get(h.number);
    if (!prev || holeQuality(h) > holeQuality(prev)) byNum.set(h.number, h);
  }
  return byNum;
}

function countInRange(nums: number[], lo: number, hi: number): number {
  return nums.filter((n) => n >= lo && n <= hi).length;
}

/** Pick 9 vs 18 from geometry + optional catalog hint. */
export function inferStandardHoleTarget(
  holes: HoleLike[],
  expected?: number | null,
): 9 | 18 {
  if (expected === 9 || expected === 18) return expected;
  const nums = [...dedupeByNumber(holes).keys()];
  const front = countInRange(nums, 1, 9);
  const back = countInRange(nums, 10, 18);
  if (front >= 8 && back <= 2 && nums.length <= 11) return 9;
  if (nums.length <= 10 && front >= 7) return 9;
  return 18;
}

/**
 * Collapse duplicate hole numbers and keep only holes 1..9 or 1..18.
 * Drops OSM junk from neighboring courses / practice greens.
 */
export function standardizeHoleSet<T extends HoleLike>(
  holes: T[],
  expected?: number | null,
): T[] {
  if (!holes.length) return [];
  const byNum = dedupeByNumber(holes);
  const target = inferStandardHoleTarget(holes, expected);
  const out: T[] = [];
  for (let n = 1; n <= target; n += 1) {
    const hit = byNum.get(n);
    if (hit) out.push({ ...hit, number: n });
  }
  // Sparse OSM (e.g. only holes 3,7,12): if we kept almost nothing, fall back
  // to the best N unique holes by quality, renumbered 1..N for a playable set.
  if (out.length < Math.min(7, target) && byNum.size >= 5) {
    const ranked = [...byNum.values()].sort(
      (a, b) => holeQuality(b) - holeQuality(a),
    );
    const take = ranked.slice(0, Math.min(target, ranked.length));
    // Prefer original numbers when they form a clean front/back nine.
    const originals = take
      .map((h) => h.number)
      .sort((a, b) => a - b);
    const looksNumbered =
      originals[0] === 1 &&
      originals.length >= 7 &&
      originals.every((n, i) => n === originals[0]! + i || n <= target);
    if (looksNumbered) {
      return take
        .filter((h) => h.number >= 1 && h.number <= target)
        .sort((a, b) => a.number - b.number)
        .map((h) => ({ ...h }));
    }
  }
  return out.sort((a, b) => a.number - b.number);
}

/**
 * Per-layout standardization: each North/South (etc.) loop becomes 9 or 18.
 * Tiny leftover loops (<5) are dropped when a full loop exists.
 */
export function standardizeLayouts<T extends HoleLike>(
  holes: T[],
  expected?: number | null,
): T[] {
  if (!holes.length) return [];
  const byLoop = new Map<string, T[]>();
  for (const h of holes) {
    const key = (h.loop ?? '').trim().toLowerCase() || '';
    const list = byLoop.get(key) ?? [];
    list.push(h);
    byLoop.set(key, list);
  }

  const loopResults: T[][] = [];
  for (const [, group] of byLoop) {
    const next = standardizeHoleSet(group, expected);
    if (next.length) loopResults.push(next);
  }

  if (!loopResults.length) {
    return standardizeHoleSet(holes, expected);
  }

  const full = loopResults.filter((g) => g.length === 9 || g.length === 18);
  const keep = full.length
    ? full
    : loopResults.filter((g) => g.length >= 7);
  return (keep.length ? keep : loopResults).flat();
}

/** Prefer a loop that is already a complete 9 or 18. */
export function bestLoopName<T extends HoleLike>(
  holes: T[],
  courseName?: string,
): string | null {
  const loops = [
    ...new Set(
      holes
        .map((h) => h.loop)
        .filter((l): l is string => Boolean(l && l.trim())),
    ),
  ];
  if (!loops.length) return null;

  const scored = loops.map((loop) => {
    const group = holes.filter(
      (h) => (h.loop ?? '').toLowerCase() === loop.toLowerCase(),
    );
    const std = standardizeHoleSet(group);
    let score = std.length;
    if (std.length === 18) score += 100;
    if (std.length === 9) score += 40;
    const n = (courseName ?? '').toLowerCase();
    if (n && n.includes(loop.toLowerCase())) score += 80;
    return { loop, score, count: std.length };
  });
  scored.sort((a, b) => b.score - a.score || b.count - a.count);
  return scored[0]?.loop ?? null;
}
