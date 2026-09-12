import type { UsCatalogEntry } from '../_data/usCatalog';

const COUNTRY_LABEL: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  MX: 'Mexico',
  GB: 'United Kingdom',
  IE: 'Ireland',
  AU: 'Australia',
  NZ: 'New Zealand',
  JP: 'Japan',
  KR: 'South Korea',
  ES: 'Spain',
  PT: 'Portugal',
  FR: 'France',
  DE: 'Germany',
  IT: 'Italy',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  NL: 'Netherlands',
  BE: 'Belgium',
  CH: 'Switzerland',
  AT: 'Austria',
  ZA: 'South Africa',
};

export function formatCatalogRegion(entry: UsCatalogEntry): string | undefined {
  if (entry.co === 'US' || !entry.co) {
    return [entry.ci, entry.st].filter(Boolean).join(', ') || undefined;
  }
  const country = COUNTRY_LABEL[entry.co] ?? entry.co;
  const region = entry.pr ?? entry.st;
  return [entry.ci, region, country].filter(Boolean).join(', ') || country;
}
