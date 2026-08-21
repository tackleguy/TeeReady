/**
 * Continuous GPS watch for the on-course GPS mod.
 * High-accuracy watch with heading/speed when the device provides them.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { gpsQuality, type GpsQuality } from '../lib/gps';

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
  stop: () => void;
  locateOnce: () => void;
}

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

const ONCE_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

export function useGpsWatch(enabled: boolean): GpsWatchState {
  const [position, setPosition] = useState<GpsPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const locateOnce = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('GPS not available');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition(readPosition(pos));
        setError(null);
        setLocating(false);
      },
      (err) => {
        setError(err.message || 'GPS locate failed');
        setLocating(false);
      },
      ONCE_OPTS,
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    if (!('geolocation' in navigator)) {
      setError('GPS not available');
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition(readPosition(pos));
        setError(null);
        setLocating(false);
      },
      (err) => {
        setError(err.message || 'GPS error');
      },
      WATCH_OPTS,
    );
    return stop;
  }, [enabled, stop]);

  return {
    position,
    error,
    quality: gpsQuality(position?.accuracyM),
    locating,
    stop,
    locateOnce,
  };
}
