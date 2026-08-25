/**
 * Hand-curated catalog corrections for OpenGolf bulk rows with bad coords,
 * duplicates, or missing layout metadata. Applied in build-golf-catalog.mjs.
 */

/** Drop inferior duplicate rows (same name/city) — keep the other gid. */
export const EXCLUDE_GOLF_GIDS = new Set([
  'a544677d-111d-4169-a655-4c0b2a2b2f51', // Lake of the Sandhills — coords in Canada
  '8f5f81d9-dc0c-4185-abd8-9fef345d6f88', // TPC Deere Run duplicate
  '0d2c5947-424b-4878-98e7-f6d7c25c22db', // Augusta par-3 duplicate at main-course pin
  '9b0c9a02-fb5a-4f55-9a0b-0c7a664675e6', // Augusta National duplicate / incomplete
]);

/** Override bad OpenGolf coordinates (OSM / address verified). */
export const MANUAL_COORDS_BY_GID = {
  // Augusta National — main course (OSM way 871993734)
  'b5308e1b-8a13-45c1-8216-b1a07bd7bf84': {
    la: 33.50095,
    lo: -82.02285,
    st: 'GA',
  },
  // Augusta National — par-3 / short course (northeast corner of property)
  'c4bce3af-a32c-48de-94b2-8ad0853b99a1': {
    la: 33.50702,
    lo: -82.02171,
    st: 'GA',
  },
  // Bell Gardens par-3 — bulk postal was wrong (92041); OSM way 469310206
  '277b5654-eec6-4848-93e4-6786d0ea52d7': {
    la: 33.95585,
    lo: -118.15451,
    st: 'CA',
  },
};

/** Field patches applied after coords (holes/par/osm/facility/name). */
export const CATALOG_PATCH_BY_GID = {
  'b5308e1b-8a13-45c1-8216-b1a07bd7bf84': {
    o: 871993734,
    h: 18,
    p: 72,
    fac: 'augusta national',
  },
  'c4bce3af-a32c-48de-94b2-8ad0853b99a1': {
    n: 'Augusta National Par 3 Course',
    h: 9,
    p: 27,
    fac: 'augusta national',
  },
  '277b5654-eec6-4848-93e4-6786d0ea52d7': {
    o: 469310206,
    h: 9,
    p: 27,
    a: 'public',
  },
};

/** When two rows share name|city|state, prefer these gids. */
export const PREFER_GOLF_GID = new Set([
  'b5308e1b-8a13-45c1-8216-b1a07bd7bf84',
  'c4bce3af-a32c-48de-94b2-8ad0853b99a1',
  '277b5654-eec6-4848-93e4-6786d0ea52d7',
]);

export function applyCatalogPatch(entry) {
  if (!entry?.g) return entry;
  const patch = CATALOG_PATCH_BY_GID[entry.g];
  if (!patch) return entry;
  return { ...entry, ...patch };
}
