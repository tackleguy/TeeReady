/** Basic MapLibre radar overlay via RainViewer tiles. */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Pause, Play, RefreshCw } from 'lucide-react';
import {
  fetchRainViewerMaps,
  formatRadarTime,
  radarTileUrl,
  type RadarFrame,
  type RainViewerMaps,
} from '../../lib/rainviewer';

const BASE_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const SRC_ID = 'teeready-radar';
const LYR_ID = 'teeready-radar-lyr';

type Props = {
  lat: number;
  lon: number;
  className?: string;
};

export function WeatherRadarMap({ lat, lon, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [maps, setMaps] = useState<RainViewerMaps | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applyFrame = (map: maplibregl.Map, host: string, frame: RadarFrame) => {
    const tiles = [radarTileUrl(host, frame)];
    if (map.getLayer(LYR_ID)) map.removeLayer(LYR_ID);
    if (map.getSource(SRC_ID)) map.removeSource(SRC_ID);
    map.addSource(SRC_ID, {
      type: 'raster',
      tiles,
      tileSize: 256,
      maxzoom: 7,
      attribution: 'Radar © <a href="https://www.rainviewer.com/">RainViewer</a>',
    });
    map.addLayer({
      id: LYR_ID,
      type: 'raster',
      source: SRC_ID,
      paint: { 'raster-opacity': 0.78 },
    });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [lon, lat],
      zoom: 7.2,
      maxZoom: 10,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Mount once; pan via later effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [lon, lat], duration: 600 });
  }, [lat, lon]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchRainViewerMaps(ac.signal)
      .then((data) => {
        if (ac.signal.aborted) return;
        setMaps(data);
        setFrameIdx(Math.max(0, data.frames.length - 1));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Radar unavailable');
        setLoading(false);
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const data = maps;
    if (!map || !data?.frames.length) return;
    const frame = data.frames[frameIdx];
    if (!frame) return;
    const paint = () => applyFrame(map, data.host, frame);
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

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line bg-[#0b1210] ${className}`}>
      <div ref={containerRef} className="h-[min(58vh,420px)] w-full md:h-[min(62vh,520px)]" />

      {(loading || error) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 px-4">
          <p className="rounded-lg bg-black/55 px-3 py-2 text-[13px] text-white/90">
            {error ?? 'Loading radar…'}
          </p>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-3 pt-10">
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
          <input
            type="range"
            min={0}
            max={Math.max(0, (maps?.frames.length ?? 1) - 1)}
            value={frameIdx}
            onChange={(e) => {
              setPlaying(false);
              setFrameIdx(Number(e.target.value));
            }}
            className="min-w-0 flex-1 accent-[var(--brand,#14713f)]"
            aria-label="Radar frame"
            disabled={!maps?.frames.length}
          />
          <span className="w-[4.5rem] shrink-0 text-right text-[12px] font-medium tabular-nums text-white/90">
            {frame ? formatRadarTime(frame.time) : '—'}
          </span>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20"
            aria-label="Refresh radar"
            onClick={() => {
              setLoading(true);
              setError(null);
              fetchRainViewerMaps()
                .then((data) => {
                  setMaps(data);
                  setFrameIdx(Math.max(0, data.frames.length - 1));
                  setLoading(false);
                })
                .catch((err: unknown) => {
                  setError(
                    err instanceof Error ? err.message : 'Radar unavailable',
                  );
                  setLoading(false);
                });
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-white/55">
          Radar via{' '}
          <a
            href="https://www.rainviewer.com/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-white/30 hover:text-white/80"
          >
            RainViewer
          </a>
        </p>
      </div>
    </div>
  );
}
