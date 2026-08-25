/** Shared weather-provider contracts for ensemble / notebook / turf. */

export interface WindSample {
  /** Provider or model id, e.g. `nws` or `open-meteo:gfs_seamless`. */
  source: string;
  /** Wind from direction, degrees meteorological. */
  dir: number;
  /** Sustained wind speed, mph. */
  speed: number;
  /** Gust speed, mph (falls back to speed when unknown). */
  gust: number;
  /** ISO timestamp of the sample when known. */
  time?: string;
}

export interface TurfInputs {
  precipIn48h: number;
  et0Mm48h: number;
  humidityPct: number;
  soilMoisture: number | null;
}

export interface WeatherProvider {
  id: string;
  covers(lat: number, lon: number): boolean;
  /**
   * Wind samples for the requested hour offsets from "now" (0 = current hour).
   * Providers may return one sample per offset, or skip offsets they lack.
   */
  hourlyWind(
    lat: number,
    lon: number,
    hourOffsets: number[],
  ): Promise<WindSample[]>;
  turfInputs?(lat: number, lon: number): Promise<Partial<TurfInputs>>;
  elevationMeters?(
    points: Array<{ lat: number; lon: number }>,
  ): Promise<Array<number | null>>;
}

export type EnsembleConfidence = 'full' | 'low' | 'single-source';

export function weatherUserAgent(): string {
  return (
    process.env.NWS_USER_AGENT ??
    process.env.METNO_USER_AGENT ??
    'TeeReady/1.0 (https://tee-ready.vercel.app; contact@teeready.app)'
  );
}
