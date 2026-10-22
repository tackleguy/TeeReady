/** Live playability helpers — Open-Meteo client forecast (no Vercel CPU). */

import { bearingCompass } from './geo';

export type PlayHour = {
  time: string;
  offset: number;
  score: number;
  tempF: number | null;
  windMph: number;
  windFromDeg: number;
  gustMph: number;
  precipMm: number;
  summary: string;
};

export type HoursConfidence = 'full' | 'low' | 'single-source';

export type HoursResponse = {
  lat: number;
  lon: number;
  generatedAt: string;
  hours: PlayHour[];
  attribution: string;
  confidence?: HoursConfidence;
  confidenceNote?: string;
  conditionsHint?: string;
};

const OPEN_METEO_HOURS = 16;

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

function summarizeHour(input: {
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

type OpenMeteoHourly = {
  time?: string[];
  temperature_2m?: (number | null)[];
  precipitation?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  wind_direction_10m?: (number | null)[];
  wind_gusts_10m?: (number | null)[];
};

async function fetchOpenMeteoHours(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<HoursResponse> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: [
      'temperature_2m',
      'precipitation',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
    ].join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'mm',
    forecast_hours: String(OPEN_METEO_HOURS),
    timezone: 'auto',
  });
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params}`,
    { signal },
  );
  if (!res.ok) {
    throw new Error(`Open-Meteo ${res.status}`);
  }
  const body = (await res.json()) as { hourly?: OpenMeteoHourly };
  const hourly = body.hourly;
  const times = hourly?.time ?? [];
  const now = Date.now() - 30 * 60_000;
  const hours: PlayHour[] = [];
  for (let i = 0; i < times.length; i++) {
    const iso = times[i];
    if (!iso) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || t < now) continue;
    const tempRaw = hourly?.temperature_2m?.[i];
    const precipRaw = hourly?.precipitation?.[i];
    const windRaw = hourly?.wind_speed_10m?.[i];
    const dirRaw = hourly?.wind_direction_10m?.[i];
    const gustRaw = hourly?.wind_gusts_10m?.[i];
    if (typeof windRaw !== 'number' || !Number.isFinite(windRaw)) continue;
    const tempF =
      typeof tempRaw === 'number' && Number.isFinite(tempRaw)
        ? Math.round(tempRaw)
        : null;
    const precipMm =
      typeof precipRaw === 'number' && Number.isFinite(precipRaw)
        ? precipRaw
        : 0;
    const windMph = windRaw;
    const gustMph =
      typeof gustRaw === 'number' && Number.isFinite(gustRaw)
        ? Math.max(gustRaw, windMph)
        : windMph;
    const windFromDeg =
      typeof dirRaw === 'number' && Number.isFinite(dirRaw)
        ? ((dirRaw % 360) + 360) % 360
        : 0;
    const score = playabilityScore({ windMph, gustMph, precipMm, tempF });
    hours.push({
      time: iso,
      offset: hours.length,
      score,
      tempF,
      windMph: Math.round(windMph * 10) / 10,
      windFromDeg: Math.round(windFromDeg),
      gustMph: Math.round(gustMph * 10) / 10,
      precipMm: Math.round(precipMm * 10) / 10,
      summary: summarizeHour({ windMph, gustMph, precipMm, tempF, score }),
    });
    if (hours.length >= OPEN_METEO_HOURS) break;
  }
  if (!hours.length) {
    throw new Error('No hourly forecast for this location');
  }
  return {
    lat,
    lon,
    generatedAt: new Date().toISOString(),
    hours,
    attribution: 'Forecast · Open-Meteo',
    confidence: 'single-source',
    confidenceNote: 'Open-Meteo hourly · check the flag on arrival',
    conditionsHint: deriveConditionsHint(
      hours.map((h) => ({
        label: '',
        short: '',
        score: h.score,
        temp: h.tempF ?? 0,
        wind: '',
        summary: h.summary,
        time: h.time,
        precipMm: h.precipMm,
        gustMph: h.gustMph,
      })),
    ),
  };
}

function normalizeAttribution(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (Array.isArray(raw) && raw.length) {
    return raw.filter((x) => typeof x === 'string').join(' · ');
  }
  return '';
}

/** Display row used by Today + GateBoard. */
export type Hour = {
  label: string;
  short: string;
  score: number;
  temp: number;
  wind: string;
  summary: string;
  time: string;
  precipMm: number;
  gustMph: number;
};

export type HourGateStatus = 'open' | 'best' | 'closed';

export type HourGateRow = {
  id: string;
  time: string;
  label: string;
  score: number;
  summary: string;
  status?: HourGateStatus;
};

export type PlayVerdict = 'go' | 'lean' | 'wait';

/** Play-score colour ramp shared by bars, rings and badges. */
export function scoreColor(score: number): string {
  if (score >= 78) return '#14713f';
  if (score >= 60) return '#d9a83a';
  return '#d9714f';
}

export function playVerdict(score: number): PlayVerdict {
  if (score >= 78) return 'go';
  if (score >= 60) return 'lean';
  return 'wait';
}

export function playVerdictLabel(v: PlayVerdict): string {
  if (v === 'go') return 'Go play';
  if (v === 'lean') return 'Playable — pick your window';
  return 'Wait it out';
}

export function confidenceDisplay(
  confidence?: HoursConfidence,
  note?: string,
): string {
  if (note?.trim()) return note;
  if (confidence === 'full') return 'Models agree on the window';
  if (confidence === 'low') return 'Two sources — treat as a lean';
  if (confidence === 'single-source') {
    return 'Single source — check the flag on arrival';
  }
  return '';
}

function formatHourLabel(iso: string): { label: string; short: string } {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return { label: '—', short: '—' };
  }
  const label = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    hour12: true,
  });
  const hour = d.getHours();
  const h12 = hour % 12 || 12;
  const short = `${h12}${hour < 12 ? 'a' : 'p'}`;
  return { label, short };
}

export function toDisplayHours(hours: PlayHour[]): Hour[] {
  return hours.map((h) => {
    const { label, short } = formatHourLabel(h.time);
    const compass = bearingCompass(h.windFromDeg);
    return {
      label,
      short,
      score: h.score,
      temp: h.tempF ?? 0,
      wind: `${Math.round(h.windMph)} mph ${compass}`,
      summary: h.summary,
      time: h.time,
      precipMm: h.precipMm,
      gustMph: h.gustMph,
    };
  });
}

export function buildHourGateRows(
  hours: Hour[],
  bestShort: string,
): HourGateRow[] {
  return hours.map((h) => ({
    id: h.short,
    time: h.short.toUpperCase(),
    label: h.label,
    score: h.score,
    summary: `${h.summary} · ${h.wind}`,
    status:
      h.short === bestShort ? 'best' : h.score < 60 ? 'closed' : undefined,
  }));
}

export function bestWindowLabel(hours: Hour[]): string {
  if (!hours.length) return '';
  if (hours.length < 4) {
    const best = hours.reduce((a, b) => (b.score > a.score ? b : a));
    return `BEST ${best.short.toUpperCase()}`;
  }
  let bestStart = 0;
  let bestSum = -Infinity;
  for (let i = 0; i <= hours.length - 4; i++) {
    const sum =
      hours[i]!.score +
      hours[i + 1]!.score +
      hours[i + 2]!.score +
      hours[i + 3]!.score;
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = i;
    }
  }
  const start = hours[bestStart]!;
  const end = hours[Math.min(bestStart + 3, hours.length - 1)]!;
  return `BEST ${start.short.toUpperCase()}–${end.short.toUpperCase()}`;
}

/** Derive a turf outlook client-side if the API omitted conditionsHint. */
export function deriveConditionsHint(hours: Hour[]): string {
  if (!hours.length) return '';
  const precipSum = hours.reduce((s, h) => s + h.precipMm, 0);
  const maxGust = Math.max(...hours.map((h) => h.gustMph));
  const bits: string[] = [];
  if (precipSum >= 8) bits.push('Greens likely soft — hold approaches');
  else if (precipSum >= 2) bits.push('Expect some soft spots after showers');
  else if (precipSum < 0.5) {
    bits.push('Dry stretch — firmer fairways and more roll');
  } else bits.push('Mixed moisture — medium turf feel');
  if (maxGust >= 22) bits.push('gusty flags all day');
  else if (maxGust >= 16) bits.push('breezy windows');
  return bits.join(' · ');
}

export async function fetchPlayHours(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<HoursResponse> {
  // Prefer edge hours when live; fall back to Open-Meteo in the browser
  // so Weather stays useful under zero-compute / empty API responses.
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
    });
    const res = await fetch(`/api/golf/hours?${params}`, { signal });
    if (res.ok) {
      const body = (await res.json()) as HoursResponse & {
        attribution?: unknown;
      };
      if (Array.isArray(body.hours) && body.hours.length > 0) {
        return {
          ...body,
          attribution:
            normalizeAttribution(body.attribution) ||
            'Forecast · ensemble hours',
        };
      }
    }
  } catch {
    // fall through to Open-Meteo
  }
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  return fetchOpenMeteoHours(lat, lon, signal);
}
