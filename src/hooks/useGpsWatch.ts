/**
 * Continuous GPS watch for live shot tracking.
 * Uses watchPosition with high accuracy for on-course use.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GpsPosition {
  lat: number;
  lon: number;
  accuracyM: number;
  ts: number;
}

export function useGpsWatch(enabled: boolean) {
  const [position, setPosition] = useState<GpsPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
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
        setPosition({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          ts: pos.timestamp,
        });
        setError(null);
      },
      (err) => {
        setError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 },
    );
    return stop;
  }, [enabled, stop]);

  return { position, error, stop };
}
