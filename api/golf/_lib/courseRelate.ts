/** Same-club / layout matching so North–South stay together and neighbors do not. */

const NOISE = new Set([
  'golf',
  'course',
  'courses',
  'club',
  'cc',
  'the',
  'and',
  'at',
  'of',
  'links',
  'country',
  'municipal',
  'muni',
  'public',
  'park',
  'recreation',
  'resort',
]);

const LAYOUT = new Set([
  'north',
  'south',
  'east',
  'west',
  'ocean',
  'valley',
  'mountain',
  'lake',
  'river',
  'canyon',
  'upper',
  'lower',
  'old',
  'new',
  'inner',
  'outer',
  'black',
  'red',
  'blue',
  'gold',
  'white',
  'green',
  'yellow',
  'championship',
]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

export function clubStem(name: string): string {
  return tokens(name)
    .filter((t) => !NOISE.has(t) && !LAYOUT.has(t))
    .join(' ');
}

/** Facility name after "At …" (e.g. "North At Torrey Pines" → torrey pines). */
function facilityStem(name: string): string | null {
  const match = name.match(/\bat\s+(.+)$/i);
  if (!match?.[1]) return null;
  const stem = clubStem(match[1]);
  return stem || null;
}

function stemsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = a.split(' ').filter(Boolean);
  const tb = b.split(' ').filter(Boolean);
  // One-token stems must not match via substring ("augusta" ⊆ "augusta national").
  // Multi-token inclusion still allows "torrey pines" ⊆ "torrey pines golf".
  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length <= b.length ? ta : tb;
    if (shorter.length >= 2) return true;
  }
  const shared = ta.filter((t) => tb.includes(t) && t.length >= 4);
  return (
    shared.length >= 2 ||
    (shared.length >= 1 && Math.min(ta.length, tb.length) === 1 && ta.length === tb.length)
  );
}

export function layoutKey(name: string): string | null {
  for (const t of tokens(name)) {
    if (LAYOUT.has(t)) return t;
  }
  return null;
}

export function titleCaseName(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function layoutLabelFromName(name: string): string {
  const key = layoutKey(name);
  if (key) return titleCaseName(key);
  const stem = clubStem(name);
  return stem ? titleCaseName(stem) : titleCaseName(name);
}

function stemTokens(name: string): string[] {
  return clubStem(name).split(' ').filter((t) => t.length >= 4);
}

/**
 * True when two names are different layouts at the same pin (Wilson vs Harding,
 * North vs South). Shared facility words (griffith, torrey, pines) are ignored.
 */
export function namesConflict(a: string, b: string): boolean {
  const la = layoutKey(a);
  const lb = layoutKey(b);
  if (la && lb && la !== lb) return true;
  const da = stemTokens(a);
  const db = stemTokens(b);
  const aOnly = da.filter((t) => !db.includes(t));
  const bOnly = db.filter((t) => !da.includes(t));
  return aOnly.length > 0 && bOnly.length > 0;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Loose name match that still rejects sibling layouts and short substrings. */
export function namesLooselyMatch(courseName: string, packName: string): boolean {
  const a = courseName.toLowerCase().trim();
  const b = packName.toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (namesConflict(courseName, packName)) return false;
  const da = stemTokens(courseName);
  const db = stemTokens(packName);
  if (da.length && db.length && da.every((t) => db.includes(t))) return true;
  if (da.length && db.length && db.every((t) => da.includes(t))) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < 14) {
    const re = new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(shorter)}([^a-z0-9]|$)`,
    );
    return re.test(longer);
  }
  return longer.includes(shorter);
}

export function filterNameMatches<T extends { name: string }>(
  items: T[],
  courseName: string,
): T[] {
  const n = courseName.toLowerCase().trim();
  if (!n) return [];
  const exact = items.filter((c) => c.name.toLowerCase() === n);
  if (exact.length) return exact;
  return items.filter((c) => namesLooselyMatch(n, c.name));
}

/** OSM golf_course polygon that belongs to the selected layout — never a sibling. */
export function pickPolygonForCourse<T extends { id: number; name: string }>(
  polys: T[],
  courseName?: string,
  osmId?: number,
): T | null {
  if (!polys.length) return null;
  if (osmId != null && Number.isFinite(osmId) && osmId > 0) {
    const byId = polys.find((p) => p.id === osmId);
    if (byId) return byId;
  }
  if (!courseName?.trim()) return null;
  const named = filterNameMatches(polys, courseName);
  if (named.length === 1) return named[0]!;
  if (named.length > 1) {
    const want = layoutKey(courseName);
    if (want) {
      const layoutHits = named.filter((p) => layoutKey(p.name) === want);
      if (layoutHits.length === 1) return layoutHits[0]!;
    }
    return named[0]!;
  }
  return null;
}

export function sameClub(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  let prefix = 0;
  for (let i = 0; i < Math.min(ta.length, tb.length); i += 1) {
    if (ta[i] !== tb[i]) break;
    prefix += 1;
  }
  if (prefix >= 3) return true;

  const facilityA = facilityStem(a);
  const facilityB = facilityStem(b);
  if (facilityA && facilityB && stemsMatch(facilityA, facilityB)) return true;

  const sa = clubStem(a);
  const sb = clubStem(b);
  return stemsMatch(sa, sb);
}

/** True when OSM should list / load both (North + South, Black + Red, …). */
export function isClubSibling(a: string, b: string): boolean {
  return sameClub(a, b);
}
