import { nwsProvider } from './nws';
import { metnoProvider } from './metno';
import { openMeteoProvider } from './openMeteo';
import type { WeatherProvider } from './types';

const ALL: Record<string, WeatherProvider> = {
  nws: nwsProvider,
  metno: metnoProvider,
  'open-meteo': openMeteoProvider,
  openmeteo: openMeteoProvider,
};

function openMeteoEnabled(): boolean {
  return process.env.OPEN_METEO_ENABLED === 'true';
}

/** Enabled provider ids from WEATHER_PROVIDERS (default nws,metno). */
export function configuredProviderIds(): string[] {
  const raw = process.env.WEATHER_PROVIDERS?.trim();
  const ids = (raw || 'nws,metno')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return ids.filter((id) => {
    if (id === 'open-meteo' || id === 'openmeteo') return openMeteoEnabled();
    return id in ALL;
  });
}

/** Providers that are enabled and cover this coordinate. */
export function providersFor(lat: number, lon: number): WeatherProvider[] {
  return configuredProviderIds()
    .map((id) => ALL[id])
    .filter((p): p is WeatherProvider => Boolean(p && p.covers(lat, lon)));
}

export function attributionFor(sourceIds: string[]): string {
  const unique = [...new Set(sourceIds.map((s) => s.split(':')[0]!))];
  const labels: string[] = [];
  for (const id of unique) {
    if (id === 'nws') labels.push('NWS (api.weather.gov)');
    else if (id === 'metno') labels.push('MET Norway (CC BY 4.0)');
    else if (id === 'open-meteo')
      labels.push('Open-Meteo multi-model (CC BY 4.0)');
  }
  return labels.length
    ? labels.join(' · ')
    : 'No weather providers returned data';
}
