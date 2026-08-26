/** Live playability helpers for Today — never use fabricated hour tables. */

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
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });
  const res = await fetch(`/api/golf/hours?${params}`, { signal });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        'Live conditions API is not deployed yet — retry after deploy, or run vercel dev locally.',
      );
    }
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || `hours ${res.status}`);
  }
  return (await res.json()) as HoursResponse;
}
