/** RainViewer-compatible weather-maps API — past + nowcast radar frames. */

export type RadarFrameKind = 'past' | 'nowcast';

export type RadarFrame = {
  time: number;
  path: string;
  kind: RadarFrameKind;
  /** Client-generated forecast image (blob URL), when path tiles are unavailable. */
  imageUrl?: string;
  /** WGS84 corners for MapLibre image source: NW, NE, SE, SW. */
  coordinates?: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ];
};

export type RadarMaps = {
  host: string;
  generated: number;
  frames: RadarFrame[];
  /** Maps JSON endpoint that supplied the frames. */
  mapsUrl: string;
  /** Human credit for the tile host / provider. */
  providerName: string;
  providerUrl: string;
  /** True when nowcast frames came from the maps API (not client extrapolation). */
  hasProviderNowcast: boolean;
};

export type RainViewerMaps = RadarMaps;

const RAINVIEWER_MAPS =
  'https://api.rainviewer.com/public/weather-maps.json';
const LIBREWXR_MAPS = 'https://api.librewxr.net/public/weather-maps.json';

type MapsJson = {
  host?: string;
  generated?: number;
  radar?: { past?: Array<{ time?: number; path?: string }>; nowcast?: Array<{ time?: number; path?: string }> };
};

function providerMeta(mapsUrl: string): Pick<RadarMaps, 'providerName' | 'providerUrl'> {
  if (mapsUrl.includes('librewxr')) {
    return {
      providerName: 'LibreWXR',
      providerUrl: 'https://librewxr.net/',
    };
  }
  return {
    providerName: 'RainViewer',
    providerUrl: 'https://www.rainviewer.com/',
  };
}

function normalizeFrames(
  rows: Array<{ time?: number; path?: string }> | undefined,
  kind: RadarFrameKind,
): RadarFrame[] {
  if (!rows?.length) return [];
  return rows
    .filter(
      (f): f is { time: number; path: string } =>
        !!f && typeof f.time === 'number' && typeof f.path === 'string' && f.path.length > 0,
    )
    .map((f) => ({ time: f.time, path: f.path, kind }));
}

async function fetchMapsJson(
  mapsUrl: string,
  signal?: AbortSignal,
): Promise<RadarMaps> {
  const res = await fetch(mapsUrl, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Radar maps ${res.status}`);
  const data = (await res.json()) as MapsJson;
  const fallbackHost = mapsUrl.includes('librewxr')
    ? 'https://api.librewxr.net'
    : 'https://tilecache.rainviewer.com';
  const host = (data.host || fallbackHost).replace(/\/$/, '');
  const past = normalizeFrames(data.radar?.past, 'past');
  const nowcast = normalizeFrames(data.radar?.nowcast, 'nowcast');
  const frames = [...past, ...nowcast];
  if (!frames.length) throw new Error('No radar frames available');
  const meta = providerMeta(mapsUrl);
  return {
    host,
    generated: data.generated ?? Math.floor(Date.now() / 1000),
    frames,
    mapsUrl,
    providerName: meta.providerName,
    providerUrl: meta.providerUrl,
    hasProviderNowcast: nowcast.length > 0,
  };
}

/** Candidate maps endpoints — prefer sources that still publish nowcast. */
export function radarMapsCandidates(): string[] {
  const override =
    typeof import.meta !== 'undefined' &&
    typeof import.meta.env?.VITE_RADAR_MAPS_URL === 'string' &&
    import.meta.env.VITE_RADAR_MAPS_URL.trim()
      ? import.meta.env.VITE_RADAR_MAPS_URL.trim()
      : '';
  const list = [override, LIBREWXR_MAPS, RAINVIEWER_MAPS].filter(Boolean);
  return [...new Set(list)];
}

/**
 * Load radar timeline. Prefers a provider with nowcast frames; falls back to
 * past-only RainViewer when LibreWXR (or an override) is unavailable.
 */
export async function fetchRainViewerMaps(
  signal?: AbortSignal,
): Promise<RadarMaps> {
  const candidates = radarMapsCandidates();
  let pastOnly: RadarMaps | null = null;
  let lastError: unknown = null;

  for (const url of candidates) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const maps = await fetchMapsJson(url, signal);
      if (maps.hasProviderNowcast) return maps;
      if (!pastOnly) pastOnly = maps;
    } catch (err) {
      lastError = err;
    }
  }

  if (pastOnly) return pastOnly;
  if (lastError instanceof Error) throw lastError;
  throw new Error('No radar frames available');
}

/** Slippy-map tile template for one frame (Universal Blue + smooth + snow). */
export function radarTileUrl(host: string, frame: RadarFrame): string {
  const size = 256;
  return `${host}${frame.path}/${size}/{z}/{x}/{y}/2/1_1.png`;
}

export function formatRadarTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function lastPastFrameIndex(frames: RadarFrame[]): number {
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    if (frames[i]?.kind === 'past') return i;
  }
  return Math.max(0, frames.length - 1);
}

export function radarPhaseLabel(
  frames: RadarFrame[],
  frameIdx: number,
): 'Past' | 'Now' | 'Forecast' {
  const frame = frames[frameIdx];
  if (!frame) return 'Past';
  if (frame.kind === 'nowcast') return 'Forecast';
  return frameIdx === lastPastFrameIndex(frames) ? 'Now' : 'Past';
}
