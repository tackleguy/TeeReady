// Fairway / green firmness from recent rain, drying, and soil moisture.

export type Firmness = 'soft' | 'medium' | 'firm';

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
  et0Mm48h: number;
  humidityPct: number;
  soilMoisture: number | null;
  windMph: number;
}): TurfReport {
  const precip = Math.max(0, input.precipIn48h);
  const et0 = Math.max(0, input.et0Mm48h);
  const humidity = Math.max(0, Math.min(100, input.humidityPct));
  const soil = input.soilMoisture;
  const wind = Math.max(0, input.windMph);

  const wet =
    precip * 55 +
    (soil != null ? soil * 80 : 8) +
    Math.max(0, humidity - 55) * 0.35 -
    et0 * 1.6 -
    wind * 0.25;

  const fairway = band(wet);
  const green = band(wet + precip * 8 - et0 * 0.4);

  const fairwayRollYd =
    fairway === 'firm' ? 12 : fairway === 'medium' ? 5 : 0;
  const greenReleaseYd =
    green === 'firm' ? 14 : green === 'medium' ? 6 : 1;

  const rainBit =
    precip >= 0.4
      ? `${precip.toFixed(2)} in of rain in 48h`
      : precip >= 0.08
        ? `${precip.toFixed(2)} in of rain in 48h`
        : 'little rain in 48h';
  const note = `Fairways ${label(fairway)} (${rainBit}${
    fairwayRollYd ? `, +${fairwayRollYd} yd driver roll` : ', little extra roll'
  }). Greens ${label(green)} — approaches ${
    green === 'soft'
      ? 'should hold'
      : `release ~${greenReleaseYd} yd on a mid-iron`
  }.`;

  return {
    fairway,
    green,
    precipIn48h: Math.round(precip * 100) / 100,
    et0Mm48h: Math.round(et0 * 10) / 10,
    humidityPct: Math.round(humidity),
    soilMoisture:
      soil != null && Number.isFinite(soil)
        ? Math.round(soil * 1000) / 1000
        : null,
    fairwayRollYd,
    greenReleaseYd,
    note,
  };
}

export const DEFAULT_TURF: TurfReport = turfFromWeather({
  precipIn48h: 0.1,
  et0Mm48h: 6,
  humidityPct: 55,
  soilMoisture: null,
  windMph: 8,
});
