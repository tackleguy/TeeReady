// Daytime hourly playability for Today — NWS + MET Norway ensemble wind,
// MET Norway temp/precip. Never returns fabricated hours.

import {
  attributionFor,
  providersFor,
  type WindSample,
  weatherUserAgent,
} from '../_lib/weather';
import { aggregateWinds } from './_lib/playsLike';
import { rateLimit, RATE } from '../_lib/rateLimit';

export const config = { runtime: 'edge' };

const HOUR_COUNT = 14;

interface MetNoRow {
  time?: string;
  data?: {
    instant?: {
      details?: {
        air_temperature?: number;
        wind_from_direction?: number;
        wind_speed?: number;
        wind_speed_of_gust?: number;
      };
    };
    next_1_hours?: {
      details?: { precipitation_amount?: number };
      summary?: { symbol_code?: string };
    };
  };
}

export type HoursConfidence = 'full' | 'low' | 'single-source';

export interface PlayHour {
  time: string;
  offset: number;
  score: number;
  tempF: number | null;
  windMph: number;
  windFromDeg: number;
  gustMph: number;
  precipMm: number;
  summary: string;
}

function q4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function msToMph(ms: number): number {
  return ms * 2.236936;
}

function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

async function fetchMetNo(lat: number, lon: number): Promise<MetNoRow[]> {
  const res = await fetch(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${q4(lat)}&lon=${q4(lon)}`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': weatherUserAgent(),
      },
    },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as {
    properties?: { timeseries?: MetNoRow[] };
  };
  return body.properties?.timeseries ?? [];
}

function nearestMetRow(
  rows: MetNoRow[],
  targetMs: number,
  maxSkewMs = 90 * 60_000,
): MetNoRow | null {
  let best: MetNoRow | null = null;
  let bestDist = Infinity;
  for (const row of rows) {
    if (!row.time) continue;
    const t = Date.parse(row.time);
    if (!Number.isFinite(t)) continue;
    const d = Math.abs(t - targetMs);
    if (d < bestDist) {
      bestDist = d;
      best = row;
    }
  }
  return bestDist <= maxSkewMs ? best : null;
}

/** Transparent playability score from wind / gust / precip / temp. */
export function playabilityScore(input: {
  windMph: number;
  gustMph: number;
  precipMm: number;
  tempF: number | null;
}): number {
  let score = 92;
  const wind = input.windMph;
  if (wind > 8) score -= (wind - 8) * 2.2;
  if (wind > 15) score -= (wind - 15) * 1.8;
  const gustExtra = Math.max(0, input.gustMph - wind);
  if (gustExtra > 3) score -= gustExtra * 1.4;
  if (input.precipMm > 0.1) score -= Math.min(35, input.precipMm * 18);
  if (input.tempF != null) {
    if (input.tempF < 45) score -= (45 - input.tempF) * 1.2;
    if (input.tempF > 92) score -= (input.tempF - 92) * 1.1;
    if (input.tempF < 32) score -= 15;
  }
  return Math.max(0, Math.min(99, Math.round(score)));
}

function summarize(input: {
  windMph: number;
  gustMph: number;
  precipMm: number;
  tempF: number | null;
  score: number;
}): string {
  const parts: string[] = [];
  if (input.precipMm >= 1) parts.push('Rain likely');
  else if (input.precipMm >= 0.2) parts.push('Light rain risk');
  if (input.gustMph >= input.windMph + 6 && input.gustMph >= 18) {
    parts.push('Gusty');
  } else if (input.windMph >= 18) {
    parts.push('Windy');
  } else if (input.windMph <= 7) {
    parts.push('Calm');
  } else {
    parts.push('Breezy');
  }
  if (input.tempF != null) {
    if (input.tempF < 48) parts.push('chilly');
    else if (input.tempF > 90) parts.push('hot');
    else if (input.score >= 78) parts.push('good for golf');
  } else if (input.score >= 78) {
    parts.push('good for golf');
  }
  return parts.join(', ') || 'Playable conditions';
}

/** Greens/fairway outlook from forecast precip — honest, not a stimp. */
export function conditionsHint(hours: PlayHour[]): string {
  if (!hours.length) return 'No conditions outlook yet.';
  const precipSum = hours.reduce((s, h) => s + h.precipMm, 0);
  const maxGust = Math.max(...hours.map((h) => h.gustMph));
  const bits: string[] = [];
  if (precipSum >= 8) {
    bits.push('Greens likely soft — hold approaches');
  } else if (precipSum >= 2) {
    bits.push('Expect some soft spots after showers');
  } else if (precipSum < 0.5) {
    bits.push('Dry stretch — firmer fairways and more roll');
  } else {
    bits.push('Mixed moisture — medium turf feel');
  }
  if (maxGust >= 22) bits.push('gusty flags all day');
  else if (maxGust >= 16) bits.push('breezy windows');
  return bits.join(' · ');
}

function hoursConfidence(sourceIds: string[]): HoursConfidence {
  const unique = new Set(sourceIds.map((s) => s.split(':')[0]!));
  if (unique.size >= 3) return 'full';
  if (unique.size === 2) return 'low';
  return 'single-source';
}

export function confidenceLabel(c: HoursConfidence): string {
  if (c === 'full') return 'Models agree on the window';
  if (c === 'low') return 'Two sources — treat as a lean';
  return 'Single source — check the flag on arrival';
}

export default async function handler(req: Request): Promise<Response> {
  const limited = rateLimit(req, RATE.hours);
  if (limited) return limited;

  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get('lat'));
  const lon = Number(sp.get('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: 'lat and lon required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  const providers = providersFor(lat, lon);
  const offsets = Array.from({ length: HOUR_COUNT }, (_, i) => i);
  const floorHour = Math.floor(Date.now() / 3_600_000) * 3_600_000;

  const [sampleGroups, metRows] = await Promise.all([
    Promise.all(
      providers.map(async (p) => {
        try {
          return await p.hourlyWind(lat, lon, offsets);
        } catch {
          return [] as WindSample[];
        }
      }),
    ),
    fetchMetNo(lat, lon).catch(() => [] as MetNoRow[]),
  ]);

  const byOffset = new Map<number, WindSample[]>();
  const modelsUsed: string[] = [];
  for (const samples of sampleGroups) {
    for (const s of samples) {
      if (!s.time) continue;
      const t = Date.parse(s.time);
      if (!Number.isFinite(t)) continue;
      const offset = Math.round((t - floorHour) / 3_600_000);
      if (offset < 0 || offset >= HOUR_COUNT) continue;
      const list = byOffset.get(offset) ?? [];
      list.push(s);
      byOffset.set(offset, list);
      modelsUsed.push(s.source);
    }
  }

  // If ensemble wind missed an hour, fall back to MET Norway wind alone.
  for (const offset of offsets) {
    if (byOffset.has(offset)) continue;
    const target = floorHour + offset * 3_600_000;
    const row = nearestMetRow(metRows, target);
    const d = row?.data?.instant?.details;
    if (
      !d ||
      typeof d.wind_speed !== 'number' ||
      typeof d.wind_from_direction !== 'number'
    ) {
      continue;
    }
    const speed = msToMph(d.wind_speed);
    const gustMs = d.wind_speed_of_gust;
    byOffset.set(offset, [
      {
        source: 'metno',
        speed,
        dir: ((d.wind_from_direction % 360) + 360) % 360,
        gust:
          typeof gustMs === 'number' && Number.isFinite(gustMs)
            ? Math.max(msToMph(gustMs), speed)
            : speed,
        time: row?.time ?? new Date(target).toISOString(),
      },
    ]);
    modelsUsed.push('metno');
  }

  const hours: PlayHour[] = [];
  for (const offset of offsets) {
    const samples = byOffset.get(offset);
    if (!samples?.length) continue;
    const agg = aggregateWinds(
      samples.map((r) => ({ speed: r.speed, dir: r.dir, gust: r.gust })),
    );
    const target = floorHour + offset * 3_600_000;
    const met = nearestMetRow(metRows, target);
    const tempC = met?.data?.instant?.details?.air_temperature;
    const tempF =
      typeof tempC === 'number' && Number.isFinite(tempC)
        ? Math.round(cToF(tempC))
        : null;
    const precipRaw =
      met?.data?.next_1_hours?.details?.precipitation_amount ?? 0;
    const precipMm =
      typeof precipRaw === 'number' && Number.isFinite(precipRaw)
        ? precipRaw
        : 0;
    const score = playabilityScore({
      windMph: agg.windMph,
      gustMph: agg.gustMph,
      precipMm,
      tempF,
    });
    hours.push({
      time: samples[0]?.time ?? new Date(target).toISOString(),
      offset,
      score,
      tempF,
      windMph: Math.round(agg.windMph * 10) / 10,
      windFromDeg: Math.round(agg.windFromDeg),
      gustMph: Math.round(agg.gustMph * 10) / 10,
      precipMm: Math.round(precipMm * 10) / 10,
      summary: summarize({
        windMph: agg.windMph,
        gustMph: agg.gustMph,
        precipMm,
        tempF,
        score,
      }),
    });
  }

  if (!hours.length) {
    return new Response(
      JSON.stringify({
        error: 'No hourly forecasts available for this location',
        lat,
        lon,
        hours: [],
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const confidence = hoursConfidence(modelsUsed);

  return new Response(
    JSON.stringify({
      lat,
      lon,
      generatedAt: new Date().toISOString(),
      hours,
      confidence,
      confidenceNote: confidenceLabel(confidence),
      conditionsHint: conditionsHint(hours),
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
