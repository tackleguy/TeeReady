/**
 * Weather radar maps for MapLibre tiles (past + precipitation forecast).
 *
 * RainViewer discontinued public nowcast on 2026-01-01. Sources, in order:
 * 1. LibreWXR — RainViewer-compatible global past + ~60 min nowcast
 * 2. Iowa Mesonet (CONUS) — NEXRAD past + HRRR reflectivity forecast
 * 3. RainViewer — past radar only
 */

export type RadarFrameKind = 'past' | 'nowcast';

export type RadarFrame = {
  time: number;
  kind: RadarFrameKind;
  /** Slippy-map tile URL template containing `{z}/{x}/{y}`. */
  tiles: string;
};

export type RadarProvider = 'librewxr' | 'iem' | 'rainviewer';

export type RainViewerMaps = {
  host: string;
  generated: number;
  frames: RadarFrame[];
  /** Index of the newest observed (past) frame — “now” on the scrubber. */
  nowIndex: number;
  provider: RadarProvider;
};

const LIBREWXR_URL = 'https://api.librewxr.net/public/weather-maps.json';
const RAINVIEWER_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const IEM_TILE =
  'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0';

/** Rough CONUS bbox where IEM NEXRAD + HRRR tiles are useful. */
export function isConusRadarCoverage(lat: number, lon: number): boolean {
  return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
}

type MapsPayload = {
  host?: string;
  generated?: number;
  radar?: {
    past?: Array<{ time?: number; path?: string }>;
    nowcast?: Array<{ time?: number; path?: string }>;
  };
};

function rvTileUrl(host: string, path: string): string {
  return `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function normalizeRvFrames(
  host: string,
  pastRaw: Array<{ time?: number; path?: string }> | undefined,
  nowcastRaw: Array<{ time?: number; path?: string }> | undefined,
): RadarFrame[] {
  const past = (pastRaw ?? [])
    .filter(
      (f): f is { time: number; path: string } =>
        !!f && typeof f.time === 'number' && typeof f.path === 'string',
    )
    .map((f) => ({
      time: f.time,
      kind: 'past' as const,
      tiles: rvTileUrl(host, f.path),
    }));
  const nowcast = (nowcastRaw ?? [])
    .filter(
      (f): f is { time: number; path: string } =>
        !!f && typeof f.time === 'number' && typeof f.path === 'string',
    )
    .map((f) => ({
      time: f.time,
      kind: 'nowcast' as const,
      tiles: rvTileUrl(host, f.path),
    }));
  return [...past, ...nowcast];
}

async function fetchMapsJson(
  url: string,
  signal?: AbortSignal,
): Promise<MapsPayload> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Radar maps ${res.status}`);
  return (await res.json()) as MapsPayload;
}

function toRvMaps(
  data: MapsPayload,
  provider: Extract<RadarProvider, 'librewxr' | 'rainviewer'>,
  fallbackHost: string,
): RainViewerMaps {
  const host = (data.host || fallbackHost).replace(/\/$/, '');
  const frames = normalizeRvFrames(host, data.radar?.past, data.radar?.nowcast);
  if (!frames.length) throw new Error('No radar frames available');
  const pastCount = frames.filter((f) => f.kind === 'past').length;
  return {
    host,
    generated: data.generated ?? Math.floor(Date.now() / 1000),
    frames,
    nowIndex: Math.max(0, pastCount - 1),
    provider,
  };
}

function iemProductTiles(product: string): string {
  // Encode `::` so MapLibre path handling stays stable.
  const enc = product.replace(/:/g, '%3A');
  return `${IEM_TILE}/${enc}/{z}/{x}/{y}.png`;
}

