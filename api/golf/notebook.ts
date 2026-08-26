// 7-day afternoon wind from configured providers + yardage-book numbers.

import {
  attributionFor,
  elevationMeter,
  openMeteoWeekAfternoons,
  providersFor,
  type EnsembleConfidence,
  type WindSample,
} from '../_lib/weather';
import { configuredProviderIds } from '../_lib/weather/registry';
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
import { MAX_POST_HOLES, rateLimit, RATE } from '../_lib/rateLimit';

export const config = { runtime: 'edge' };

const AFTERNOON_HOUR = 14;

interface DayWind {
  date: string;
  windFromDeg: number;
  windMph: number;
  gustMph: number;
  agreement: number | null;
  confidence: EnsembleConfidence;
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

function honesty(
  sourceCount: number,
  rawAgreement: number,
): { agreement: number | null; confidence: EnsembleConfidence } {
  if (sourceCount <= 1) {
    return { agreement: null, confidence: 'single-source' };
  }
  if (sourceCount === 2) {
    return {
      agreement: Math.round(rawAgreement * 100) / 100,
      confidence: 'low',
    };
  }
  return {
    agreement: Math.round(rawAgreement * 100) / 100,
    confidence: 'full',
  };
}

async function providerWeekAfternoons(
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
  const providers = providersFor(lat, lon).filter((p) => p.id !== 'open-meteo');
  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        // One provider fetch covers the whole week; ask for every hour so we
        // can pick the afternoon sample per calendar date.
        const offsets = Array.from({ length: 7 * 24 }, (_, i) => i);
        const samples = await p.hourlyWind(lat, lon, offsets);
        const days = new Map<
          string,
          { speed: number; dir: number; gust: number }
        >();
        // Prefer local-afternoon-ish: pick sample closest to 14:00 UTC offset
        // per calendar date from the returned times.
        const byDate = new Map<string, WindSample[]>();
        for (const s of samples) {
          if (!s.time) continue;
          const date = s.time.slice(0, 10);
          const list = byDate.get(date) ?? [];
          list.push(s);
          byDate.set(date, list);
        }
        for (const [date, list] of byDate) {
          let best = list[0]!;
          let bestDist = Infinity;
          for (const s of list) {
            const hour = Number((s.time ?? '').slice(11, 13));
            const dist = Number.isFinite(hour)
              ? Math.abs(hour - AFTERNOON_HOUR)
              : 99;
            if (dist < bestDist) {
              bestDist = dist;
              best = s;
            }
          }
          days.set(date, {
            speed: best.speed,
            dir: best.dir,
            gust: best.gust,
          });
        }
        if (!days.size) {
          return {
            source: p.id,
            ok: false,
            days,
            reason: 'no afternoon wind',
          };
        }
        return { source: p.id, ok: true, days };
      } catch (err) {
        return {
          source: p.id,
          ok: false,
          days: new Map(),
          reason: err instanceof Error ? err.message : 'fetch failed',
        };
      }
    }),
  );

  const openMeteoOn =
    configuredProviderIds().includes('open-meteo') ||
    configuredProviderIds().includes('openmeteo');
  if (openMeteoOn) {
    const om = await openMeteoWeekAfternoons(lat, lon);
    results.push(...om);
  }
  return results;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const limited = rateLimit(req, RATE.notebook);
  if (limited) return limited;

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
    if (holes.length > MAX_POST_HOLES) {
      return new Response(
        JSON.stringify({
          error: `holes capped at ${MAX_POST_HOLES}`,
          max: MAX_POST_HOLES,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        },
      );
    }
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
    providerWeekAfternoons(lat, lon),
    elevationMeter(lat, lon),
  ]);

  const okModels = modelWeeks.filter((m) => m.ok);
  const dates = new Set<string>();
  for (const m of okModels) {
    for (const d of m.days.keys()) dates.add(d);
  }
  const sortedDates = Array.from(dates).sort().slice(0, 7);

  const days: DayWind[] = sortedDates.map((date) => {
    const samples: Array<{
      speed: number;
      dir: number;
      gust: number;
      model: string;
    }> = [];
    for (const m of okModels) {
      const sample = m.days.get(date);
      if (!sample) continue;
      samples.push({ ...sample, model: m.source });
    }
    const agg = aggregateWinds(samples);
    const unique = new Set(samples.map((s) => s.model.split(':')[0]!));
    const { agreement, confidence } = honesty(unique.size, agg.agreement);
    return {
      date,
      windFromDeg: Math.round(agg.windFromDeg),
      windMph: Math.round(agg.windMph * 10) / 10,
      gustMph: Math.round(agg.gustMph * 10) / 10,
      agreement,
      confidence,
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

  const usedSources = days.flatMap((d) => d.modelsUsed);

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
        .map((m) => ({ model: m.source, reason: m.reason })),
      attribution: attributionFor(usedSources),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900, s-maxage=900',
      },
    },
  );
}
