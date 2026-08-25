import {
  type TurfInputs,
  type WeatherProvider,
  type WindSample,
  weatherUserAgent,
} from './types';
import { mmToInches } from './units';

const CACHE = new Map<
  string,
  {
    expiresAt: number;
    lastModified: string | null;
    body: MetNoBody;
  }
>();

interface MetNoBody {
  properties?: {
    timeseries?: Array<{
      time?: string;
      data?: {
        instant?: {
          details?: {
            wind_from_direction?: number;
            wind_speed?: number;
            wind_speed_of_gust?: number;
            relative_humidity?: number;
          };
        };
        next_1_hours?: {
          details?: { precipitation_amount?: number };
        };
      };
    }>;
  };
}

function q4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function msToMph(ms: number): number {
  return ms * 2.236936;
}

async function fetchCompact(lat: number, lon: number): Promise<MetNoBody | null> {
  const key = `${q4(lat)},${q4(lon)}`;
  const hit = CACHE.get(key);
  const now = Date.now();
  if (hit && now < hit.expiresAt) return hit.body;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': weatherUserAgent(),
  };
  if (hit?.lastModified) {
    headers['If-Modified-Since'] = hit.lastModified;
  }

  const res = await fetch(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${q4(lat)}&lon=${q4(lon)}`,
    { headers },
  );

  if (res.status === 304 && hit) {
    const expiresHeader = res.headers.get('Expires');
    const expiresAt = expiresHeader
      ? Date.parse(expiresHeader)
      : now + 30 * 60_000;
    hit.expiresAt = Number.isFinite(expiresAt) ? expiresAt : now + 30 * 60_000;
    return hit.body;
  }

  if (!res.ok) return hit?.body ?? null;
  const body = (await res.json()) as MetNoBody;
  const expiresHeader = res.headers.get('Expires');
  const expiresAt = expiresHeader
    ? Date.parse(expiresHeader)
    : now + 30 * 60_000;
  CACHE.set(key, {
    body,
    lastModified: res.headers.get('Last-Modified'),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : now + 30 * 60_000,
  });
  return body;
}

function series(body: MetNoBody | null) {
  return body?.properties?.timeseries ?? [];
}

export const metnoProvider: WeatherProvider = {
  id: 'metno',

  covers(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon);
  },

  async hourlyWind(lat, lon, hourOffsets) {
    const body = await fetchCompact(lat, lon);
    const rows = series(body);
    if (!rows.length) return [];
    const now = Date.now();
    const floorHour = Math.floor(now / 3_600_000) * 3_600_000;
    const out: WindSample[] = [];

    for (const offset of hourOffsets) {
      const target = floorHour + offset * 3_600_000;
      let best: (typeof rows)[number] | null = null;
      let bestDist = Infinity;
      for (const row of rows) {
        if (!row.time) continue;
        const t = Date.parse(row.time);
        if (!Number.isFinite(t)) continue;
        const d = Math.abs(t - target);
        if (d < bestDist) {
          bestDist = d;
          best = row;
        }
      }
      if (!best || bestDist > 90 * 60_000) continue;
      const details = best.data?.instant?.details;
      const speedMs = details?.wind_speed;
      const dir = details?.wind_from_direction;
      if (
        typeof speedMs !== 'number' ||
        !Number.isFinite(speedMs) ||
        typeof dir !== 'number' ||
        !Number.isFinite(dir)
      ) {
        continue;
      }
      const speed = msToMph(speedMs);
      const gustMs = details?.wind_speed_of_gust;
      const gust =
        typeof gustMs === 'number' && Number.isFinite(gustMs)
          ? msToMph(gustMs)
          : speed;
      out.push({
        source: 'metno',
        speed,
        dir: ((dir % 360) + 360) % 360,
        gust: Math.max(gust, speed),
        time: best.time,
      });
    }
    return out;
  },

  async turfInputs(lat, lon): Promise<Partial<TurfInputs>> {
    const body = await fetchCompact(lat, lon);
    const rows = series(body);
    if (!rows.length) return {};
    const now = Date.now();
    const cutoff = now - 48 * 3_600_000;
    let precipMm = 0;
    let humidityPct: number | null = null;
    for (const row of rows) {
      if (!row.time) continue;
      const t = Date.parse(row.time);
      if (!Number.isFinite(t)) continue;
      if (t >= cutoff && t <= now + 3_600_000) {
        const p = row.data?.next_1_hours?.details?.precipitation_amount;
        if (typeof p === 'number' && Number.isFinite(p)) precipMm += p;
      }
      if (Math.abs(t - now) < 90 * 60_000) {
        const rh = row.data?.instant?.details?.relative_humidity;
        if (typeof rh === 'number' && Number.isFinite(rh)) humidityPct = rh;
      }
    }
    return {
      precipIn48h: mmToInches(precipMm),
      ...(humidityPct != null ? { humidityPct } : {}),
      // MET Norway compact has no ET0 / soil moisture.
    };
  },
};