/** CONUS observed NEXRAD (~50 min) + HRRR reflectivity forecast (~2 h). */
export function buildIemRadarMaps(
  nowUnixSec: number = Math.floor(Date.now() / 1000),
): RainViewerMaps {
  const pastMinutes = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];
  const past: RadarFrame[] = pastMinutes.map((minsAgo) => {
    const product =
      minsAgo === 0
        ? 'nexrad-n0q-900913'
        : `nexrad-n0q-900913-m${String(minsAgo).padStart(2, '0')}m`;
    return {
      time: nowUnixSec - minsAgo * 60,
      kind: 'past',
      tiles: iemProductTiles(product),
    };
  });

  // HRRR F0000 overlaps “now”; start forecast at +15 min through +2 h.
  const forecastMinutes = [15, 30, 45, 60, 75, 90, 105, 120];
  const nowcast: RadarFrame[] = forecastMinutes.map((minsAhead) => {
    const product = `hrrr::REFD-F${String(minsAhead).padStart(4, '0')}-0`;
    return {
      time: nowUnixSec + minsAhead * 60,
      kind: 'nowcast',
      tiles: iemProductTiles(product),
    };
  });

  const frames = [...past, ...nowcast];
  return {
    host: IEM_TILE,
    generated: nowUnixSec,
    frames,
    nowIndex: past.length - 1,
    provider: 'iem',
  };
}

export type FetchRadarMapsOpts = {
  lat?: number;
  lon?: number;
  signal?: AbortSignal;
};

export async function fetchRainViewerMaps(
  signalOrOpts?: AbortSignal | FetchRadarMapsOpts,
): Promise<RainViewerMaps> {
  const opts: FetchRadarMapsOpts =
    signalOrOpts instanceof AbortSignal
      ? { signal: signalOrOpts }
      : (signalOrOpts ?? {});
  const { signal, lat, lon } = opts;
  const conus =
    lat != null && lon != null ? isConusRadarCoverage(lat, lon) : true;

  try {
    const data = await fetchMapsJson(LIBREWXR_URL, signal);
    const maps = toRvMaps(data, 'librewxr', 'https://api.librewxr.net');
    if (maps.frames.some((f) => f.kind === 'nowcast')) return maps;
    // LibreWXR up but past-only — prefer IEM forecast on CONUS.
    if (conus) return buildIemRadarMaps();
    return maps;
  } catch (primaryErr) {
    if (signal?.aborted) throw primaryErr;
  }

  if (conus) return buildIemRadarMaps();

  const data = await fetchMapsJson(RAINVIEWER_URL, signal);
  return toRvMaps(data, 'rainviewer', 'https://tilecache.rainviewer.com');
}

/** @deprecated Prefer `frame.tiles` — kept for older call sites. */
export function radarTileUrl(host: string, frame: RadarFrame): string {
  if (frame.tiles) return frame.tiles;
  return `${host}/256/{z}/{x}/{y}/2/1_1.png`;
}

export function formatRadarTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Short scrubber label: clock time, plus Now / +Nm for forecast. */
export function formatRadarFrameLabel(
  frame: RadarFrame,
  nowUnixSec: number = Math.floor(Date.now() / 1000),
): string {
  const clock = formatRadarTime(frame.time);
  if (frame.kind === 'nowcast') {
    const mins = Math.max(1, Math.round((frame.time - nowUnixSec) / 60));
    return `${clock} · +${mins}m`;
  }
  const lagMin = Math.round((nowUnixSec - frame.time) / 60);
  if (lagMin <= 8) return `${clock} · Now`;
  return clock;
}

export function radarProviderHref(provider: RadarProvider): string {
  if (provider === 'librewxr') return 'https://librewxr.net/';
  if (provider === 'iem') return 'https://mesonet.agron.iastate.edu/';
  return 'https://www.rainviewer.com/';
}

export function radarProviderName(provider: RadarProvider): string {
  if (provider === 'librewxr') return 'LibreWXR';
  if (provider === 'iem') return 'Iowa Mesonet / HRRR';
  return 'RainViewer';
}

export function radarAttributionHtml(provider: RadarProvider): string {
  if (provider === 'librewxr') {
    return 'Radar © <a href="https://librewxr.net/">LibreWXR</a>';
  }
  if (provider === 'iem') {
    return 'Radar © <a href="https://mesonet.agron.iastate.edu/">Iowa Mesonet</a> · NEXRAD / HRRR';
  }
  return 'Radar © <a href="https://www.rainviewer.com/">RainViewer</a>';
}
