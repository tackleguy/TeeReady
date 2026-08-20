export type TempUnit = 'fahrenheit' | 'celsius';
export type WindUnit = 'mph' | 'kmh';
export type DistanceUnit = 'mi' | 'km';
export type PrecipUnit = 'inch' | 'mm';
export type ThemeId = 'dark' | 'light' | 'auto' | 'midnight' | 'sand';
export type MapStyleId = 'dark' | 'liberty' | 'positron' | 'bright';

export interface Settings {
  temp: TempUnit;
  wind: WindUnit;
  distance: DistanceUnit;
  precip: PrecipUnit;
  theme: ThemeId;
  mapStyle: MapStyleId;
  /** Prefer Ollama / local LLM for storm chase mode. */
  localAiEnabled?: boolean;
  localAiUrl?: string;
  localAiModel?: string;
  /** Optional public Dom 3 / chase-vehicle JSON or GeoJSON feed URL. */
  dom3FeedUrl?: string;
  /** JSON map of famous-chaser id → feed URL overrides. */
  chaserFeedsJson?: string;
}

export interface City {
  id: string;
  name: string;
  region?: string;
  country?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  isCurrent?: boolean;
}

export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  admin2?: string;
  timezone?: string;
}

// ── Canonical normalized weather data ──────────────────────────────────────
//
// Every numeric field is finite and uses the canonical unit listed below.
// Display layers convert at render time. Validation runs before any consumer
// sees a WeatherData; if anything is missing or impossible, normalize throws.

export interface WeatherData {
  location: {
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
    timezone: string;
  };
  fetchedAt: number;

  current: {
    temp: number; // °F
    feelsLike: number; // °F
    code: number; // WMO 0-99
    conditionLabel: string;
    isDay: boolean;
    humidity: number; // 1-100
    dewPoint: number; // °F
    windSpeed: number; // mph
    windGust: number; // mph
    windDirection: string; // 'NNE' …
    windDirectionDeg: number; // 0-360
    pressure: number; // inHg
    visibility: number; // miles
    uvIndex: number; // 0-11+
  };

  today: {
    high: number; // °F
    low: number; // °F
    sunrise: string; // ISO with offset
    sunset: string; // ISO with offset
    precipProbMax: number; // 0-100
  };

  hourly: Array<{
    time: string;
    temp: number; // °F
    code: number;
    isDay: boolean;
    precipProb: number; // 0-100
    windSpeed: number; // mph
    windGust: number; // mph
  }>;

  daily: Array<{
    date: string; // YYYY-MM-DD local
    high: number; // °F
    low: number; // °F
    code: number;
    sunrise: string;
    sunset: string;
    precipProbMax: number;
    windGustMax?: number; // mph
    summary: string;
  }>;

  sourceMeta: {
    forecast: 'open-meteo' | 'nws';
    observations: 'open-meteo' | 'nws' | 'mixed';
    gapsFilled: string[];
  };
}

// ── Raw API shapes ─────────────────────────────────────────────────────────

export interface OpenMeteoRaw {
  latitude: number;
  longitude: number;
  timezone: string;
  timezone_abbreviation: string;
  utc_offset_seconds: number;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: 0 | 1;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    pressure_msl: number;
    cloud_cover: number;
    visibility: number;
    uv_index: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
    precipitation: number[];
    is_day: number[];
    wind_speed_10m: number[];
    wind_gusts_10m?: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max?: number[];
    wind_direction_10m_dominant: number[];
  };
}

export interface AirQualityResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    time: string;
    us_aqi: number;
    pm2_5: number;
    pm10: number;
    carbon_monoxide: number;
    nitrogen_dioxide: number;
    ozone: number;
  };
  current_units: Record<string, string>;
}

export interface WeatherAlert {
  id: string;
  event: string;
  severity: string;
  headline: string;
  description: string;
  areaDesc: string;
  effective: string;
  expires: string;
}

// ── Bundle returned by useWeather ──────────────────────────────────────────

export interface WeatherSnapshot {
  data: WeatherData;
  airQuality?: AirQualityResponse;
  alerts: WeatherAlert[];
}
