/** Weather home — course radar + playability-weighted hourly forecast. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag } from 'lucide-react';
import { CourseSearchSelect } from '../components/golf/CourseSearchSelect';
import { WeatherRadarMap } from '../components/weather/WeatherRadarMap';
import type { GolfCourseSummary } from '../lib/golf';
import {
  bestWindowLabel,
  deriveConditionsHint,
  fetchPlayHours,
  playVerdict,
  playVerdictLabel,
  scoreColor,
  toDisplayHours,
  type Hour,
} from '../lib/playability';
import { hasStoredRound } from '../lib/golfTracker';
import { defaultSearchLoc } from '../lib/searchLoc';
import {
  resolveWeatherCourse,
  stashWeatherCourse,
} from '../lib/weatherCourse';

export function WeatherView() {
  const [course, setCourse] = useState<GolfCourseSummary | null>(null);
  const [resolving, setResolving] = useState(true);
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [conditionsHint, setConditionsHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveRound, setLiveRound] = useState(() => hasStoredRound());

  const loc = useMemo(() => {
    if (course) {
      return { name: course.name, lat: course.lat, lon: course.lon };
    }
    return defaultSearchLoc();
  }, [course]);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    resolveWeatherCourse().then((hit) => {
      if (cancelled) return;
      if (hit) {
        setCourse(hit);
        stashWeatherCourse(hit);
      }
      setResolving(false);
    });
    const refresh = () => {
      resolveWeatherCourse().then((hit) => {
        if (cancelled || !hit) return;
        setCourse(hit);
        stashWeatherCourse(hit);
      });
      setLiveRound(hasStoredRound());
    };
    window.addEventListener('teeready-round-changed', refresh);
    window.addEventListener('teeready-profile-changed', refresh);
    window.addEventListener('teeready-location-changed', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('teeready-round-changed', refresh);
      window.removeEventListener('teeready-profile-changed', refresh);
      window.removeEventListener('teeready-location-changed', refresh);
    };
  }, []);

  const pickCourse = (next: GolfCourseSummary | null) => {
    setCourse(next);
    if (next) stashWeatherCourse(next);
  };

  const loadHours = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      fetchPlayHours(loc.lat, loc.lon, signal)
        .then((res) => {
          if (signal?.aborted) return;
          const display = toDisplayHours(res.hours);
          setHours(display);
          setAttribution(res.attribution);
          setConditionsHint(
            res.conditionsHint?.trim() || deriveConditionsHint(display) || null,
          );
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (signal?.aborted) return;
          setHours(null);
          setAttribution(null);
          setConditionsHint(null);
          setError(
            err instanceof Error ? err.message : 'Could not load forecast',
          );
          setLoading(false);
        });
    },
    [loc.lat, loc.lon],
  );

  useEffect(() => {
    if (resolving) return;
    const ac = new AbortController();
    loadHours(ac.signal);
    return () => ac.abort();
  }, [loadHours, resolving]);

  const nowish = useMemo(() => hours?.[0] ?? null, [hours]);
  const bestHour = useMemo(() => {
    if (!hours?.length) return null;
    return hours.reduce((a, b) => (b.score > a.score ? b : a));
  }, [hours]);
  const windowLabel = useMemo(
    () => (hours?.length ? bestWindowLabel(hours) : ''),
    [hours],
  );
  const playHref = liveRound ? '/rounds/gps' : '/courses';

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <header className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-ink">Weather</h1>
          <p className="mt-2 max-w-lg text-body text-muted">
            {bestHour
              ? `${playVerdictLabel(playVerdict(bestHour.score))}${
                  windowLabel ? ` · ${windowLabel}` : ''
                } at ${course?.name ?? loc.name}.`
              : 'Radar and hourly outlook at the course you’re playing.'}
          </p>
          {conditionsHint ? (
            <p className="mt-1 max-w-lg text-detail text-muted">
              {conditionsHint}
            </p>
          ) : null}
        </div>
        <Link
          to={playHref}
          className="btn-primary inline-flex min-h-[44px] items-center justify-center px-4 text-[14px] font-bold"
          data-tutorial="start-round"
        >
          {liveRound ? 'Continue round' : 'Start round'}
        </Link>
      </header>

      <section className="animate-fade-up [animation-delay:20ms]">
        <h2 className="text-title text-ink">Course</h2>
        <p className="mt-1 text-detail text-muted">
          Pins radar and forecast to your round, Prep pick, or home course.
        </p>
        <div className="mt-3 max-w-xl">
          <CourseSearchSelect
            value={course}
            onChange={pickCourse}
            initialQuery={course?.name ?? ''}
          />
        </div>
        {course ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-detail text-muted">
            <Flag className="h-3.5 w-3.5 text-brand" aria-hidden />
            <span className="font-medium text-ink">{course.name}</span>
            {course.distanceMi != null ? (
              <span>· {course.distanceMi} mi away</span>
            ) : null}
            <Link
              to="/rounds/prep"
              className="font-semibold text-brand hover:underline"
            >
              Open Prep
            </Link>
          </p>
        ) : resolving ? (
          <p className="mt-2 text-detail text-muted">Finding a course…</p>
        ) : (
          <p className="mt-2 text-detail text-muted">
            Search for a playable course to pin the radar.
          </p>
        )}
      </section>

      <section className="animate-fade-up [animation-delay:40ms]">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-title text-ink">Radar</h2>
          {nowish ? (
            <p className="text-detail text-muted">
              Now · {nowish.temp > 0 ? `${nowish.temp}°F · ` : ''}
              {nowish.wind}
            </p>
          ) : null}
        </div>
        <WeatherRadarMap
          lat={loc.lat}
          lon={loc.lon}
          courseName={course?.name ?? loc.name}
        />
      </section>

      <section className="animate-fade-up [animation-delay:80ms]">
        <h2 className="text-title text-ink">Hourly forecast</h2>
        <p className="mt-1 text-detail text-muted">
          Playability-weighted hours at {course?.name ?? loc.name}.
        </p>

        {loading || resolving ? (
          <p className="mt-4 text-body text-muted">Loading hours…</p>
        ) : error ? (
          <div className="surface-card mt-4 p-4">
            <p className="text-body text-ink">{error}</p>
            <button
              type="button"
              className="btn-primary mt-3"
              onClick={() => loadHours()}
            >
              Retry
            </button>
          </div>
        ) : hours?.length ? (
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {hours.map((h) => (
              <li
                key={h.time}
                className="surface-card min-w-[7.25rem] shrink-0 px-3 py-3"
              >
                <p className="text-micro font-semibold uppercase tracking-wide text-muted">
                  {h.short}
                </p>
                <p
                  className="mt-1 text-[1.35rem] font-semibold tabular-nums"
                  style={{ color: scoreColor(h.score) }}
                >
                  {h.score}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-ink">
                  {h.temp > 0 ? `${h.temp}°` : '—'}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  {h.wind}
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">
                  {h.summary}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-body text-muted">No hours for this location.</p>
        )}

        {attribution ? (
          <p className="mt-3 text-micro text-muted">{attribution}</p>
        ) : null}
      </section>
    </div>
  );
}
