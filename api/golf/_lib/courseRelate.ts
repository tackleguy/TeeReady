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
  if (a.includes(b) || b.includes(a)) return true;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const shared = ta.filter((t) => tb.includes(t) && t.length >= 4);
  return (
    shared.length >= 2 ||
    (shared.length >= 1 && Math.min(ta.length, tb.length) === 1)
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
