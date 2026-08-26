/**
 * Pure GPS reliability helpers: accuracy gating, error messaging, signal status.
 * Kept free of React so Agent B can unit-test in node without UI edits.
 */

/** Reject / soften fixes worse than this horizontal accuracy (meters). */
export const GPS_ACCEPT_ACCURACY_M = 25;

export type GpsSignalStatus =
  | 'idle'
  | 'searching'
  | 'live'
  | 'signal_lost'
  | 'gps_off';

export type GpsFixAction = 'accept' | 'hold' | 'accept_soft';

export interface GpsFixDecision {
  action: GpsFixAction;
  /** Yardage / position should be labeled approximate. */
  approximate: boolean;
}

/**
 * Decide whether to apply a new fix.
 * - accuracy ≤ threshold → accept (precise)
 * - worse + have last good → hold last good, mark approximate
 * - worse + no last good → accept soft so the player is not stuck forever
 */
export function decideGpsFix(
  accuracyM: number,
  hasLastGood: boolean,
  thresholdM: number = GPS_ACCEPT_ACCURACY_M,
): GpsFixDecision {
  if (!Number.isFinite(accuracyM) || accuracyM < 0) {
    return hasLastGood
      ? { action: 'hold', approximate: true }
      : { action: 'accept_soft', approximate: true };
  }
  if (accuracyM <= thresholdM) {
    return { action: 'accept', approximate: false };
  }
  if (hasLastGood) {
    return { action: 'hold', approximate: true };
  }
  return { action: 'accept_soft', approximate: true };
}

/** GeolocationPositionError.code values. */
export const GPS_ERR_PERMISSION = 1;
export const GPS_ERR_UNAVAILABLE = 2;
export const GPS_ERR_TIMEOUT = 3;

export interface GpsErrorHandling {
  /** User-facing copy (never raw browser strings for permission). */
  message: string;
  /** Whether to schedule a retry with backoff. */
  retry: boolean;
  status: GpsSignalStatus;
}

export function handleGpsErrorCode(
  code: number,
  hasLastKnown: boolean,
): GpsErrorHandling {
  switch (code) {
    case GPS_ERR_PERMISSION:
      return {
        message:
          'Location is off for TeeReady. Enable location in your browser or phone Settings (Safari/Chrome → TeeReady → Location), then reload.',
        retry: false,
        status: 'gps_off',
      };
    case GPS_ERR_UNAVAILABLE:
      return {
        message: hasLastKnown
          ? 'GPS signal lost — showing last known position. Retrying…'
          : 'GPS unavailable. Retrying…',
        retry: true,
        status: hasLastKnown ? 'signal_lost' : 'searching',
      };
    case GPS_ERR_TIMEOUT:
      return {
        message: hasLastKnown
          ? 'GPS timed out — showing last known position. Retrying…'
          : 'GPS timed out. Retrying…',
        retry: true,
        status: hasLastKnown ? 'signal_lost' : 'searching',
      };
    default:
      return {
        message: hasLastKnown
          ? 'GPS error — showing last known position. Retrying…'
          : 'GPS error. Retrying…',
        retry: true,
        status: hasLastKnown ? 'signal_lost' : 'searching',
      };
  }
}

export function gpsStatusLabel(status: GpsSignalStatus): string {
  switch (status) {
    case 'searching':
      return 'Searching for GPS…';
    case 'live':
      return 'GPS live';
    case 'signal_lost':
      return 'Signal lost — showing last known';
    case 'gps_off':
      return 'GPS off';
    default:
      return 'GPS idle';
  }
}

/** Backoff steps for transient GPS errors (ms). */
export function gpsRetryDelayMs(attempt: number): number {
  const steps = [1_000, 2_000, 4_000, 8_000, 15_000];
  const i = Math.max(0, Math.min(attempt, steps.length - 1));
  return steps[i]!;
}

/** Soften quality display when holding an approximate / stale fix. */
export function effectiveGpsQuality<Q extends string>(
  accuracyM: number | null | undefined,
  approximate: boolean,
  qualityFn: (m: number | null | undefined) => Q,
): Q {
  const q = qualityFn(accuracyM);
  if (approximate && (q === 'excellent' || q === 'good')) {
    return 'fair' as Q;
  }
  return q;
}
