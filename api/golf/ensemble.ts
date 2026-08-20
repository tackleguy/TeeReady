// Multi-model wind ensemble + hole-by-hole golf brief.
// Median wind speed (vector mean cancels when models disagree) vs each
// hole’s tee→green bearing. Plays-like includes wind, slope, and altitude.

import {
  aggregateWinds,
  clubPlan,
  holeWind,
  metersToFeet,
  playsLikeYards,
  slopeFor,
  type HoleIn,
  type PlayerIn,
  type WindAspect,
} from './_lib/playsLike';
import { DEFAULT_TURF, turfFromWeather, type TurfReport } from './_lib/turf';

export const config = { runtime: 'edge' };

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Prefer high-skill globals + strong limited-area models from the app catalog. */
const ENSEMBLE_MODELS = [
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

interface HoleBrief {
  number: number;
  yards: number;
  bearingDeg: number;
  windFromDeg: number;
  windMph: number;
  gustMph: number;
  headwindMph: number;
  crosswindMph: number;
  driftYards: number;
  slopeYards: number;
  elevationChangeFt: number;
  windAdjustmentYards: number;
  playsLikeYards: number;
  aspect: WindAspect;
  tip: string;
  clubHint: string;
  recommendedClub: string;
  modelAgreement: number;
}

function tipFor(
  hole: HoleIn,
  aspect: WindAspect,
  windMph: number,
  head: number,
  cross: number,
  driftYards: number,
  slopeYards: number,
  player: PlayerIn,
  agreement: number,
): string {
  const conf =
    agreement >= 0.75
      ? 'Models agree'
      : agreement >= 0.5
        ? 'Models lean'
        : 'Models split';
  const pushSide = cross >= 0 ? 'right' : 'left';
  const aimSide = cross >= 0 ? 'left' : 'right';
  const crossAbs = Math.abs(cross);
  const driftAbs = Math.abs(Math.round(driftYards));
  const missAim =
    player.miss === 'right'
      ? 'Favor the left-center for your right miss.'
      : player.miss === 'left'
        ? 'Favor the right-center for your left miss.'
        : player.miss === 'both'
          ? 'Choose the widest target and avoid the short side.'
          : 'Use your normal start line.';
  const slope =
    Math.abs(slopeYards) >= 3
      ? ` It plays ${Math.abs(slopeYards)} yd ${slopeYards > 0 ? 'uphill' : 'downhill'}.`
      : '';

  if (windMph < 4) {
    return `${conf}: nearly calm on #${hole.number}.${slope} ${missAim}`;
  }

  let windTip: string;
  switch (aspect) {
    case 'head':
      windTip = `solid headwind (~${Math.round(head)} mph). Club up and flight it lower.`;
      break;
    case 'tail':
      windTip = `helping tailwind (~${Math.round(Math.abs(head))} mph). Expect extra release.`;
      break;
    case 'cross-L':
    case 'cross-R':
      windTip = `${Math.round(crossAbs)} mph crosswind pushes it ${pushSide} ~${driftAbs} yd; start ${aimSide}.`;
      break;
    case 'quarter-head':
      windTip = `quartering into you: ~${Math.round(head)} mph hold-up and ~${driftAbs} yd ${pushSide} drift.`;
      break;
    case 'quarter-tail':
      windTip = `quartering downwind with ~${driftAbs} yd ${pushSide} drift; start ${aimSide}.`;
      break;
  }
  return `${conf}: ${windTip}${slope} ${missAim}`;
}

async function fetchTurf(lat: number, lon: number, windMph: number): Promise<TurfReport> {
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
    return (await res.json()) as {
      hourly?: {
        precipitation?: Array<number | null>;
        et0_fao_evapotranspiration?: Array<number | null>;
        relative_humidity_2m?: Array<number | null>;
        soil_moisture_0_to_7cm?: Array<number | null>;
      };
    };
  };
  try {
    const data =
      (await tryFetch(
        'precipitation,et0_fao_evapotranspiration,relative_humidity_2m,soil_moisture_0_to_7cm',
      )) ??
      (await tryFetch(
        'precipitation,et0_fao_evapotranspiration,relative_humidity_2m',
      ));
    if (!data) return DEFAULT_TURF;
    const precip = data.hourly?.precipitation ?? [];
    const et0 = data.hourly?.et0_fao_evapotranspiration ?? [];
    const rh = data.hourly?.relative_humidity_2m ?? [];
    const soil = data.hourly?.soil_moisture_0_to_7cm ?? [];
    const last48 = Math.min(48, Math.max(precip.length, et0.length));
    const slice = <T,>(arr: T[], n: number) =>
      arr.slice(Math.max(0, arr.length - n));
    const sum = (arr: Array<number | null>) =>
      arr.reduce(
        (s, n) => s + (typeof n === 'number' && Number.isFinite(n) ? n : 0),
        0,
      );
    const lastNum = (arr: Array<number | null>) => {
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        const v = arr[i];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
      return null;
    };
    return turfFromWeather({
      precipIn48h: sum(slice(precip, last48)),
      et0Mm48h: sum(slice(et0, last48)),
      humidityPct: lastNum(rh) ?? 55,
      soilMoisture: lastNum(soil),
      windMph,
    });
  } catch {
    return DEFAULT_TURF;
  }
}

