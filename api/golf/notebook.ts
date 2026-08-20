// 7-day afternoon wind ensemble + yardage-book numbers (slope, altitude).
// Smaller model set than /api/golf/ensemble so a week of hours stays cheap.

import {
  aggregateWinds,
  altitudeBonusPct,
  clubPlan,
  holeWind,
  metersToFeet,
  playsLikeYards,
  seaLevelYards,
  slopeFor,
  type HoleIn,
  type PlayerIn,
} from './_lib/playsLike';

export const config = { runtime: 'edge' };

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

const NOTEBOOK_MODELS = [
  'gfs_seamless',
  'ecmwf_ifs025',
  'icon_seamless',
  'gfs_hrrr',
];

const AFTERNOON_HOUR = 14;

interface DayWind {
  date: string;
  windFromDeg: number;
  windMph: number;
  gustMph: number;
  agreement: number;
  modelsUsed: string[];
}

interface HoleNotebook {
  number: number;
  name?: string;
  par?: number;
  yards: number;
  bearingDeg: number;
  teeElevationFt: number | null;
  greenElevationFt: number | null;
  slopeYards: number;
  elevationChangeFt: number;
  seaLevelYards: number;
  days: Array<{
    date: string;
    aspect: string;
    headwindMph: number;
    playsLikeYards: number;
    recommendedClub: string;
    clubHint: string;
  }>;
}

function parseHourlyJson(text: string): {
  error?: boolean;
  reason?: string;
  latitude?: number | null;
  hourly?: {
    time?: string[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
  };
} {
  const repaired = text
    .replace(/([:,[]\s*)-?nan\b/gi, '$1null')
    .replace(/([:,[]\s*)-?inf(inity)?\b/gi, '$1null');
  return JSON.parse(repaired) as ReturnType<typeof parseHourlyJson>;
}

/** Index of the hour nearest 14:00 local for each calendar date. */
function afternoonIndexes(times: string[]): Map<string, number> {
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
  const out = new Map<string, number>();
  for (const [date, v] of best) out.set(date, v.idx);
  return out;
}

async function fetchModelWeek(
  lat: number,
  lon: number,
  model: string,
): Promise<{
  model: string;
  ok: boolean;
  days: Map<string, { speed: number; dir: number; gust: number }>;
  reason?: string;
}> {
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
        model,
        ok: false,
        days: new Map(),
        reason: data.reason ?? `HTTP ${res.status}`,
      };
    }
    const times = data.hourly?.time ?? [];
    const speeds = data.hourly?.wind_speed_10m ?? [];
    const dirs = data.hourly?.wind_direction_10m ?? [];
    const gusts = data.hourly?.wind_gusts_10m ?? [];
    const idxByDate = afternoonIndexes(times);
    const days = new Map<string, { speed: number; dir: number; gust: number }>();
    for (const [date, idx] of idxByDate) {
      const speed = speeds[idx];
      const dir = dirs[idx];
      if (
        typeof speed !== 'number' ||
        !Number.isFinite(speed) ||
        typeof dir !== 'number' ||
        !Number.isFinite(dir)
      ) {
        continue;
      }
      const gust = gusts[idx];
      days.set(date, {
        speed,
        dir,
        gust: typeof gust === 'number' && Number.isFinite(gust) ? gust : speed,
      });
    }
    if (!days.size) {
      return { model, ok: false, days, reason: 'no afternoon wind' };
    }
    return { model, ok: true, days };
  } catch (err) {
    return {
      model,
      ok: false,
      days: new Map(),
      reason: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}

async function fetchPointElevation(lat: number, lon: number): Promise<number | null> {
  try {
    const res = await fetch(
      `${ELEVATION_URL}?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lon))}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { elevation?: number[] };
    const m = data.elevation?.[0];
    return typeof m === 'number' && Number.isFinite(m) ? m : null;
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  let lat: number;
  let lon: number;
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
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: 'lat and lon required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [modelWeeks, pointElevM] = await Promise.all([
    Promise.all(NOTEBOOK_MODELS.map((m) => fetchModelWeek(lat, lon, m))),
    fetchPointElevation(lat, lon),
  ]);

  const okModels = modelWeeks.filter((m) => m.ok);
  const dates = new Set<string>();
  for (const m of okModels) {
    for (const d of m.days.keys()) dates.add(d);
  }
  const sortedDates = Array.from(dates).sort().slice(0, 7);

  const days: DayWind[] = sortedDates.map((date) => {
    const samples: Array<{ speed: number; dir: number; gust: number; model: string }> =
      [];
    for (const m of okModels) {
      const sample = m.days.get(date);
      if (!sample) continue;
      samples.push({ ...sample, model: m.model });
    }
    const agg = aggregateWinds(samples);
    return {
      date,
      windFromDeg: Math.round(agg.windFromDeg),
      windMph: Math.round(agg.windMph * 10) / 10,
      gustMph: Math.round(agg.gustMph * 10) / 10,
      agreement: Math.round(agg.agreement * 100) / 100,
      modelsUsed: samples.map((s) => s.model),
    };
  });

  const teeElevs = holes
    .map((h) => h.teeElevationM)
    .filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
  const meanTeeM =
    teeElevs.length > 0
      ? teeElevs.reduce((s, n) => s + n, 0) / teeElevs.length
      : pointElevM;
  const elevationFt =
    meanTeeM != null ? Math.round(metersToFeet(meanTeeM)) : 0;
  const altitudePct = Math.round(altitudeBonusPct(elevationFt) * 10) / 10;

  const holeRows: HoleNotebook[] = holes.map((hole) => {
    const { slopeYards, elevationChangeFt } = slopeFor(hole);
    const teeFt =
      typeof hole.teeElevationM === 'number'
        ? Math.round(metersToFeet(hole.teeElevationM))
        : null;
    const greenFt =
      typeof hole.greenElevationM === 'number'
        ? Math.round(metersToFeet(hole.greenElevationM))
        : null;
    const sea = seaLevelYards(hole.yards, elevationFt);
    return {
      number: hole.number,
      name: hole.name,
      par: hole.par,
      yards: hole.yards,
      bearingDeg: hole.bearingDeg,
      teeElevationFt: teeFt,
      greenElevationFt: greenFt,
      slopeYards,
      elevationChangeFt,
      seaLevelYards: sea,
      days: days.map((day) => {
        const wind = holeWind(
          day.windFromDeg,
          day.windMph,
          hole.bearingDeg,
          hole.yards,
        );
        const plays = playsLikeYards(
          hole.yards,
          wind.windAdjustmentYards,
          slopeYards,
          elevationFt,
        );
        const plan = clubPlan(hole, plays, player);
        return {
          date: day.date,
          aspect: wind.aspect,
          headwindMph: Math.round(wind.headwindMph * 10) / 10,
          playsLikeYards: plays,
          recommendedClub: plan.recommended,
          clubHint: plan.hint,
        };
      }),
    };
  });

  return new Response(
    JSON.stringify({
      lat,
      lon,
      generatedAt: new Date().toISOString(),
      elevationFt,
      altitudeBonusPct: altitudePct,
      days,
      holes: holeRows,
      modelsFailed: modelWeeks
        .filter((m) => !m.ok)
        .map((m) => ({ model: m.model, reason: m.reason })),
      attribution: 'Open-Meteo multi-model ensemble (CC BY 4.0)',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900, s-maxage=900',
      },
    },
  );
}
