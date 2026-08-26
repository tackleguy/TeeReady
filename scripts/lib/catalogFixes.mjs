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
  // Ocean / null-island bulk pins with no recoverable U.S. address
  'f1729930-65c9-4945-b4e9-776cb35fdf4f', // Rock River Golf Course — Gulf of Mexico
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
  // Broken Pine — geocode cache poisoned to Alberta; restore Branch, LA address pin
  '02e10dd6-c873-4f7e-97f6-c6d06545f1a5': {
    la: 30.35677,
    lo: -92.2526,
    st: 'LA',
  },
  // Prairie Ridge (Tribune, KS) — geocode jumped to Rapid City, SD
  'b0e8051a-281e-4675-848d-9899c0b0a2df': {
    la: 38.47911,
    lo: -101.75589,
    st: 'KS',
  },
  // Pheasand Hills (typo) — bulk pin in Atlantic; course is Hammond, WI
  '2b8958ce-ff53-4e41-ad28-ef45502b0a96': {
    la: 45.01388,
    lo: -92.44792,
    st: 'WI',
  },
  // Jo Daddys (par-3) — geocode jumped north of Malabar, FL
  'eefde076-5a0d-4518-a3d6-48ebe6c091e7': {
    la: 27.95803,
    lo: -80.55856,
    st: 'FL',
  },
  // Heron at Pelican Preserve — geocode jumped to wrong Villages pin
  '3779c011-b356-419f-af54-845f6d21beef': {
    la: 28.90104,
    lo: -81.98649,
    st: 'FL',
  },
  // Cajun Pines — geocode jumped within LA away from Branch address
  '64898931-0c75-4c19-8d4e-ad9d5bd43102': {
    la: 30.35677,
    lo: -92.2526,
    st: 'LA',
  },
  // Cedar Creek GC (Buena Vista, GA) — geocode jumped ~120 mi
  'ec6368b1-3d91-4625-9e67-2f0868805190': {
    la: 32.39149,
    lo: -84.38855,
    st: 'GA',
  },
  // Prairie Winds (Pretty Prairie, KS) — modest geocode drift
  '07e9e800-fc24-4e55-953b-c0e0a0b20ff2': {
    la: 37.78004,
    lo: -98.02894,
    st: 'KS',
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
  '2b8958ce-ff53-4e41-ad28-ef45502b0a96': {
    n: 'Pheasant Hills Golf Course',
    ci: 'Hammond',
    h: 9,
    p: 36,
  },
};

/** When two rows share name|city|state, prefer these gids. */
export const PREFER_GOLF_GID = new Set([
  'b5308e1b-8a13-45c1-8216-b1a07bd7bf84',
  'c4bce3af-a32c-48de-94b2-8ad0853b99a1',
  '277b5654-eec6-4848-93e4-6786d0ea52d7',
  '02e10dd6-c873-4f7e-97f6-c6d06545f1a5',
  'b0e8051a-281e-4675-848d-9899c0b0a2df',
  '2b8958ce-ff53-4e41-ad28-ef45502b0a96',
]);

export function applyCatalogPatch(entry) {
  if (!entry?.g) return entry;
  const patch = CATALOG_PATCH_BY_GID[entry.g];
  if (!patch) return entry;
  return { ...entry, ...patch };
}