async function fetchModelHour(
  lat: number,
  lon: number,
  model: string,
  hourIdx: number,
): Promise<{
  model: string;
  ok: boolean;
  speed?: number;
  dir?: number;
  gust?: number;
  time?: string;
  reason?: string;
}> {
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
    const text = await res.text();
    const repaired = text
      .replace(/([:,[]\s*)-?nan\b/gi, '$1null')
      .replace(/([:,[]\s*)-?inf(inity)?\b/gi, '$1null');
    const data = JSON.parse(repaired) as {
      error?: boolean;
      reason?: string;
      latitude?: number | null;
      longitude?: number | null;
      hourly?: {
        time?: string[];
        wind_speed_10m?: (number | null)[];
        wind_direction_10m?: (number | null)[];
        wind_gusts_10m?: (number | null)[];
      };
    };
    if (!res.ok || data.error || data.latitude == null) {
      return { model, ok: false, reason: data.reason ?? `HTTP ${res.status}` };
    }
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
      return { model, ok: false, reason: 'no wind at hour' };
    }
    return {
      model,
      ok: true,
      speed,
      dir,
      gust: typeof gust === 'number' && Number.isFinite(gust) ? gust : speed,
      time: times[idx],
    };
  } catch (err) {
    return {
      model,
      ok: false,
      reason: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}

export default async function handler(req: Request): Promise<Response> {
  let lat: number;
  let lon: number;
  let hour = 0;
  let holes: HoleIn[] = [];
  let player: PlayerIn = {
    handicap: 18,
    miss: 'right',
    sevenIronYards: 150,
    driverYards: 225,
  };

  if (req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as {
      lat?: number;
      lon?: number;
      hour?: number;
      holes?: HoleIn[];
      player?: PlayerIn;
    } | null;
    if (!body) {
      return new Response(JSON.stringify({ error: 'invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    lat = Number(body.lat);
    lon = Number(body.lon);
    hour = Number(body.hour ?? 0);
    holes = Array.isArray(body.holes) ? body.holes : [];
    if (
      body.player &&
      Number.isFinite(body.player.handicap) &&
      Number.isFinite(body.player.sevenIronYards) &&
      Number.isFinite(body.player.driverYards)
    ) {
      player = body.player;
    }
  } else {
    const sp = new URL(req.url).searchParams;
    lat = Number(sp.get('lat'));
    lon = Number(sp.get('lon'));
    hour = Number(sp.get('hour') ?? 0);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: 'lat and lon required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [results, turfEarly] = await Promise.all([
    Promise.all(ENSEMBLE_MODELS.map((m) => fetchModelHour(lat, lon, m, hour))),
    fetchTurf(lat, lon, 8),
  ]);
  const ok = results.filter((r) => r.ok && r.speed != null && r.dir != null);
  const { windFromDeg, windMph, gustMph, agreement } = aggregateWinds(
    ok.map((r) => ({ speed: r.speed!, dir: r.dir!, gust: r.gust })),
  );
  const turf = turfFromWeather({
    precipIn48h: turfEarly.precipIn48h,
    et0Mm48h: turfEarly.et0Mm48h,
    humidityPct: turfEarly.humidityPct,
    soilMoisture: turfEarly.soilMoisture,
    windMph,
  });

  const teeElevs = holes
    .map((h) => h.teeElevationM)
    .filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
  const courseElevFt = teeElevs.length
    ? metersToFeet(teeElevs.reduce((s, m) => s + m, 0) / teeElevs.length)
    : 0;

  const briefs: HoleBrief[] = holes.map((hole) => {
    const wind = holeWind(windFromDeg, windMph, hole.bearingDeg, hole.yards);
    const { slopeYards, elevationChangeFt } = slopeFor(hole);
    const holeElevFt =
      typeof hole.teeElevationM === 'number' &&
      Number.isFinite(hole.teeElevationM)
        ? metersToFeet(hole.teeElevationM)
        : courseElevFt;
    const plays = playsLikeYards(
      hole.yards,
      wind.windAdjustmentYards,
      slopeYards,
      holeElevFt,
    );
    const plan = clubPlan(hole, plays, player);
    return {
      number: hole.number,
      yards: hole.yards,
      bearingDeg: hole.bearingDeg,
      windFromDeg: Math.round(windFromDeg),
      windMph: Math.round(windMph * 10) / 10,
      gustMph: Math.round(gustMph * 10) / 10,
      headwindMph: Math.round(wind.headwindMph * 10) / 10,
      crosswindMph: Math.round(wind.crosswindMph * 10) / 10,
      driftYards: Math.round(wind.driftYards),
      slopeYards,
      elevationChangeFt,
      windAdjustmentYards: Math.round(wind.windAdjustmentYards),
      playsLikeYards: plays,
      aspect: wind.aspect,
      tip: tipFor(
        hole,
        wind.aspect,
        windMph,
        wind.headwindMph,
        wind.crosswindMph,
        wind.driftYards,
        slopeYards,
        player,
        agreement,
      ),
      clubHint: plan.hint,
      recommendedClub: plan.recommended,
      modelAgreement: Math.round(agreement * 100) / 100,
    };
  });

  const summary =
    ok.length === 0
      ? 'No models returned wind for this location/hour.'
      : `Ensemble of ${ok.length} models: ${Math.round(windMph)} mph from ${Math.round(windFromDeg)}°` +
        (gustMph > windMph + 3 ? ` (gusts ${Math.round(gustMph)})` : '') +
        `. Agreement ${Math.round(agreement * 100)}%.` +
        (briefs.length
          ? ` Hole-by-hole tips use each hole’s tee→green bearing vs ensemble wind.`
          : '') +
        ` ${turf.note}`;

  return new Response(
    JSON.stringify({
      lat,
      lon,
      hour,
      time: ok[0]?.time ?? null,
      turf,
      ensemble: {
        windFromDeg: Math.round(windFromDeg),
        windMph: Math.round(windMph * 10) / 10,
        gustMph: Math.round(gustMph * 10) / 10,
        agreement: Math.round(agreement * 100) / 100,
        modelsUsed: ok.map((r) => r.model),
        modelsFailed: results.filter((r) => !r.ok).map((r) => ({
          model: r.model,
          reason: r.reason,
        })),
      },
      summary,
      holes: briefs,
      attribution: 'Open-Meteo multi-model ensemble (CC BY 4.0)',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    },
  );
}
