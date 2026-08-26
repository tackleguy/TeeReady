/**
 * Continuous GPS watch for the on-course GPS mod.
 * High-accuracy watch with heading/speed, accuracy filtering, error recovery,
 * wake lock, and stale marking after backgrounding.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { gpsQuality, type GpsQuality } from '../lib/gps';
import {
  decideGpsFix,
  effectiveGpsQuality,
  GPS_ACCEPT_ACCURACY_M,
  gpsRetryDelayMs,
  gpsStatusLabel,
  handleGpsErrorCode,
  type GpsSignalStatus,
} from '../lib/gpsReliability';
import { useWakeLock } from './useWakeLock';

export interface GpsPosition {
  lat: number;
  lon: number;
  accuracyM: number;
  headingDeg: number | null;
  speedMps: number | null;
  ts: number;
}

export interface GpsWatchState {
  position: GpsPosition | null;
  error: string | null;
  quality: GpsQuality;
  locating: boolean;
  /** Distinct signal mode for HUD: searching / live / signal_lost / gps_off / idle. */
  status: GpsSignalStatus;
  /** Short label for status (searching, signal lost, etc.). */
  statusLabel: string;
  /** True when holding last good through a poor fix — treat yardage as approximate. */
  approximate: boolean;
  /** True after returning from background until a fresh fix arrives. */
  stale: boolean;
  wakeLockSupported: boolean;
  wakeLockActive: boolean;
  /** Set screen timeout manually when Wake Lock API is absent. */
  wakeLockMessage: string | null;
  stop: () => void;
  locateOnce: () => void;
}

export type { GpsSignalStatus };
export { GPS_ACCEPT_ACCURACY_M };

function readPosition(pos: GeolocationPosition): GpsPosition {
  const heading = pos.coords.heading;
  const speed = pos.coords.speed;
  return {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    accuracyM: pos.coords.accuracy,
    headingDeg:
      heading != null && Number.isFinite(heading) && heading >= 0
        ? heading
        : null,
    speedMps: speed != null && Number.isFinite(speed) && speed >= 0 ? speed : null,
    ts: pos.timestamp,
  };
}

const WATCH_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 2_000,
  timeout: 15_000,
};

/** Fallback after timeouts — slightly more permissive age. */
const WATCH_OPTS_FALLBACK: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 20_000,
};

const ONCE_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

