// Multi-provider wind ensemble + hole-by-hole golf brief.
// Median wind speed (vector mean cancels when sources disagree) vs each
// hole’s tee→green bearing. Plays-like includes wind, slope, and altitude.

import {
  attributionFor,
  providersFor,
  type EnsembleConfidence,
  type TurfInputs,
  type WindSample,
} from '../_lib/weather';
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
  modelAgreement: number | null;
}

function forecastConfidenceLabel(agreement: number | null): string {
  if (agreement == null) {
    return 'Only one forecast available right now';
  }
  if (agreement >= 0.75) {
    return 'Forecasts agree';
  }
  if (agreement >= 0.5) {
    return 'Forecasts lean that way';
  }
  return 'Forecasts disagree';
}

function agreementSummary(agreement: number | null): string {
  if (agreement == null) {
    return ' Only one forecast available right now.';
  }
  if (agreement >= 0.75) {
    return ' Forecasts mostly agree.';
  }
  if (agreement >= 0.5) {
    return ' Forecasts partly agree.';
  }
  return ' Forecasts disagree — treat this as a rough read.';
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
  agreement: number | null,
): string {
  const conf = forecastConfidenceLabel(agreement);
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
      windTip = `Wind into you and across: ~${Math.round(head)} mph hold-up and ~${driftAbs} yd ${pushSide} drift.`;
      break;
    case 'quarter-tail':
      windTip = `Wind behind you and across: ~${driftAbs} yd ${pushSide} drift; start ${aimSide}.`;
      break;
  }
  return `${conf}: ${windTip}${slope} ${missAim}`;
}

function honesty(
  sourceCount: number,
  rawAgreement: number,
): { agreement: number | null; confidence: EnsembleConfidence } {
  if (sourceCount <= 0) {
    return { agreement: null, confidence: 'single-source' };
  }
  if (sourceCount === 1) {
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

async function gatherTurf(
  lat: number,
  lon: number,
  windMph: number,
): Promise<TurfReport> {
  const providers = providersFor(lat, lon);
  const parts = await Promise.all(
    providers.map(async (p) => {
      if (!p.turfInputs) return {} as Partial<TurfInputs>;
      try {
        return await p.turfInputs(lat, lon);
      } catch {
        return {} as Partial<TurfInputs>;
      }
    }),
  );
  let precipIn48h = 0;
  let precipFound = false;
  let et0Mm48h: number | undefined;
  let humidityPct: number | undefined;
  let soilMoisture: number | null | undefined;
  for (const part of parts) {
    if (typeof part.precipIn48h === 'number' && Number.isFinite(part.precipIn48h)) {
      precipIn48h = Math.max(precipIn48h, part.precipIn48h);
      precipFound = true;
    }
    if (
      typeof part.et0Mm48h === 'number' &&
      Number.isFinite(part.et0Mm48h) &&
      et0Mm48h == null
    ) {
      et0Mm48h = part.et0Mm48h;
    }
    if (
      typeof part.humidityPct === 'number' &&
      Number.isFinite(part.humidityPct) &&
      humidityPct == null
    ) {
      humidityPct = part.humidityPct;
    }
    if (
      part.soilMoisture != null &&
      Number.isFinite(part.soilMoisture) &&
      soilMoisture == null
    ) {
      soilMoisture = part.soilMoisture;
    }
  }
  if (!precipFound && humidityPct == null && et0Mm48h == null) {
    return DEFAULT_TURF;
  }
  return turfFromWeather({
    precipIn48h,
    et0Mm48h,
    humidityPct,
    soilMoisture: soilMoisture ?? null,
    windMph,
  });
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

  const providers = providersFor(lat, lon);
  const hourOffsets = [hour];

  const [sampleGroups, turfEarly] = await Promise.all([
    Promise.all(
      providers.map(async (p) => {
        try {
          const samples = await p.hourlyWind(lat, lon, hourOffsets);
          return { id: p.id, samples, error: null as string | null };
        } catch (err) {
          return {
            id: p.id,
            samples: [] as WindSample[],
            error: err instanceof Error ? err.message : 'fetch failed',
          };
        }
      }),
    ),
    gatherTurf(lat, lon, 8),
  ]);

  const okSamples: WindSample[] = [];
  const modelsUsed: string[] = [];
  const modelsFailed: Array<{ model: string; reason?: string }> = [];
  for (const group of sampleGroups) {
    if (group.error) {
      modelsFailed.push({ model: group.id, reason: group.error });
      continue;
    }
    if (!group.samples.length) {
      modelsFailed.push({ model: group.id, reason: 'no wind at hour' });
      continue;
    }
    for (const s of group.samples) {
      okSamples.push(s);
      modelsUsed.push(s.source);
    }
  }

  const agg = aggregateWinds(
    okSamples.map((r) => ({ speed: r.speed, dir: r.dir, gust: r.gust })),
  );
  const uniqueSources = new Set(okSamples.map((s) => s.source.split(':')[0]!));
  const { agreement, confidence } = honesty(uniqueSources.size, agg.agreement);
  const windFromDeg = agg.windFromDeg;
  const windMph = agg.windMph;
  const gustMph = agg.gustMph;

  const turf = turfFromWeather({
    precipIn48h: turfEarly.precipIn48h,
    et0Mm48h:
      turfEarly.confidence === 'full' ? turfEarly.et0Mm48h : undefined,
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
      modelAgreement: agreement,
    };
  });

  const summary =
    okSamples.length === 0
      ? 'No weather forecasts returned wind for this location and hour.'
      : `Based on ${uniqueSources.size} forecast${uniqueSources.size === 1 ? '' : 's'}: ${Math.round(windMph)} mph from ${Math.round(windFromDeg)}°` +
        (gustMph > windMph + 3 ? ` (gusts ${Math.round(gustMph)})` : '') +
        agreementSummary(agreement) +
        (briefs.length
          ? ` Hole tips use wind along each tee-to-green line.`
          : '') +
        ` ${turf.note}`;

  return new Response(
    JSON.stringify({
      lat,
      lon,
      hour,
      time: okSamples[0]?.time ?? null,
      turf,
      ensemble: {
        windFromDeg: Math.round(windFromDeg),
        windMph: Math.round(windMph * 10) / 10,
        gustMph: Math.round(gustMph * 10) / 10,
        agreement,
        confidence,
        modelsUsed,
        modelsFailed,
      },
      summary,
      holes: briefs,
      attribution: attributionFor(modelsUsed),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    },
  );
}
