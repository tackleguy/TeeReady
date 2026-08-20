// Debounced search against /api/geocode (Nominatim proxy). Returns
// suggestions for the current query; cancels in-flight requests when the
// query changes.

import { useEffect, useRef, useState } from 'react';

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
  bbox?: [number, number, number, number]; // [west, south, east, north]
}

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: string[]; // [south, north, west, east]
}

const DEBOUNCE_MS = 350;

export function useGeocode(query: string): {
  results: GeocodeResult[];
  loading: boolean;
} {
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (ctrlRef.current) ctrlRef.current.abort();
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(() => {
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      })
        .then((r) => r.json())
        .then((rows: NominatimItem[]) => {
          if (ctrl.signal.aborted) return;
          setResults(
            rows.map((r) => ({
              label: r.display_name,
              lat: parseFloat(r.lat),
              lon: parseFloat(r.lon),
              bbox: r.boundingbox
                ? [
                    parseFloat(r.boundingbox[2]),
                    parseFloat(r.boundingbox[0]),
                    parseFloat(r.boundingbox[3]),
                    parseFloat(r.boundingbox[1]),
                  ]
                : undefined,
            })),
          );
          setLoading(false);
        })
        .catch((err) => {
          if ((err as Error).name !== 'AbortError') setLoading(false);
        });
    }, DEBOUNCE_MS);
  }, [query]);

  return { results, loading };
}
