/** MapLibre radar overlay via LibreWXR/RainViewer tiles + course pin. */

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Flag, LocateFixed, Pause, Play, RefreshCw } from 'lucide-react';
import {
  fetchRainViewerMaps,
  formatRadarRelative,
  formatRadarTime,
  frameKind,
  frameKindLabel,
  nowFrameIndex,
  radarTileUrl,
  type RadarFrame,
  type RainViewerMaps,
} from '../../lib/rainviewer';

const BASE_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const SRC_ID = 'teeready-radar';
const LYR_ID = 'teeready-radar-lyr';
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
  const [maps, setMaps] = useState<RainViewerMaps | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applyFrame = (
    map: maplibregl.Map,
    data: RainViewerMaps,
    frame: RadarFrame,
  ) => {
    const tiles = [radarTileUrl(data.host, frame)];
    if (map.getLayer(LYR_ID)) map.removeLayer(LYR_ID);
    if (map.getSource(SRC_ID)) map.removeSource(SRC_ID);
    map.addSource(SRC_ID, {
      type: 'raster',
      tiles,
      tileSize: 256,
      maxzoom: 7,
      attribution: `Radar © <a href="${data.attributionUrl}">${data.attributionName}</a>`,
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
    return fetchRainViewerMaps(signal)
      .then((data) => {
        if (signal?.aborted) return;
        setMaps(data);
        setFrameIdx(nowFrameIndex(data));
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
  }, []);

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
  const kind = maps ? frameKind(maps, frameIdx) : 'past';
  const kindLabel = frameKindLabel(kind);
  const nowPct = useMemo(() => {
    if (!maps?.frames.length || maps.pastCount <= 0) return null;
    const last = maps.frames.length - 1;
    if (last <= 0) return 0;
    return (nowFrameIndex(maps) / last) * 100;
  }, [maps]);

  const loopHint = useMemo(() => {
    if (!maps) return null;
    if (maps.nowcastCount > 0) {
      return `Past ~2h · Forecast ~${maps.nowcastCount * 10}m`;
    }
    return 'Past radar only · forecast unavailable';
  }, [maps]);

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
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              kind === 'forecast'
                ? 'bg-sky-500/25 text-sky-200'
                : kind === 'now'
                  ? 'bg-emerald-500/25 text-emerald-200'
                  : 'bg-white/10 text-white/75'
            }`}
          >
            {kindLabel}
          </span>
          {loopHint ? (
            <span className="text-[10px] text-white/50">{loopHint}</span>
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
            {nowPct != null && maps && maps.nowcastCount > 0 ? (
              <span
                className="pointer-events-none absolute top-1/2 z-10 h-3 w-0.5 -translate-y-1/2 bg-white/70"
                style={{ left: `calc(${nowPct}% - 1px)` }}
                title="Now"
                aria-hidden
              />
            ) : null}
            <input
              type="range"
              min={0}
              max={Math.max(0, (maps?.frames.length ?? 1) - 1)}
              value={frameIdx}
              onChange={(e) => {
                setPlaying(false);
                setFrameIdx(Number(e.target.value));
              }}
              className="relative z-0 min-w-0 w-full accent-[var(--brand,#14713f)]"
              aria-label="Radar frame"
              disabled={!maps?.frames.length}
            />
          </div>
          <span className="w-[5.25rem] shrink-0 text-right text-[12px] font-medium tabular-nums text-white/90">
            {frame ? (
              <>
                {formatRadarTime(frame.time)}
                {kind === 'forecast' ? (
                  <span className="ml-1 text-[10px] text-sky-200/90">
                    {formatRadarRelative(frame.time)}
                  </span>
                ) : null}
              </>
            ) : (
              '—'
            )}
          </span>
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
          {maps ? (
            <a
              href={maps.attributionUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/30 hover:text-white/80"
            >
              {maps.attributionName}
            </a>
          ) : (
            'LibreWXR'
          )}
          {maps?.nowcastCount ? ' · includes precipitation forecast' : null}
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
