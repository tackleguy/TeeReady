/**
 * Hand-curated catalog corrections for OpenGolf bulk rows with bad coords,
 * duplicates, or missing layout metadata. Applied in build-golf-catalog.mjs.
 */

/** Nine rotation labels ("1 10 At …") — not separate courses. */
export function isNineCombinationArtifact(name) {
  const n = String(name ?? '').trim();
  if (/^\d{1,2}\s+\d{1,2}\s+at\s/i.test(n)) return true;
  if (/^\d{1,2}\s+\d{1,2}\s+club$/i.test(n)) return true;
  return false;
}

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
  // Streamsong Resort — published 18-hole layouts (public scorecards)
  'bf3cfb6e-ec06-4d5c-856f-35df9c045c4e': { h: 18, p: 72 }, // Red
  'fe4adccc-d0ff-4c44-8b63-367a959e47d4': { h: 18, p: 72 }, // Blue
  '9953ab5b-3b5f-4410-b0b4-711eeb265961': { h: 18, p: 73 }, // Black
  // Sand Valley (main course) — 18 / par 72
  '3c268b3e-e99b-4828-aae1-81d4bb5a8814': {
    n: 'Sand Valley Golf Resort Sand Valley Course',
    h: 18,
    p: 72,
  },
  // TPC Sawgrass
  'e643ab84-5a52-4bea-b692-a6c884bb536b': { h: 18, p: 72 }, // Stadium
  '8a0c713e-0aee-40e9-a57f-ac384df48b7b': { h: 18, p: 72 }, // Dye's Valley
  // TPC Harding Park
  '21922834-62d3-4603-b624-b44867b60eb4': { h: 18, p: 72 },
  '61fb03c8-74fc-4fc8-87d0-0491190e2d54': { h: 18, p: 70 }, // Fleming (par-70)
  // Griffith Park Wilson
  '3caa3e09-cf57-4bd2-a379-be262b2a7f49': { h: 18, p: 72 },
  // Bethpage Yellow
  '9b08f119-c36f-4f8e-a350-244aa9b31e89': { h: 18, p: 71 },
  // Spyglass Hill — strip trademark junk from OpenGolf name
  '315fb576-129c-4508-abfa-561d8fbf2904': {
    n: 'Spyglass Hill Golf Course',
  },
  // Oakmont East (municipal near Oakmont CC) — 18 / 72
  'f6cef077-3f4e-4ae7-9906-c525a0cbd72e': { h: 18, p: 72 },
  // Seminole Golf Club (Juno Beach) — 18 / 70
  '800da22d-defb-43b9-81da-704693ecc4a5': { h: 18, p: 70 },
  // Winged Foot West — 18 / 72
  'c56587f3-8e6d-4c85-b67a-49cec1ed428a': { h: 18, p: 72 },
  // Streamsong The Chain — 19-hole / par 72 short-course loop (public)
  'fa73f575-254e-4fbb-a8fa-3d4e8bda0be2': { h: 19, p: 72 },
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
