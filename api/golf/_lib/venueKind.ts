/** Distinguish playable outdoor courses from sim bays and practice ranges. */

export type VenueKind = 'course' | 'sim' | 'range';

const SIM_NAME =
  /\b(topgolf|x-?\s*golf|five\s+iron|golfzon|trackman|swing\s+suite|big\s*shots|golftec|sims\s+golf|golf\s+sim(?:ulator)?s?|sim(?:ulator)?\s+bays?|indoor\s+golf|virtual\s+golf)\b/i;

/** Course names where "sim" is part of a place or person's name, not a simulator. */
const SIM_NAME_FALSE_POSITIVE =
  /\b(simi(?:\s+hills|\s+valley)?|simpson|simsbury|arthur\s+b\.?\s*sim|(?:^|\s)b\.?\s*sim\s+golf)\b/i;

const RANGE_NAME =
  /\b(driving\s+range|practice\s+range|practice\s+facility|golf\s+range|learning\s+center)\b/i;

export function classifyVenueKind(
  name: string,
  tags?: Record<string, string | undefined>,
): VenueKind {
  const golfTag = (tags?.golf ?? '').toLowerCase();
  if (golfTag === 'simulator' || golfTag === 'virtual') return 'sim';
  if (tags?.indoor === 'yes' && (tags?.sport === 'golf' || golfTag.includes('sim'))) {
    return 'sim';
  }

  const n = name.trim();
  if (!n) return 'course';

  if (SIM_NAME.test(n) && !SIM_NAME_FALSE_POSITIVE.test(n)) return 'sim';

  if (RANGE_NAME.test(n) && !/\bcourse\b|\bclub\b|\bcountry\b/i.test(n)) {
    return 'range';
  }

  return 'course';
}

export function isPlayableCourse(kind: VenueKind | undefined): boolean {
  return kind == null || kind === 'course';
}
