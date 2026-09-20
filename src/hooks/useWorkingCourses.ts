import { useMemo } from 'react';
import { directoryCourses, directoryEntries } from '../lib/courseDirectory';
const retry = () => undefined;

/** Lists use release-versioned metadata; no weather, map, or API request gates paint. */
export function useWorkingCourses(
  lat: number | null,
  lon: number | null,
  query = '',
  limit = 48,
) {
  const courses = useMemo(() =>
    lat == null || lon == null ? [] : directoryCourses(lat, lon, query, limit),
  [lat, lon, query, limit]);
  return {
    courses,
    holePackEntries: directoryEntries,
    loading: false,
    error: null as string | null,
    retry,
    workingCount: directoryEntries.length,
  };
}
