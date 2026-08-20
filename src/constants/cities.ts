import type { City } from '../types';

// Curated city catalogue. Entries are City-shaped so they drop straight into
// the carousel without an extra mapping step.
export const CITIES: Record<string, City> = {
  nyc: {
    id: 'seed-nyc',
    name: 'New York',
    region: 'New York',
    country: 'United States',
    countryCode: 'US',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
  },
  la: {
    id: 'seed-la',
    name: 'Los Angeles',
    region: 'California',
    country: 'United States',
    countryCode: 'US',
    latitude: 34.0522,
    longitude: -118.2437,
    timezone: 'America/Los_Angeles',
  },
  scottsdale: {
    id: 'seed-scottsdale',
    name: 'Scottsdale',
    region: 'Arizona',
    country: 'United States',
    countryCode: 'US',
    latitude: 33.4942,
    longitude: -111.9261,
    timezone: 'America/Phoenix',
  },
  chicago: {
    id: 'seed-chicago',
    name: 'Chicago',
    region: 'Illinois',
    country: 'United States',
    countryCode: 'US',
    latitude: 41.8781,
    longitude: -87.6298,
    timezone: 'America/Chicago',
  },
  sf: {
    id: 'seed-sf',
    name: 'San Francisco',
    region: 'California',
    country: 'United States',
    countryCode: 'US',
    latitude: 37.7749,
    longitude: -122.4194,
    timezone: 'America/Los_Angeles',
  },
  miami: {
    id: 'seed-miami',
    name: 'Miami',
    region: 'Florida',
    country: 'United States',
    countryCode: 'US',
    latitude: 25.7617,
    longitude: -80.1918,
    timezone: 'America/New_York',
  },
  seattle: {
    id: 'seed-seattle',
    name: 'Seattle',
    region: 'Washington',
    country: 'United States',
    countryCode: 'US',
    latitude: 47.6062,
    longitude: -122.3321,
    timezone: 'America/Los_Angeles',
  },
  denver: {
    id: 'seed-denver',
    name: 'Denver',
    region: 'Colorado',
    country: 'United States',
    countryCode: 'US',
    latitude: 39.7392,
    longitude: -104.9903,
    timezone: 'America/Denver',
  },
  london: {
    id: 'seed-london',
    name: 'London',
    region: 'England',
    country: 'United Kingdom',
    countryCode: 'GB',
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
  },
  paris: {
    id: 'seed-paris',
    name: 'Paris',
    country: 'France',
    countryCode: 'FR',
    latitude: 48.8566,
    longitude: 2.3522,
    timezone: 'Europe/Paris',
  },
  berlin: {
    id: 'seed-berlin',
    name: 'Berlin',
    country: 'Germany',
    countryCode: 'DE',
    latitude: 52.52,
    longitude: 13.405,
    timezone: 'Europe/Berlin',
  },
  tokyo: {
    id: 'seed-tokyo',
    name: 'Tokyo',
    country: 'Japan',
    countryCode: 'JP',
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: 'Asia/Tokyo',
  },
  sydney: {
    id: 'seed-sydney',
    name: 'Sydney',
    region: 'New South Wales',
    country: 'Australia',
    countryCode: 'AU',
    latitude: -33.8688,
    longitude: 151.2093,
    timezone: 'Australia/Sydney',
  },
  toronto: {
    id: 'seed-toronto',
    name: 'Toronto',
    region: 'Ontario',
    country: 'Canada',
    countryCode: 'CA',
    latitude: 43.6532,
    longitude: -79.3832,
    timezone: 'America/Toronto',
  },
};

// Cities pre-loaded into the carousel on first run.
export const INITIAL_SEED_IDS: ReadonlyArray<keyof typeof CITIES> = [
  'nyc',
  'la',
  'scottsdale',
  'london',
  'tokyo',
];

// Quick-add chips shown in the search modal's empty state.
export const SUGGESTED_CITY_IDS: ReadonlyArray<keyof typeof CITIES> = [
  'nyc',
  'la',
  'chicago',
  'miami',
  'london',
  'paris',
  'tokyo',
  'sydney',
];

export const INITIAL_SEED: City[] = INITIAL_SEED_IDS.map((id) => CITIES[id]);
export const SUGGESTED_CITIES: City[] = SUGGESTED_CITY_IDS.map(
  (id) => CITIES[id],
);
export const DEFAULT_CITIES: City[] = Object.values(CITIES);

export function shouldUseNWS(city: Pick<City, 'countryCode'>): boolean {
  return city.countryCode === 'US';
}
