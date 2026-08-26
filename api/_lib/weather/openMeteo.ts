/**
 * Open-Meteo provider — disabled unless OPEN_METEO_ENABLED=true.
 * Kept for optional multi-model ensemble when licensing allows.
 */

import {
  type TurfInputs,
  type WeatherProvider,
  type WindSample,
} from './types';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Prefer high-skill globals + strong limited-area models from the app catalog. */
export const OPEN_METEO_ENSEMBLE_MODELS = [
  'gfs_seamless',
  'gfs_global',
  'gfs_hrrr',
  'gfs_graphcast025',
  'ecmwf_ifs025',
  'ecmwf_ifs',
  'ecmwf_aifs025_single',
  'icon_seamless',
  'icon_global',
  'icon_eu',
  'icon_d2',
  'gem_seamless',
  'gem_global',
  'gem_hrdps_continental',
  'meteofrance_seamless',
  'meteofrance_arpege_world',
  'ukmo_seamless',
  'ukmo_global_deterministic_10km',
  'jma_seamless',
  'jma_gsm',
  'cma_grapes_global',
  'bom_access_global',
  'kma_seamless',
  'knmi_seamless',
  'dmi_seamless',
];

export const OPEN_METEO_NOTEBOOK_MODELS = [
  'gfs_seamless',
  'ecmwf_ifs025',
  'icon_seamless',
  'gfs_hrrr',
];

function parseHourlyJson(text: string): {
  error?: boolean;
  reason?: string;
  latitude?: number | null;
  hourly?: {
    time?: string[];
    wind_speed_10m?: Array<number | null>;
    wind_direction_10m?: Array<number | null>;
    wind_gusts_10m?: Array<number | null>;
    precipitation?: Array<number | null>;
    et0_fao_evapotranspiration?: Array<number | null>;
    relative_humidity_2m?: Array<number | null>;
    soil_moisture_0_to_7cm?: Array<number | null>;
  };
} {
  const repaired = text
    .replace(/([:,[]\s*)-?nan\b/gi, '$1null')
    .replace(/([:,[]\s*)-?inf(inity)?\b/gi, '$1null');
  return JSON.parse(repaired) as ReturnType<typeof parseHourlyJson>;
}

async function fetchModelHour(
  lat: number,
  lon: number,
  model: string,
  hourIdx: number,
): Promise<WindSample | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    models: model,
    timezone: 'auto',
    wind_speed_unit: 'mph',
    forecast_days: '2',
    timeformat: 'iso8601',
  });
  try {
    const res = await fetch(`${FORECAST_URL}?${params}`);
    const data = parseHourlyJson(await res.text());
    if (!res.ok || data.error || data.latitude == null) return null;
    const times = data.hourly?.time ?? [];
    const idx = Math.min(Math.max(hourIdx, 0), Math.max(0, times.length - 1));
    const speed = data.hourly?.wind_speed_10m?.[idx];
    const dir = data.hourly?.wind_direction_10m?.[idx];
    const gust = data.hourly?.wind_gusts_10m?.[idx];
    if (
      typeof speed !== 'number' ||
      !Number.isFinite(speed) ||
      typeof dir !== 'number' ||
      !Number.isFinite(dir)
    ) {
      return null;
    }
    return {
      source: `open-meteo:${model}`,
      speed,
      dir,
      gust: typeof gust === 'number' && Number.isFinite(gust) ? gust : speed,
      time: times[idx],
    };
  } catch {
    return null;
  }
}

