/** International OSM golf catalog — built by `scripts/build-world-catalog.mjs`. */

import type { UsCatalogEntry } from './usCatalog';
import catalogJson from './worldCatalog.json';

export type WorldCatalogEntry = UsCatalogEntry;

export const WORLD_CATALOG = catalogJson as WorldCatalogEntry[];
