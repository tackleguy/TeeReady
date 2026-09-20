/** Default map search origin — current city from localStorage or app seed. */

import { DEFAULT_CITIES, INITIAL_SEED } from '../constants/cities';
import type { City } from '../types';
import { haversineMi } from './workingCourses';

export type SearchLoc = {
  name: string;
  lat: number;
  lon: number;
};

const CITIES_KEY = 'cities-v1';

/** Nearest curated city to a lat/lon (favorite course, GPS fix, etc.). */
export function nearestCityTo(
  lat: number,
  lon: number,
  cities: City[] = DEFAULT_CITIES,
): City | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || cities.length === 0) {
    return null;
  }
  let best: City | null = null;
  let bestMi = Infinity;
  for (const city of cities) {
    const mi = haversineMi(lat, lon, city.latitude, city.longitude);
    if (mi < bestMi) {
      bestMi = mi;
      best = city;
    }
  }
  return best;
}

export function searchLocFromCoords(
  lat: number,
  lon: number,
  fallbackName?: string,
): SearchLoc {
  const near = nearestCityTo(lat, lon);
  return {
    name: near?.name ?? (fallbackName?.trim() || 'Nearby'),
    lat: near?.latitude ?? lat,
    lon: near?.longitude ?? lon,
  };
}

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

/**
 * Prefer home city; otherwise set search origin to the curated city nearest
 * the favorite (first) course when we have coordinates.
 */
export function applyFavoriteCourseCity(input: {
  homeCity?: string;
  homeCityLat?: number | null;
  homeCityLon?: number | null;
  courseLat?: number | null;
  courseLon?: number | null;
  courseRegion?: string | null;
}): SearchLoc | null {
  if (
    input.homeCity?.trim() &&
    input.homeCityLat != null &&
    input.homeCityLon != null &&
    Number.isFinite(input.homeCityLat) &&
    Number.isFinite(input.homeCityLon)
  ) {
    return saveSearchLoc({
      name: input.homeCity.trim(),
      lat: input.homeCityLat,
      lon: input.homeCityLon,
    });
  }
  if (
    input.courseLat == null ||
    input.courseLon == null ||
    !Number.isFinite(input.courseLat) ||
    !Number.isFinite(input.courseLon)
  ) {
    return null;
  }
  const near = nearestCityTo(input.courseLat, input.courseLon);
  const regionHint = input.courseRegion?.split(',')[0]?.trim();
  return saveSearchLoc({
    name: near?.name ?? regionHint ?? 'Nearby',
    lat: near?.latitude ?? input.courseLat,
    lon: near?.longitude ?? input.courseLon,
  });
}
