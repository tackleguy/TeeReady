import type { GolfCourseSummary } from './golf';

const KEY = 'teeready-pending-course-v1';
const FILTER_KEY = 'teeready-course-filter-v1';

export function stashPendingCourse(course: GolfCourseSummary): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(course));
  } catch {
    // ignore quota / private mode
  }
}

export function takePendingCourse(): GolfCourseSummary | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as GolfCourseSummary;
    if (parsed?.id && parsed?.name && parsed.lat != null && parsed.lon != null) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Prefill Prep search from Today home-course chips. */
export function stashCourseFilter(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    sessionStorage.setItem(FILTER_KEY, trimmed);
  } catch {
    // ignore
  }
}

export function takeCourseFilter(): string | null {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FILTER_KEY);
    const trimmed = raw.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}
