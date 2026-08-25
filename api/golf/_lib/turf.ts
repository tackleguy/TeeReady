// Fairway / green firmness from recent rain, drying, and soil moisture.

export type Firmness = 'soft' | 'medium' | 'firm';

export type TurfConfidence = 'full' | 'partial';

export interface TurfReport {
  fairway: Firmness;
  green: Firmness;
  precipIn48h: number;
  et0Mm48h: number;
  humidityPct: number;
  soilMoisture: number | null;
  /** Extra driver roll vs a typical medium fairway. */
  fairwayRollYd: number;
  /** Extra run-out on a ~150 yd approach that lands on the green. */
  greenReleaseYd: number;
  note: string;
  /**
   * `full` when ET0 (and ideally soil) informed the estimate;
   * `partial` when firmness is inferred mainly from precipitation / humidity.
   */
  confidence: TurfConfidence;
}

function band(score: number): Firmness {
  if (score >= 22) return 'soft';
  if (score >= 8) return 'medium';
  return 'firm';
}

function label(f: Firmness): string {
  return f === 'firm' ? 'firm' : f === 'soft' ? 'soft / holding' : 'medium';
}

export function turfFromWeather(input: {
  precipIn48h: number;
  /** Omit or leave undefined when the provider has no ET0 — do not fake zeros. */
  et0Mm48h?: number | null;
  humidityPct?: number | null;
  soilMoisture?: number | null;
  windMph: number;
}): TurfReport {
  const precip = Math.max(0, input.precipIn48h);
  const hasEt0 =
    typeof input.et0Mm48h === 'number' && Number.isFinite(input.et0Mm48h);
  const et0 = hasEt0 ? Math.max(0, input.et0Mm48h!) : null;
  const hasHumidity =
    typeof input.humidityPct === 'number' && Number.isFinite(input.humidityPct);
  const humidity = hasHumidity
    ? Math.max(0, Math.min(100, input.humidityPct!))
    : 55;
  const soil =
    typeof input.soilMoisture === 'number' &&
    Number.isFinite(input.soilMoisture)
      ? input.soilMoisture
      : null;
  const wind = Math.max(0, input.windMph);
  const confidence: TurfConfidence = hasEt0 ? 'full' : 'partial';

  // When ET0/soil are missing, weight precip more and skip drying terms so we
  // do not pretend the course is firm just because ET0 defaulted to 0.
  const wet = hasEt0
    ? precip * 55 +
      (soil != null ? soil * 80 : 8) +
      Math.max(0, humidity - 55) * 0.35 -
      et0! * 1.6 -
      wind * 0.25
    : precip * 70 +
      Math.max(0, humidity - 55) * 0.45 -
      wind * 0.15 +
      (soil != null ? soil * 80 : 6);

  const fairway = band(wet);
  const green = band(
    hasEt0 ? wet + precip * 8 - et0! * 0.4 : wet + precip * 10,
  );

  const fairwayRollYd =
    fairway === 'firm' ? 12 : fairway === 'medium' ? 5 : 0;
  const greenReleaseYd =
    green === 'firm' ? 14 : green === 'medium' ? 6 : 1;

  const rainBit =
    precip >= 0.08
      ? `${precip.toFixed(2)} in of rain in 48h`
      : 'little rain in 48h';
  const partialBit =
    confidence === 'partial'
      ? ' Firmness estimated from precipitation alone (no ET0/soil).'
      : '';
  const note = `Fairways ${label(fairway)} (${rainBit}${
    fairwayRollYd ? `, +${fairwayRollYd} yd driver roll` : ', little extra roll'
  }). Greens ${label(green)} — approaches ${
    green === 'soft'
      ? 'should hold'
      : `release ~${greenReleaseYd} yd on a mid-iron`
  }.${partialBit}`;

  return {
    fairway,
    green,
    precipIn48h: Math.round(precip * 100) / 100,
    et0Mm48h: hasEt0 ? Math.round(et0! * 10) / 10 : 0,
    humidityPct: Math.round(humidity),
    soilMoisture:
      soil != null && Number.isFinite(soil)
        ? Math.round(soil * 1000) / 1000
        : null,
    fairwayRollYd,
    greenReleaseYd,
    note,
    confidence,
  };
}

export const DEFAULT_TURF: TurfReport = {
  ...turfFromWeather({
    precipIn48h: 0.1,
    humidityPct: 55,
    soilMoisture: null,
    windMph: 8,
  }),
  note: 'Checking rain and humidity for turf firmness…',
  confidence: 'partial',
};
