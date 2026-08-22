/** Client-side venue kind — mirrors api/golf/_lib/venueKind.ts */

export type VenueKind = 'course' | 'sim' | 'range';

const SIM_NAME =
  /\b(topgolf|x-?\s*golf|five\s+iron|golfzon|trackman|swing\s+suite|big\s*shots|golftec|sims\s+golf|golf\s+sim(?:ulator)?s?|sim(?:ulator)?\s+bays?|indoor\s+golf|virtual\s+golf)\b/i;

const SIM_NAME_FALSE_POSITIVE =
  /\b(simi(?:\s+hills|\s+valley)?|simpson|simsbury|arthur\s+b\.?\s*sim|(?:^|\s)b\.?\s*sim\s+golf)\b/i;

const RANGE_NAME =
  /\b(driving\s+range|practice\s+range|practice\s+facility|golf\s+range|learning\s+center)\b/i;

export function venueKindFromName(name: string): VenueKind {
  if (SIM_NAME.test(name) && !SIM_NAME_FALSE_POSITIVE.test(name)) return 'sim';
  if (RANGE_NAME.test(name) && !/\bcourse\b|\bclub\b|\bcountry\b/i.test(name)) {
    return 'range';
  }
  return 'course';
}

export function isPlayableCourse(kind: VenueKind | undefined): boolean {
  return kind == null || kind === 'course';
}

export function venueKindLabel(kind: VenueKind | undefined): string | null {
  if (kind === 'sim') return 'Sim bay';
  if (kind === 'range') return 'Range';
  return null;
}
