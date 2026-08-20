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
  const sa = clubStem(a);
  const sb = clubStem(b);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  if (sa.includes(sb) || sb.includes(sa)) return true;
  const ta = sa.split(' ');
  const tb = sb.split(' ');
  const shared = ta.filter((t) => tb.includes(t) && t.length >= 4);
  return (
    shared.length >= 2 ||
    (shared.length >= 1 && Math.min(ta.length, tb.length) === 1)
  );
}

/** True when OSM should list / load both (North + South, Black + Red, …). */
export function isClubSibling(a: string, b: string): boolean {
  return sameClub(a, b);
}
