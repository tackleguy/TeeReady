import { useEffect, useState } from 'react';
import {
  fetchGolfCourses,
  fetchGolfEnsemble,
  fetchGolfHoles,
  fetchGolfNotebook,
  type GolfCourseSummary,
  type GolfEnsemble,
  type GolfHole,
  type GolfNotebook,
} from '../lib/golf';
import type { GolfPlayerProfile } from '../lib/golfProfile';

export function useGolfCourses(
  lat: number | null,
  lon: number | null,
  query = '',
) {
  const [courses, setCourses] = useState<GolfCourseSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (lat == null || lon == null) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const nationalQuery = query.trim().length >= 2 ? query.trim() : undefined;
    const timer = window.setTimeout(
      () => {
        fetchGolfCourses(lat, lon, {
          q: nationalQuery,
          signal: ac.signal,
        })
          .then(setCourses)
          .catch((err) => {
            if (ac.signal.aborted) return;
            setError(
              err instanceof Error ? err.message : 'Failed to load courses',
            );
            setCourses([]);
          })
          .finally(() => {
            if (!ac.signal.aborted) setLoading(false);
          });
      },
      nationalQuery ? 300 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [lat, lon, query, attempt]);

  return {
    courses,
    loading,
    error,
    retry: () => setAttempt((n) => n + 1),
  };
}

export function useGolfHoles(
  lat: number | null,
  lon: number | null,
  course?: {
    bbox?: [number, number, number, number];
    osmType?: string;
    osmId?: number;
    name?: string;
  } | null,
) {
  const [holes, setHoles] = useState<GolfHole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const bboxKey = course?.bbox?.join(',') ?? '';
  const osmType = course?.osmType;
  const osmId = course?.osmId;
  const courseName = course?.name;

  useEffect(() => {
    if (lat == null || lon == null) return;
    const ac = new AbortController();
    setHoles([]);
    setLoading(true);
    setError(null);
    const bounds = bboxKey
      ? (bboxKey.split(',').map(Number) as [number, number, number, number])
      : undefined;
    fetchGolfHoles(lat, lon, {
      bbox: bounds,
      osmType,
      osmId,
      courseName,
      signal: ac.signal,
    })
      .then(setHoles)
      .catch((err) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load holes');
        setHoles([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [lat, lon, bboxKey, osmType, osmId, courseName, attempt]);

  return {
    holes,
    loading,
    error,
    retry: () => setAttempt((n) => n + 1),
  };
}

export function useGolfEnsemble(
  lat: number | null,
  lon: number | null,
  holes: GolfHole[],
  hour: number,
  player: GolfPlayerProfile | null,
) {
  const [data, setData] = useState<GolfEnsemble | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holeKey = holes
    .map(
      (h) =>
        `${h.number}:${h.yards}:${h.bearingDeg}:${h.teeElevationM ?? ''}:${h.greenElevationM ?? ''}`,
    )
    .join('|');
  const playerKey = player
    ? `${player.handicap}:${player.miss}:${player.sevenIronYards}:${player.driverYards}`
    : '';

  useEffect(() => {
    if (lat == null || lon == null) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchGolfEnsemble(
      lat,
      lon,
      holes.map((h) => ({
        number: h.number,
        yards: h.yards,
        bearingDeg: h.bearingDeg,
        par: h.par,
        name: h.name,
        teeElevationM: h.teeElevationM,
        greenElevationM: h.greenElevationM,
      })),
      hour,
      player,
      ac.signal,
    )
      .then(setData)
      .catch((err) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Ensemble failed');
        setData(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
    // holeKey captures hole geometry changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, hour, holeKey, playerKey]);

  return { data, loading, error };
}

export function useGolfNotebook(
  lat: number | null,
  lon: number | null,
  holes: GolfHole[],
  player: GolfPlayerProfile | null,
  enabled: boolean,
) {
  const [data, setData] = useState<GolfNotebook | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holeKey = holes
    .map(
      (h) =>
        `${h.number}:${h.yards}:${h.bearingDeg}:${h.teeElevationM ?? ''}:${h.greenElevationM ?? ''}`,
    )
    .join('|');
  const playerKey = player
    ? `${player.handicap}:${player.miss}:${player.sevenIronYards}:${player.driverYards}`
    : '';

  useEffect(() => {
    if (!enabled || lat == null || lon == null) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchGolfNotebook(
      lat,
      lon,
      holes.map((h) => ({
        number: h.number,
        yards: h.yards,
        bearingDeg: h.bearingDeg,
        par: h.par,
        name: h.name,
        teeElevationM: h.teeElevationM,
        greenElevationM: h.greenElevationM,
      })),
      player,
      ac.signal,
    )
      .then(setData)
      .catch((err) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Notebook failed');
        setData(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lat, lon, holeKey, playerKey]);

  return { data, loading, error };
}