export function useGpsWatch(enabled: boolean): GpsWatchState {
  const [position, setPosition] = useState<GpsPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState<GpsSignalStatus>('idle');
  const [approximate, setApproximate] = useState(false);
  const [stale, setStale] = useState(false);

  const watchId = useRef<number | null>(null);
  const lastGoodRef = useRef<GpsPosition | null>(null);
  const positionRef = useRef<GpsPosition | null>(null);
  const permissionDeniedRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const useFallbackOptsRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const wake = useWakeLock(enabled);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current != null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const clearWatch = useCallback(() => {
    if (watchId.current != null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearRetry();
    clearWatch();
  }, [clearRetry, clearWatch]);

  const applyFix = useCallback((next: GpsPosition) => {
    const decision = decideGpsFix(
      next.accuracyM,
      lastGoodRef.current != null,
      GPS_ACCEPT_ACCURACY_M,
    );
    setError(null);
    setStale(false);
    setLocating(false);
    retryAttemptRef.current = 0;
    useFallbackOptsRef.current = false;

    if (decision.action === 'accept') {
      lastGoodRef.current = next;
      positionRef.current = next;
      setPosition(next);
      setApproximate(false);
      setStatus('live');
      return;
    }

    if (decision.action === 'hold') {
      // Keep last good coords; mark yardage approximate.
      setApproximate(true);
      setStatus('live');
      return;
    }

    // accept_soft — no last good yet
    positionRef.current = next;
    setPosition(next);
    setApproximate(true);
    setStatus('live');
  }, []);

  const onWatchError = useCallback(
    (err: GeolocationPositionError) => {
      const hasLast = positionRef.current != null;
      const handled = handleGpsErrorCode(err.code, hasLast);
      setError(handled.message);
      setStatus(handled.status);
      setLocating(handled.status === 'searching');

      if (!handled.retry) {
        permissionDeniedRef.current = true;
        clearRetry();
        clearWatch();
        return;
      }

      // Transient: restart watch with backoff (and softer opts after timeout).
      if (err.code === 3 /* TIMEOUT */) {
        useFallbackOptsRef.current = true;
      }
      clearWatch();
      clearRetry();
      const attempt = retryAttemptRef.current;
      retryAttemptRef.current = attempt + 1;
      const delay = gpsRetryDelayMs(attempt);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (!enabledRef.current || permissionDeniedRef.current) return;
        startWatchRef.current();
      }, delay);
    },
    [clearRetry, clearWatch],
  );

  const startWatchRef = useRef<() => void>(() => undefined);

  const startWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError(
        'GPS is not available on this device. Enable location services if possible.',
      );
      setStatus('gps_off');
      return;
    }
    if (permissionDeniedRef.current) return;
    clearWatch();
    const opts = useFallbackOptsRef.current ? WATCH_OPTS_FALLBACK : WATCH_OPTS;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => applyFix(readPosition(pos)),
      onWatchError,
      opts,
    );
  }, [applyFix, clearWatch, onWatchError]);

  startWatchRef.current = startWatch;

  const locateOnce = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('GPS is not available on this device.');
      setStatus('gps_off');
      return;
    }
    if (permissionDeniedRef.current) {
      const handled = handleGpsErrorCode(1, positionRef.current != null);
      setError(handled.message);
      setStatus('gps_off');
      return;
    }
    setLocating(true);
    if (status === 'idle' || status === 'gps_off') setStatus('searching');
    navigator.geolocation.getCurrentPosition(
      (pos) => applyFix(readPosition(pos)),
      (err) => onWatchError(err),
      ONCE_OPTS,
    );
  }, [applyFix, onWatchError, status]);

  // Start / stop watch when enabled flips.
  useEffect(() => {
    if (!enabled) {
      stop();
      permissionDeniedRef.current = false;
      retryAttemptRef.current = 0;
      useFallbackOptsRef.current = false;
      setStatus('idle');
      setLocating(false);
      setStale(false);
      // Keep last position in state for when they re-enable; clear approximate noise.
      return;
    }

    if (!('geolocation' in navigator)) {
      setError(
        'GPS is not available on this device. Enable location services if possible.',
      );
      setStatus('gps_off');
      return;
    }

    permissionDeniedRef.current = false;
    if (positionRef.current == null) {
      setStatus('searching');
      setLocating(true);
    }
    startWatch();

    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !enabledRef.current) return;
      // Never present minutes-old coords as current.
      if (positionRef.current != null) {
        setStale(true);
      }
      // Re-establish watch if the browser killed it while backgrounded.
      if (watchId.current == null && !permissionDeniedRef.current) {
        if (positionRef.current == null) {
          setStatus('searching');
          setLocating(true);
        } else {
          setStatus('signal_lost');
        }
        startWatchRef.current();
      } else if (watchId.current != null) {
        // Watch still listed — force a fresh cycle after iOS suspend quirks.
        clearWatch();
        startWatchRef.current();
      }
      // Wake lock re-acquire is handled inside useWakeLock.
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [enabled, startWatch, stop, clearWatch]);

  const quality = effectiveGpsQuality(
    position?.accuracyM,
    approximate || stale,
    gpsQuality,
  );

  return {
    position,
    error,
    quality,
    locating,
    status,
    statusLabel: gpsStatusLabel(status),
    approximate,
    stale,
    wakeLockSupported: wake.supported,
    wakeLockActive: wake.active,
    wakeLockMessage: wake.message,
    stop,
    locateOnce,
  };
}
