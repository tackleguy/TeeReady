import type { GolfCourseSummary } from './golf';

const KEY = 'teeready-pending-course-v1';

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
