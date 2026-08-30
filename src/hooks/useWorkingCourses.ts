import { useEffect, useMemo, useState } from 'react';
import {
  loadHolePackManifest,
  type HolePackManifestEntry,
} from '../lib/golfHolePacks';
import { mergeWorkingCourses } from '../lib/workingCourses';
import { useGolfCourses } from './useGolf';

/** Nearby + search, restricted to courses with a complete local hole pack. */
export function useWorkingCourses(
  lat: number | null,
  lon: number | null,
  query = '',
) {
  const [entries, setEntries] = useState<HolePackManifestEntry[]>([]);
  const [manifestReady, setManifestReady] = useState(false);
  const { courses, loading, error, retry } = useGolfCourses(lat, lon, '');

  useEffect(() => {
    let cancelled = false;
    loadHolePackManifest().then((manifest) => {
      if (cancelled) return;
      setEntries(manifest?.courses ?? []);
      setManifestReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const workingCourses = useMemo(() => {
    if (!manifestReady || lat == null || lon == null) return [];
    return mergeWorkingCourses(courses, entries, lat, lon, query);
  }, [courses, entries, lat, lon, query, manifestReady]);

  return {
    courses: workingCourses,
    holePackEntries: entries,
    loading: loading || !manifestReady,
    error,
    retry,
    workingCount: entries.length,
  };
}
