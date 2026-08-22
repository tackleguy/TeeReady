/** Default map search origin — current city from localStorage or app seed. */

import { INITIAL_SEED } from '../constants/cities';

export type SearchLoc = {
  name: string;
  lat: number;
  lon: number;
};

export function defaultSearchLoc(): SearchLoc {
  try {
    const raw = localStorage.getItem('cities-v1');
    if (raw) {
      const parsed = JSON.parse(raw) as Array<{
        name: string;
        latitude: number;
        longitude: number;
        isCurrent?: boolean;
      }>;
      const current = parsed.find((c) => c.isCurrent) ?? parsed[0];
      if (current) {
        return {
          name: current.name,
          lat: current.latitude,
          lon: current.longitude,
        };
      }
    }
  } catch {
    // ignore
  }
  const seed = INITIAL_SEED[0];
  return {
    name: seed?.name ?? 'Kansas City',
    lat: seed?.latitude ?? 39.1,
    lon: seed?.longitude ?? -94.6,
  };
}
