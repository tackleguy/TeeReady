/** Cap OSM hole maps to standard 9- or 18-hole layouts (Edge-safe). */

export type StdHole = {
  number: number;
  yards: number;
  source?: string;
  path?: unknown[];
  tees?: unknown[];
  loop?: string;
};

function quality(h: StdHole): number {
  let score = h.yards;
  if (h.source === 'hole-way') score += 500;
  score += (h.tees?.length ?? 1) * 5;
  if (h.path && h.path.length >= 3) score += 50;
  return score;
}

function dedupeByNumber<T extends StdHole>(holes: T[]): Map<number, T> {
  const byNum = new Map<number, T>();
  for (const h of holes) {
    if (!Number.isFinite(h.number) || h.number < 1 || h.number > 36) continue;
    const prev = byNum.get(h.number);
    if (!prev || quality(h) > quality(prev)) byNum.set(h.number, h);
  }
  return byNum;
}

function targetFor(holes: StdHole[]): 9 | 18 {
  const nums = [...dedupeByNumber(holes).keys()];
  const front = nums.filter((n) => n >= 1 && n <= 9).length;
  const back = nums.filter((n) => n >= 10 && n <= 18).length;
  if (front >= 8 && back <= 2 && nums.length <= 11) return 9;
  if (nums.length <= 10 && front >= 7) return 9;
  return 18;
}

export function standardizeHoleSet<T extends StdHole>(holes: T[]): T[] {
  if (!holes.length) return [];
  const byNum = dedupeByNumber(holes);
  const target = targetFor(holes);
  const out: T[] = [];
  for (let n = 1; n <= target; n += 1) {
    const hit = byNum.get(n);
    if (hit) out.push({ ...hit, number: n });
  }
  return out.sort((a, b) => a.number - b.number);
}

export function standardizeLayouts<T extends StdHole>(holes: T[]): T[] {
  if (!holes.length) return [];
  const byLoop = new Map<string, T[]>();
  for (const h of holes) {
    const key = (h.loop ?? '').trim().toLowerCase() || '';
    const list = byLoop.get(key) ?? [];
    list.push(h);
    byLoop.set(key, list);
  }
  const results: T[][] = [];
  for (const group of byLoop.values()) {
    const next = standardizeHoleSet(group);
    if (next.length) results.push(next);
  }
  if (!results.length) return standardizeHoleSet(holes);
  const full = results.filter((g) => g.length === 9 || g.length === 18);
  const keep = full.length ? full : results.filter((g) => g.length >= 7);
  return (keep.length ? keep : results).flat();
}
