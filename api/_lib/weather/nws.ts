import {
  type TurfInputs,
  type WeatherProvider,
  type WindSample,
  weatherUserAgent,
} from './types';
import { expandIsoInterval, mmToInches, toMph } from './units';

const POINTS_CACHE = new Map<
  string,
  { at: number; gridUrl: string; forecastHourlyUrl: string | null }
>();
const POINTS_TTL_MS = 30 * 24 * 60 * 60_000;

type GridLayer = {
  uom?: string;
  values?: Array<{ validTime?: string; value?: number | null }>;
};

function isUsTerritory(lat: number, lon: number): boolean {
  // CONUS + AK + HI + PR/VI + GU/MP rough boxes — NWS rejects elsewhere.
  if (lat >= 24.5 && lat <= 49.5 && lon >= -125 && lon <= -66.5) return true;
  if (lat >= 51 && lat <= 72 && lon >= -180 && lon <= -129) return true;
  if (lat >= 18.5 && lat <= 22.5 && lon >= -161 && lon <= -154) return true;
  if (lat >= 17.5 && lat <= 18.6 && lon >= -67.5 && lon <= -64.5) return true;
  if (lat >= 13 && lat <= 15.5 && lon >= 144 && lon <= 146) return true;
  return false;
}

function nwsHeaders(): HeadersInit {
  return {
    Accept: 'application/geo+json, application/ld+json, application/json',
    'User-Agent': weatherUserAgent(),
  };
}

function q4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

async function resolveGrid(
  lat: number,
  lon: number,
): Promise<{ gridUrl: string; forecastHourlyUrl: string | null } | null> {
  const key = `${q4(lat)},${q4(lon)}`;
  const hit = POINTS_CACHE.get(key);
  if (hit && Date.now() - hit.at < POINTS_TTL_MS) {
    return { gridUrl: hit.gridUrl, forecastHourlyUrl: hit.forecastHourlyUrl };
  }
  const res = await fetch(
    `https://api.weather.gov/points/${q4(lat)},${q4(lon)}`,
    { headers: nwsHeaders() },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as {
    properties?: {
      forecastGridData?: string;
      forecastHourly?: string;
    };
  };
  const gridUrl = body.properties?.forecastGridData;
  if (!gridUrl) return null;
  const entry = {
    at: Date.now(),
    gridUrl,
    forecastHourlyUrl: body.properties?.forecastHourly ?? null,
  };
  POINTS_CACHE.set(key, entry);
  return entry;
}

function expandLayer(layer: GridLayer | undefined): Map<number, number> {
  const out = new Map<number, number>();
  const uom = layer?.uom;
  for (const row of layer?.values ?? []) {
    if (typeof row.value !== 'number' || !Number.isFinite(row.value)) continue;
    if (!row.validTime) continue;
    const mph = toMph(row.value, uom);
    for (const t of expandIsoInterval(row.validTime)) {
      out.set(t.getTime(), mph);
    }
  }
  return out;
}

function expandDirLayer(layer: GridLayer | undefined): Map<number, number> {
  const out = new Map<number, number>();
  for (const row of layer?.values ?? []) {
    if (typeof row.value !== 'number' || !Number.isFinite(row.value)) continue;
    if (!row.validTime) continue;
    for (const t of expandIsoInterval(row.validTime)) {
      out.set(t.getTime(), ((row.value % 360) + 360) % 360);
    }
  }
  return out;
}

function nearestHourValue(
  map: Map<number, number>,
  targetMs: number,
  maxSkewMs = 90 * 60_000,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const [t, v] of map) {
    const d = Math.abs(t - targetMs);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return bestDist <= maxSkewMs ? best : null;
}

function sumPrecipInches(layer: GridLayer | undefined, hours: number): number {
  const uom = (layer?.uom ?? '').toLowerCase();
  let sum = 0;
  const now = Date.now();
  const cutoff = now - hours * 3_600_000;
  for (const row of layer?.values ?? []) {
    if (typeof row.value !== 'number' || !Number.isFinite(row.value)) continue;
    if (!row.validTime) continue;
    const times = expandIsoInterval(row.validTime);
    if (!times.length) continue;
    const start = times[0]!.getTime();
    const end = times[times.length - 1]!.getTime() + 3_600_000;
    // Interval accumulation — count once if it overlaps the lookback window.
    if (end < cutoff || start > now + 3_600_000) continue;
    sum += row.value;
  }
  if (uom.includes('inch') || uom.includes('in')) return sum;
  return mmToInches(sum);
}

export const nwsProvider: WeatherProvider = {
  id: 'nws',

  covers(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && isUsTerritory(lat, lon);
  },

  async hourlyWind(lat, lon, hourOffsets) {
    const grid = await resolveGrid(lat, lon);
    if (!grid) return [];
    const res = await fetch(grid.gridUrl, { headers: nwsHeaders() });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      properties?: {
        windSpeed?: GridLayer;
        windDirection?: GridLayer;
        windGust?: GridLayer;
      };
    };
    const speeds = expandLayer(body.properties?.windSpeed);
    const dirs = expandDirLayer(body.properties?.windDirection);
    const gusts = expandLayer(body.properties?.windGust);
    const now = Date.now();
    const floorHour = Math.floor(now / 3_600_000) * 3_600_000;
    const out: WindSample[] = [];
    for (const offset of hourOffsets) {
      const target = floorHour + offset * 3_600_000;
      const speed = nearestHourValue(speeds, target);
      const dir = nearestHourValue(dirs, target);
      if (speed == null || dir == null) continue;
      const gust = nearestHourValue(gusts, target) ?? speed;
      out.push({
        source: 'nws',
        speed,
        dir,
        gust: Math.max(gust, speed),
        time: new Date(target).toISOString(),
      });
    }
    return out;
  },

  async turfInputs(lat, lon): Promise<Partial<TurfInputs>> {
    const grid = await resolveGrid(lat, lon);
    if (!grid) return {};
    const res = await fetch(grid.gridUrl, { headers: nwsHeaders() });
    if (!res.ok) return {};
    const body = (await res.json()) as {
      properties?: {
        quantitativePrecipitation?: GridLayer;
        relativeHumidity?: GridLayer;
      };
    };
    const precipIn48h = sumPrecipInches(
      body.properties?.quantitativePrecipitation,
      48,
    );
    const rhMap = expandDirLayer(body.properties?.relativeHumidity);
    const humidityPct = nearestHourValue(rhMap, Date.now()) ?? undefined;
    return {
      precipIn48h,
      ...(humidityPct != null ? { humidityPct } : {}),
      // NWS does not publish ET0 or soil moisture.
    };
  },
};
