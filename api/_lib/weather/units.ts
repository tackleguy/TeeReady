/** Speed / precip unit helpers for weather providers. */

export function toMph(value: number, uom: string | undefined): number {
  if (!Number.isFinite(value)) return value;
  const u = (uom ?? '').toLowerCase();
  if (
    u.includes('km_h') ||
    u.includes('km/h') ||
    u.includes('kilometer') ||
    u === 'kmh'
  ) {
    return value * 0.621371;
  }
  if (
    u.includes('m_s') ||
    u.includes('m/s') ||
    u.includes('meter') ||
    u === 'ms'
  ) {
    return value * 2.236936;
  }
  if (u.includes('mi_h') || u.includes('mph') || u.includes('mile')) {
    return value;
  }
  // NWS default for windSpeed/windGust is often km/h when uom omitted historically.
  if (!u) return value * 0.621371;
  return value;
}

export function mmToInches(mm: number): number {
  return mm / 25.4;
}

/** Expand ISO-8601 interval like `2024-01-01T12:00:00+00:00/PT3H` into hourly starts. */
export function expandIsoInterval(validTime: string): Date[] {
  const [startRaw, durationRaw] = validTime.split('/');
  if (!startRaw) return [];
  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) return [];
  if (!durationRaw) return [start];

  const hours = parseIsoDurationHours(durationRaw);
  if (hours <= 0) return [start];
  const out: Date[] = [];
  for (let h = 0; h < hours; h += 1) {
    out.push(new Date(start.getTime() + h * 3_600_000));
  }
  return out;
}

function parseIsoDurationHours(raw: string): number {
  // PT3H, PT1H30M, P1DT2H — wind grids are almost always whole hours.
  const m = raw.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return 1;
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const mins = Number(m[3] ?? 0);
  const secs = Number(m[4] ?? 0);
  const total = days * 24 + hours + mins / 60 + secs / 3600;
  return Math.max(1, Math.round(total));
}