export const openMeteoProvider: WeatherProvider = {
  id: 'open-meteo',

  covers(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon);
  },

  async hourlyWind(lat, lon, hourOffsets) {
    const offset = hourOffsets[0] ?? 0;
    const results = await Promise.all(
      OPEN_METEO_ENSEMBLE_MODELS.map((m) =>
        fetchModelHour(lat, lon, m, offset),
      ),
    );
    return results.filter((r): r is WindSample => r != null);
  },

  async turfInputs(lat, lon): Promise<Partial<TurfInputs>> {
    const tryFetch = async (hourly: string) => {
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        hourly,
        past_days: '2',
        forecast_days: '1',
        precipitation_unit: 'inch',
        timezone: 'auto',
      });
      const res = await fetch(`${FORECAST_URL}?${params}`);
      if (!res.ok) return null;
      return parseHourlyJson(await res.text());
    };
    const data =
      (await tryFetch(
        'precipitation,et0_fao_evapotranspiration,relative_humidity_2m,soil_moisture_0_to_7cm',
      )) ??
      (await tryFetch(
        'precipitation,et0_fao_evapotranspiration,relative_humidity_2m',
      ));
    if (!data?.hourly) return {};
    const precip = data.hourly.precipitation ?? [];
    const et0 = data.hourly.et0_fao_evapotranspiration ?? [];
    const rh = data.hourly.relative_humidity_2m ?? [];
    const soil = data.hourly.soil_moisture_0_to_7cm ?? [];
    const last48 = Math.min(48, Math.max(precip.length, et0.length));
    const slice = <T,>(arr: T[], n: number) =>
      arr.slice(Math.max(0, arr.length - n));
    const sum = (arr: Array<number | null | undefined>): number =>
      arr.reduce<number>(
        (s, n) => s + (typeof n === 'number' && Number.isFinite(n) ? n : 0),
        0,
      );
    const lastNum = (arr: Array<number | null | undefined>): number | null => {
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        const v = arr[i];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
      return null;
    };
    return {
      precipIn48h: sum(slice(precip, last48)),
      et0Mm48h: sum(slice(et0, last48)),
      humidityPct: lastNum(rh) ?? undefined,
      soilMoisture: lastNum(soil),
    };
  },
};

/** Week-ahead afternoon wind for notebook when Open-Meteo is enabled. */
export async function openMeteoWeekAfternoons(
  lat: number,
  lon: number,
): Promise<
  Array<{
    source: string;
    ok: boolean;
    days: Map<string, { speed: number; dir: number; gust: number }>;
    reason?: string;
  }>
> {
  const AFTERNOON_HOUR = 14;
  return Promise.all(
    OPEN_METEO_NOTEBOOK_MODELS.map(async (model) => {
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        models: model,
        timezone: 'auto',
        wind_speed_unit: 'mph',
        forecast_days: '7',
        timeformat: 'iso8601',
      });
      try {
        const res = await fetch(`${FORECAST_URL}?${params}`);
        const data = parseHourlyJson(await res.text());
        if (!res.ok || data.error || data.latitude == null) {
          return {
            source: `open-meteo:${model}`,
            ok: false,
            days: new Map(),
            reason: data.reason ?? `HTTP ${res.status}`,
          };
        }
        const times = data.hourly?.time ?? [];
        const speeds = data.hourly?.wind_speed_10m ?? [];
        const dirs = data.hourly?.wind_direction_10m ?? [];
        const gusts = data.hourly?.wind_gusts_10m ?? [];
        const best = new Map<string, { idx: number; dist: number }>();
        for (let i = 0; i < times.length; i += 1) {
          const iso = times[i];
          if (!iso) continue;
          const date = iso.slice(0, 10);
          const hour = Number(iso.slice(11, 13));
          if (!Number.isFinite(hour)) continue;
          const dist = Math.abs(hour - AFTERNOON_HOUR);
          const prev = best.get(date);
          if (!prev || dist < prev.dist) best.set(date, { idx: i, dist });
        }
        const days = new Map<
          string,
          { speed: number; dir: number; gust: number }
        >();
        for (const [date, v] of best) {
          const speed = speeds[v.idx];
          const dir = dirs[v.idx];
          if (
            typeof speed !== 'number' ||
            !Number.isFinite(speed) ||
            typeof dir !== 'number' ||
            !Number.isFinite(dir)
          ) {
            continue;
          }
          const gust = gusts[v.idx];
          days.set(date, {
            speed,
            dir,
            gust:
              typeof gust === 'number' && Number.isFinite(gust) ? gust : speed,
          });
        }
        if (!days.size) {
          return {
            source: `open-meteo:${model}`,
            ok: false,
            days,
            reason: 'no afternoon wind',
          };
        }
        return { source: `open-meteo:${model}`, ok: true, days };
      } catch (err) {
        return {
          source: `open-meteo:${model}`,
          ok: false,
          days: new Map(),
          reason: err instanceof Error ? err.message : 'fetch failed',
        };
      }
    }),
  );
}
