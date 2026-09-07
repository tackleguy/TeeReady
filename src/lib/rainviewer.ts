/** RainViewer public weather-maps API — past radar frames for MapLibre tiles. */

export type RadarFrame = {
  time: number;
  path: string;
};

export type RainViewerMaps = {
  host: string;
  generated: number;
  frames: RadarFrame[];
};

const API_URL = 'https://api.rainviewer.com/public/weather-maps.json';

export async function fetchRainViewerMaps(
  signal?: AbortSignal,
): Promise<RainViewerMaps> {
  const res = await fetch(API_URL, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Radar maps ${res.status}`);
  const data = (await res.json()) as {
    host?: string;
    generated?: number;
    radar?: { past?: RadarFrame[]; nowcast?: RadarFrame[] };
  };
  const host = (data.host || 'https://tilecache.rainviewer.com').replace(
    /\/$/,
    '',
  );
  const past = data.radar?.past ?? [];
  const nowcast = data.radar?.nowcast ?? [];
  const frames = [...past, ...nowcast].filter(
    (f) => f && typeof f.time === 'number' && typeof f.path === 'string',
  );
  if (!frames.length) throw new Error('No radar frames available');
  return {
    host,
    generated: data.generated ?? Math.floor(Date.now() / 1000),
    frames,
  };
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
