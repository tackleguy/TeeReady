/** MapLibre radar overlay: past tiles + forecast (provider nowcast or advection). */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Flag, LocateFixed, Pause, Play, RefreshCw } from 'lucide-react';
import {
  generateAdvectionNowcast,
  revokeNowcastFrames,
} from '../../lib/radarNowcast';
import {
  fetchRainViewerMaps,
  formatRadarTime,
  lastPastFrameIndex,
  radarPhaseLabel,
  radarTileUrl,
  type RadarFrame,
  type RadarMaps,
} from '../../lib/rainviewer';

const BASE_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const SRC_ID = 'teeready-radar';
const LYR_ID = 'teeready-radar-lyr';
const IMG_SRC_ID = 'teeready-radar-img';
const IMG_LYR_ID = 'teeready-radar-img-lyr';
const COURSE_ZOOM = 8.4;

type Props = {
  lat: number;
  lon: number;
  courseName?: string | null;
  className?: string;
};

export function WeatherRadarMap({
  lat,
  lon,
  courseName = null,
  className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const mapsRef = useRef<RadarMaps | null>(null);
  const extrapolatingRef = useRef(false);
  const [maps, setMaps] = useState<RadarMaps | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [extrapolating, setExtrapolating] = useState(false);

  mapsRef.current = maps;

  const clearRadarLayers = (map: maplibregl.Map) => {
    if (map.getLayer(LYR_ID)) map.removeLayer(LYR_ID);
    if (map.getSource(SRC_ID)) map.removeSource(SRC_ID);
    if (map.getLayer(IMG_LYR_ID)) map.removeLayer(IMG_LYR_ID);
    if (map.getSource(IMG_SRC_ID)) map.removeSource(IMG_SRC_ID);
  };

  const applyFrame = (
    map: maplibregl.Map,
    data: RadarMaps,
    frame: RadarFrame,
  ) => {
    clearRadarLayers(map);
    const attribution = `Radar © <a href="${data.providerUrl}">${data.providerName}</a>`;

    if (frame.imageUrl && frame.coordinates) {
      map.addSource(IMG_SRC_ID, {
        type: 'image',
        url: frame.imageUrl,
        coordinates: frame.coordinates,
      });
      map.addLayer({
        id: IMG_LYR_ID,
        type: 'raster',
        source: IMG_SRC_ID,
        paint: { 'raster-opacity': 0.78 },
      });
      return;
    }

    map.addSource(SRC_ID, {
      type: 'raster',
      tiles: [radarTileUrl(data.host, frame)],
      tileSize: 256,
      maxzoom: 7,
      attribution,
    });
    map.addLayer({
      id: LYR_ID,
      type: 'raster',
      source: SRC_ID,
      paint: { 'raster-opacity': 0.78 },
    });
  };

  const flyToCourse = (duration = 700) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [lon, lat],
      zoom: Math.max(map.getZoom(), COURSE_ZOOM),
      duration,
    });
  };

  const loadMaps = (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const prev = mapsRef.current;
    if (prev) {
      revokeNowcastFrames(prev.frames.filter((f) => f.kind === 'nowcast'));
    }
    extrapolatingRef.current = false;
    setExtrapolating(false);
    return fetchRainViewerMaps(signal)
      .then((data) => {
        if (signal?.aborted) return;
        setMaps(data);
        setFrameIdx(lastPastFrameIndex(data.frames));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Radar unavailable');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [lon, lat],
      zoom: COURSE_ZOOM,
      maxZoom: 10,
      attributionControl: { compact: true },
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );
    mapRef.current = map;
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      const current = mapsRef.current;
      if (current) {
        revokeNowcastFrames(current.frames.filter((f) => f.kind === 'nowcast'));
      }
      map.remove();
      mapRef.current = null;
    };
    // Mount once; pan via later effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    flyToCourse();

    markerRef.current?.remove();
    markerRef.current = null;

    const el = document.createElement('div');
    el.className = 'teeready-weather-course-pin';
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none">
        <div style="display:grid;place-items:center;width:34px;height:34px;border-radius:999px;background:#14713f;border:2px solid #fff;box-shadow:0 6px 18px rgba(0,0,0,.45)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
        </div>
        ${
          courseName
            ? `<span style="max-width:11rem;padding:3px 8px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;font:600 11px/1.2 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,.35)">${escapeHtml(courseName)}</span>`
            : ''
        }
      </div>
    `;
    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([lon, lat])
      .addTo(map);
  }, [lat, lon, courseName]);

  useEffect(() => {
    const ac = new AbortController();
    void loadMaps(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the provider only has past frames, extrapolate ~60 min of forecast.
  useEffect(() => {
    if (!maps || maps.hasProviderNowcast) return;
    if (maps.frames.some((f) => f.kind === 'nowcast')) return;
    if (extrapolatingRef.current) return;
    const past = maps.frames.filter((f) => f.kind === 'past');
    if (past.length < 2) return;

    const ac = new AbortController();
    extrapolatingRef.current = true;
    setExtrapolating(true);
    const host = maps.host;

    generateAdvectionNowcast({
      host,
      pastFrames: past,
      lat,
      lon,
      signal: ac.signal,
    })
      .then((nowcast) => {
        if (ac.signal.aborted || !nowcast.length) {
          extrapolatingRef.current = false;
          setExtrapolating(false);
          return;
        }
        setMaps((prev) => {
          if (!prev || prev.host !== host) {
            revokeNowcastFrames(nowcast);
            return prev;
          }
          if (prev.frames.some((f) => f.kind === 'nowcast')) {
            revokeNowcastFrames(nowcast);
            return prev;
          }
          return {
            ...prev,
            frames: [...prev.frames.filter((f) => f.kind === 'past'), ...nowcast],
          };
        });
        extrapolatingRef.current = false;
        setExtrapolating(false);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        extrapolatingRef.current = false;
        setExtrapolating(false);
      });

    return () => {
      ac.abort();
    };
  }, [maps, lat, lon]);

  useEffect(() => {
    const map = mapRef.current;
    const data = maps;
    if (!map || !data?.frames.length) return;
    const frame = data.frames[frameIdx];
    if (!frame) return;
    const paint = () => applyFrame(map, data, frame);
    if (map.isStyleLoaded()) paint();
    else map.once('load', paint);
  }, [maps, frameIdx]);

  useEffect(() => {
    if (!playing || !maps?.frames.length) return;
    const id = window.setInterval(() => {
      setFrameIdx((i) => {
        const n = maps.frames.length;
        if (i >= n - 1) return 0;
        return i + 1;
      });
    }, 550);
    return () => window.clearInterval(id);
  }, [playing, maps]);

  const frame = maps?.frames[frameIdx] ?? null;
  const phase = maps ? radarPhaseLabel(maps.frames, frameIdx) : null;
  const lastPast = maps ? lastPastFrameIndex(maps.frames) : 0;
  const hasForecast = !!maps?.frames.some((f) => f.kind === 'nowcast');
  const forecastNote = maps?.hasProviderNowcast
    ? 'includes provider nowcast'
    : hasForecast
      ? 'includes ~60 min extrapolated forecast'
      : extrapolating
        ? 'building forecast…'
        : null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-line bg-[#0b1210] ${className}`}
    >
      <div
        ref={containerRef}
        className="h-[min(58vh,420px)] w-full md:h-[min(62vh,520px)]"
      />

      {(loading || error) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 px-4">
          <p className="rounded-lg bg-black/55 px-3 py-2 text-[13px] text-white/90">
            {error ?? 'Loading radar…'}
          </p>
        </div>
      )}

      {courseName ? (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-lg border border-white/15 bg-black/55 px-2.5 py-1.5 shadow-lg">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
            <Flag className="h-3 w-3 shrink-0 text-[var(--brand,#7dcea0)]" aria-hidden />
            <span className="truncate">{courseName}</span>
          </p>
        </div>
      ) : null}

      <button
        type="button"
        className="absolute right-3 top-14 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg hover:bg-black/70"
        aria-label="Locate course on radar"
        title="Locate course"
        onClick={() => flyToCourse(500)}
      >
        <LocateFixed className="h-4 w-4" aria-hidden />
      </button>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-3 pt-10">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-white/70">
          <span className="font-semibold tracking-wide text-white/85">
            {phase ?? '—'}
            {frame ? ` · ${formatRadarTime(frame.time)}` : ''}
          </span>
          {hasForecast ? (
            <span className="tabular-nums text-white/55">
              Past → Forecast
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20"
            aria-label={playing ? 'Pause radar loop' : 'Play radar loop'}
            onClick={() => setPlaying((v) => !v)}
            disabled={!maps?.frames.length}
          >
            {playing ? (
              <Pause className="h-4 w-4" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
          </button>
          <div className="relative min-w-0 flex-1">
            <input
              type="range"
              min={0}
              max={Math.max(0, (maps?.frames.length ?? 1) - 1)}
              value={frameIdx}
              onChange={(e) => {
                setPlaying(false);
                setFrameIdx(Number(e.target.value));
              }}
              className="w-full accent-[var(--brand,#14713f)]"
              aria-label="Radar frame"
              disabled={!maps?.frames.length}
            />
            {maps && maps.frames.length > 1 && hasForecast ? (
              <span
                className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/70"
                style={{
                  left: `${(lastPast / Math.max(1, maps.frames.length - 1)) * 100}%`,
                }}
                aria-hidden
              />
            ) : null}
          </div>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20"
            aria-label="Refresh radar"
            onClick={() => {
              void loadMaps();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-white/55">
          Radar via{' '}
          <a
            href={maps?.providerUrl ?? 'https://www.rainviewer.com/'}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-white/30 hover:text-white/80"
          >
            {maps?.providerName ?? 'RainViewer'}
          </a>
          {forecastNote ? ` · ${forecastNote}` : null}
        </p>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
