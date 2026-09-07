/** Basic forecast + radar — golf hours API + RainViewer map. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudSun, ExternalLink } from 'lucide-react';
import { WeatherRadarMap } from '../components/weather/WeatherRadarMap';
import {
  fetchPlayHours,
  scoreColor,
  toDisplayHours,
  type Hour,
} from '../lib/playability';
import { weatherAppHref } from '../lib/golfApp';
import { defaultSearchLoc } from '../lib/searchLoc';

export function WeatherView() {
  const [loc, setLoc] = useState(() => defaultSearchLoc());
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setLoc(defaultSearchLoc());
    window.addEventListener('teeready-location-changed', sync);
    window.addEventListener('teeready-profile-changed', sync);
    return () => {
      window.removeEventListener('teeready-location-changed', sync);
      window.removeEventListener('teeready-profile-changed', sync);
    };
  }, []);

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
    const ac = new AbortController();
    loadHours(ac.signal);
    return () => ac.abort();
  }, [loadHours]);

  const nowish = useMemo(() => hours?.[0] ?? null, [hours]);

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <header className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-ink">Weather</h1>
          <p className="mt-2 max-w-lg text-body text-muted">
            Hourly outlook and live radar near {loc.name}.
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
        <WeatherRadarMap lat={loc.lat} lon={loc.lon} />
      </section>

      <section className="animate-fade-up [animation-delay:80ms]">
        <h2 className="text-title text-ink">Hourly forecast</h2>
        <p className="mt-1 text-detail text-muted">
          Playability-weighted hours from TeeReady weather sources.
        </p>

        {loading ? (
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
