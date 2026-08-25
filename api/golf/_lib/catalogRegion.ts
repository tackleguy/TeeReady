import type { UsCatalogEntry } from '../_data/usCatalog';

export function formatCatalogRegion(entry: UsCatalogEntry): string | undefined {
  if (entry.co === 'US') {
    return [entry.ci, entry.st].filter(Boolean).join(', ') || undefined;
  }
  if (entry.co === 'CA') {
    return [entry.ci, entry.pr, 'Canada'].filter(Boolean).join(', ') || undefined;
  }
  if (entry.co === 'MX') {
    return [entry.ci, entry.pr, 'Mexico'].filter(Boolean).join(', ') || undefined;
  }
  return [entry.ci, entry.st ?? entry.pr].filter(Boolean).join(', ') || undefined;
}
