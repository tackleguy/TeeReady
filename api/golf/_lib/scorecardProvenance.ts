/** Where hole pars / yardages came from — never present invent as official. */

export type ScorecardProvenance =
  | 'official'
  | 'imported-par'
  | 'geometric'
  | 'template';

export function scorecardProvenanceLabel(
  provenance: ScorecardProvenance,
): string {
  switch (provenance) {
    case 'official':
      return 'Official scorecard';
    case 'imported-par':
      return 'Map yardages · listed pars';
    case 'geometric':
      return 'Map-measured yardages';
    case 'template':
      return 'Estimated scorecard';
  }
}

/** Plain-language note for UI — shown wherever pars/yardages appear. */
export function scorecardProvenanceNote(
  provenance: ScorecardProvenance,
): string {
  switch (provenance) {
    case 'official':
      return 'Yardages from this course’s published scorecard.';
    case 'imported-par':
      return 'Pars from course data; yardages measured from the map — not an official scorecard.';
    case 'geometric':
      return 'Yardages measured from satellite map — not an official scorecard.';
    case 'template':
      return 'Estimated pars and yardages — not this course’s official scorecard.';
  }
}

export function holeHasCardYardage(hole: {
  back?: number;
  mid?: number;
  front?: number;
}): boolean {
  return (hole.back ?? 0) > 0 || (hole.mid ?? 0) > 0 || (hole.front ?? 0) > 0;
}
