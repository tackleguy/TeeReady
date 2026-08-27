/**
 * Venues — courses AND driving ranges.
 *
 * TeeReady currently has no concept of a driving range, which is where the
 * launch monitor and the club database actually get used. A range is not a
 * golf course: it has no holes, no par, no scorecard. It has a hitting line and
 * a set of distance markers. Modelling it as a course with 0 holes would poison
 * the course catalog, so it gets its own type here and shares only the geo bits.
 *
 * The distance markers matter for the launch monitor: a marker at a known
 * distance is a real-world scale reference in the frame, which is worth more
 * than any amount of software calibration.
 */

export type VenueKind = 'course' | 'range' | 'practice-facility';

export type GeoPoint = { lat: number; lon: number };

export type Venue = {
  slug: string;
  name: string;
  kind: VenueKind;
  center: GeoPoint;
  /** "Scottsdale, AZ" */
  region: string;
  /** Where the coordinates came from. Never guess this. */
  source: 'osm' | 'curated' | 'user-added';
};

export type RangeTarget = {
  /** Distance from the hitting line, yards. */
  yards: number;
  label: string;
  /** Optional pin location, if the range has real greens. */
  point?: GeoPoint;
};

export type RangeVenue = Venue & {
  kind: 'range' | 'practice-facility';
  /** Where the golfer stands. Anchor for every measurement. */
  hittingLine: GeoPoint;
  /** Compass bearing the golfer faces, degrees from north. */
  bearingDeg: number;
  targets: RangeTarget[];
  /** Grass, mats, or both — affects strike and therefore carry. */
  surface: 'grass' | 'mats' | 'both' | 'unknown';
  covered: boolean;
  /** Some ranges use limited-flight balls. Carry numbers there are NOT real. */
  limitedFlightBalls: boolean | 'unknown';
};

export type CourseVenue = Venue & {
  kind: 'course';
  holes: 9 | 18;
  par: number;
  type: 'regulation' | 'executive' | 'par3';
};

/**
 * A range using limited-flight balls will produce carry numbers 10–20% short of
 * reality. Feeding those into the club database silently would teach the caddie
 * that the golfer hits it shorter than they do — and then club them up into
 * trouble on the course. Flag it, and let the UI mark the session.
 */
export function rangeAffectsDistanceTruth(v: RangeVenue): boolean {
  return v.limitedFlightBalls === true || v.limitedFlightBalls === 'unknown';
}

// ── Seed data ───────────────────────────────────────────────────────────────
//
// Coordinates below are taken from the CURATED block already in
// scripts/build-green-meshes.mjs — they are your data, already verified in this
// repo. I have NOT invented coordinates for any facility.
//
// Range entries are TEMPLATES with placeholder coordinates. Fill them from the
// map before use — a range at the wrong coordinates is worse than no range,
// because every measurement anchored to it inherits the error.

export const SEED_COURSES: CourseVenue[] = [
  {
    slug: 'torrey-pines-south',
    name: 'Torrey Pines — South',
    kind: 'course',
    center: { lat: 32.90246, lon: -117.24627 },
    region: 'La Jolla, CA',
    source: 'curated',
    holes: 18,
    par: 72,
    type: 'regulation',
  },
  {
    slug: 'torrey-pines-north',
    name: 'Torrey Pines — North',
    kind: 'course',
    center: { lat: 32.90467, lon: -117.24462 },
    region: 'La Jolla, CA',
    source: 'curated',
    holes: 18,
    par: 72,
    type: 'regulation',
  },
  {
    slug: 'pebble-beach-golf-links',
    name: 'Pebble Beach Golf Links',
    kind: 'course',
    center: { lat: 36.56071, lon: -121.9296 },
    region: 'Pebble Beach, CA',
    source: 'curated',
    holes: 18,
    par: 72,
    type: 'regulation',
  },
];

/** TEMPLATE — replace coordinates and targets before shipping. */
export const RANGE_TEMPLATE: RangeVenue = {
  slug: 'my-home-range',
  name: 'My Home Range',
  kind: 'range',
  center: { lat: 0, lon: 0 },        // ← fill from the map
  hittingLine: { lat: 0, lon: 0 },   // ← stand on the tee line, read your GPS
  bearingDeg: 0,                     // ← compass bearing you face
  region: 'Scottsdale, AZ',
  source: 'user-added',
  surface: 'both',
  covered: false,
  limitedFlightBalls: 'unknown',
  targets: [
    { yards: 50, label: '50' },
    { yards: 100, label: '100' },
    { yards: 150, label: '150' },
    { yards: 200, label: '200' },
    { yards: 250, label: '250' },
  ],
};

export function isRangeVenue(v: Venue): v is RangeVenue {
  return v.kind === 'range' || v.kind === 'practice-facility';
}

/** Nearest target marker to a measured carry — the "you flew the 150" read. */
export function nearestTarget(v: RangeVenue, carryYd: number): RangeTarget | null {
  if (!v.targets.length) return null;
  return v.targets.reduce((a, b) =>
    Math.abs(b.yards - carryYd) < Math.abs(a.yards - carryYd) ? b : a,
  );
}
