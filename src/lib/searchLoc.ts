/** Default map search origin — current city from localStorage or app seed. */

import { INITIAL_SEED } from '../constants/cities';

export type SearchLoc = {
  name: string;
  lat: number;
  lon: number;
};

const CITIES_KEY = 'cities-v1';

export function defaultSearchLoc(): SearchLoc {
  try {
    const raw = localStorage.getItem(CITIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Array<{
        name: string;
        latitude: number;
        longitude: number;
        isCurrent?: boolean;
      }>;
      const current = parsed.find((c) => c.isCurrent) ?? parsed[0];
      if (
        current &&
        typeof current.name === 'string' &&
        Number.isFinite(current.latitude) &&
        Number.isFinite(current.longitude)
      ) {
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

/** Persist home city for Courses / Map / TopNav and notify the shell. */
export function saveSearchLoc(loc: SearchLoc): SearchLoc {
  const name = loc.name.trim() || defaultSearchLoc().name;
  const next: SearchLoc = {
    name,
    lat: loc.lat,
    lon: loc.lon,
  };
  try {
    localStorage.setItem(
      CITIES_KEY,
      JSON.stringify([
        {
          name: next.name,
          latitude: next.lat,
          longitude: next.lon,
          isCurrent: true,
        },
      ]),
    );
    window.dispatchEvent(
      new CustomEvent('teeready-location-changed', { detail: next }),
    );
  } catch {
    // ignore
  }
  return next;
}

export function applyHomeCityToSearchLoc(input: {
  homeCity?: string;
  homeCityLat?: number | null;
  homeCityLon?: number | null;
}): void {
  const name = input.homeCity?.trim();
  if (
    !name ||
    input.homeCityLat == null ||
    input.homeCityLon == null ||
    !Number.isFinite(input.homeCityLat) ||
    !Number.isFinite(input.homeCityLon)
  ) {
    return;
  }
  saveSearchLoc({
    name,
    lat: input.homeCityLat,
    lon: input.homeCityLon,
  });
}
