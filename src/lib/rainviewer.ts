/** Weather radar maps API — past + nowcast frames for MapLibre tiles.
 *
 * RainViewer discontinued free nowcast (Jan 2026). Prefer LibreWXR's
 * RainViewer-compatible public API, which still publishes ~60m forecast
 * frames, and fall back to RainViewer past-only if LibreWXR is unreachable.
 */

export type RadarFrame = {
  time: number;
  path: string;
};

export type RadarProvider = 'librewxr' | 'rainviewer';

export type FrameKind = 'past' | 'now' | 'forecast';

export type RainViewerMaps = {
  host: string;
  generated: number;
  frames: RadarFrame[];
  /** Number of observed/past frames at the start of `frames`. */
  pastCount: number;
  /** Number of nowcast/forecast frames after past. */
  nowcastCount: number;
  provider: RadarProvider;
  attributionName: string;
  attributionUrl: string;
};

type MapsPayload = {
  host?: string;
  generated?: number;
  radar?: { past?: RadarFrame[]; nowcast?: RadarFrame[] };
};

const PROVIDERS: Array<{
  id: RadarProvider;
  url: string;
  attributionName: string;
  attributionUrl: string;
  /** Prefer providers that still publish nowcast. */
  requireNowcast?: boolean;
}> = [
  {
    id: 'librewxr',
    url: 'https://api.librewxr.net/public/weather-maps.json',
    attributionName: 'LibreWXR',
    attributionUrl: 'https://librewxr.net/',
    requireNowcast: true,
  },
  {
    id: 'rainviewer',
    url: 'https://api.rainviewer.com/public/weather-maps.json',
    attributionName: 'RainViewer',
    attributionUrl: 'https://www.rainviewer.com/',
  },
];

function parseMaps(
  data: MapsPayload,
  provider: (typeof PROVIDERS)[number],
): RainViewerMaps {
  const host = (data.host || provider.url.replace(/\/public\/.*$/, '')).replace(
    /\/$/,
    '',
  );
  const past = (data.radar?.past ?? []).filter(isFrame);
  const nowcast = (data.radar?.nowcast ?? []).filter(isFrame);
  const frames = [...past, ...nowcast];
  if (!frames.length) throw new Error('No radar frames available');
  if (provider.requireNowcast && nowcast.length === 0) {
    throw new Error(`${provider.attributionName} returned no forecast frames`);
  }
  return {
    host,
    generated: data.generated ?? Math.floor(Date.now() / 1000),
    frames,
    pastCount: past.length,
    nowcastCount: nowcast.length,
    provider: provider.id,
    attributionName: provider.attributionName,
    attributionUrl: provider.attributionUrl,
  };
}

function isFrame(f: RadarFrame | undefined): f is RadarFrame {
  return !!f && typeof f.time === 'number' && typeof f.path === 'string';
}

async function fetchProviderMaps(
  provider: (typeof PROVIDERS)[number],
  signal?: AbortSignal,
): Promise<RainViewerMaps> {
  const res = await fetch(provider.url, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Radar maps ${res.status}`);
  const data = (await res.json()) as MapsPayload;
  return parseMaps(data, provider);
}

export async function fetchRainViewerMaps(
  signal?: AbortSignal,
): Promise<RainViewerMaps> {
  let lastErr: unknown = null;
  for (const provider of PROVIDERS) {
    try {
      return await fetchProviderMaps(provider, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('No radar frames available');
}

/** Slippy-map tile template for one frame (Universal Blue + smooth + snow). */
export function radarTileUrl(host: string, frame: RadarFrame): string {
  const size = 256;
  return `${host}${frame.path}/${size}/{z}/{x}/{y}/2/1_1.png`;
}

/** Index of the newest observed frame ("now"), or 0 if empty. */
export function nowFrameIndex(maps: RainViewerMaps): number {
  if (!maps.frames.length) return 0;
  if (maps.pastCount <= 0) return 0;
  return maps.pastCount - 1;
}

export function frameKind(maps: RainViewerMaps, idx: number): FrameKind {
  if (!maps.frames.length) return 'past';
  const i = Math.max(0, Math.min(idx, maps.frames.length - 1));
  if (maps.nowcastCount > 0 && i >= maps.pastCount) return 'forecast';
  if (i === nowFrameIndex(maps)) return 'now';
  return 'past';
}

export function formatRadarTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Short relative label for forecast frames (e.g. "+20m"). */
export function formatRadarRelative(
  unixSec: number,
  nowUnixSec = Math.floor(Date.now() / 1000),
): string {
  const deltaMin = Math.round((unixSec - nowUnixSec) / 60);
  if (!Number.isFinite(deltaMin) || deltaMin === 0) return 'now';
  if (deltaMin > 0) return `+${deltaMin}m`;
  return `${deltaMin}m`;
}

export function frameKindLabel(kind: FrameKind): string {
  if (kind === 'forecast') return 'Forecast';
  if (kind === 'now') return 'Now';
  return 'Past';
}
