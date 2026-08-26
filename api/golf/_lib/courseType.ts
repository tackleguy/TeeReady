/** Course layout class from hole count + total par. */

export type CourseType = 'regulation' | 'executive' | 'par3' | 'unknown';

/** TeeReady only supports standard 9- and 18-hole layouts. */
export function isStandardHoleCount(holes?: number | null): boolean {
  return holes === 9 || holes === 18;
}

export function classifyCourseType(holes?: number, par?: number): CourseType {
  if (!isStandardHoleCount(holes)) return 'unknown';
  if (par == null) return 'unknown';

  if (holes === 18) {
    if (par >= 69 && par <= 74) return 'regulation';
    if (par >= 60 && par <= 68) return 'executive';
    if (par <= 59) return 'par3';
    return 'unknown';
  }

  if (par >= 34 && par <= 37) return 'regulation';
  if (par >= 30 && par <= 33) return 'executive';
  if (par <= 29) return 'par3';
  return 'unknown';
}

export function isShortCourseType(type?: CourseType): boolean {
  return type === 'par3' || type === 'executive';
}

/** Max sensible tee-shot planning distance for short layouts. */
export function maxTeeShotYards(type: CourseType | undefined, driverYards: number): number {
  if (type === 'par3') return Math.min(driverYards, 200);
  if (type === 'executive') return Math.min(driverYards, 260);
  return driverYards;
}
