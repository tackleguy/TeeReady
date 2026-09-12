/** Basic forecast + radar centered on a playable course. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudSun, ExternalLink, Flag } from 'lucide-react';
import { CourseSearchSelect } from '../components/golf/CourseSearchSelect';
import { WeatherRadarMap } from '../components/weather/WeatherRadarMap';
import type { GolfCourseSummary } from '../lib/golf';
import { weatherAppHref } from '../lib/golfApp';
import {
  fetchPlayHours,
  scoreColor,
  toDisplayHours,
  type Hour,
} from '../lib/playability';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setHours(toDisplayHours(res.hours));
          setAttribution(res.attribution);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (signal?.aborted) return;
          setHours(null);
          setAttribution(null);
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

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <header className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-ink">Weather</h1>
          <p className="mt-2 max-w-lg text-body text-muted">
            Radar and hourly outlook at the course you&apos;re playing.
          </p>
        </div>
        <a
          href={weatherAppHref()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink hover:border-brand/40 hover:text-brand"
        >
          <CloudSun className="h-3.5 w-3.5" aria-hidden />
          Full WeatherStop
          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
        </a>
      </header>

      <section className="animate-fade-up [animation-delay:20ms]">
        <h2 className="text-title text-ink">Course</h2>
        <p className="mt-1 text-detail text-muted">
          Uses your live round, Prep pick, home course, or nearest playable
          layout.
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
              Now-ish · {nowish.temp > 0 ? `${nowish.temp}°F · ` : ''}
              {nowish.wind}
            </p>
          ) : null}
        </div>
        <p className="mb-2 text-detail text-muted">
          Past loop plus ~60 minutes of forecast precipitation motion.
        </p>
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
