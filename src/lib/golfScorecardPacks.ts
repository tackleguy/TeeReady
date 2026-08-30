/** Official scorecard packs shipped under /golf/scorecards (Tier-1 cards). */

export type ScorecardTeeYards = {
  hole: number;
  par: number;
  back?: number;
  mid?: number;
  front?: number;
  handicap?: number;
};

export interface ScorecardPack {
  slug: string;
  name: string;
  loop?: string | null;
  aliases?: string[];
  totalPar: number;
  holes: ScorecardTeeYards[];
  source?: string;
  builtAt?: string;
}

export interface ScorecardPackManifestEntry {
  slug: string;
  name: string;
  loop?: string | null;
  aliases?: string[];
  holes: number;
  totalPar?: number;
}

export interface ScorecardPackManifest {
  version: number;
  builtAt?: string;
  count: number;
  courses: ScorecardPackManifestEntry[];
}

function scorecardsBaseUrl(): string {
  const raw = (import.meta.env as Record<string, string | undefined>)
    .VITE_SCORECARDS_BASE_URL;
  const trimmed = raw?.trim().replace(/\/+$/, '');
  return trimmed || '/golf/scorecards';
}

let manifestPromise: Promise<ScorecardPackManifest | null> | null = null;
const packCache = new Map<string, Promise<ScorecardPack | null>>();

export function loadScorecardPackManifest(): Promise<ScorecardPackManifest | null> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(`${scorecardsBaseUrl()}/manifest.json`, {
    cache: 'no-store',
  })
    .then((res) =>
      res.ok ? (res.json() as Promise<ScorecardPackManifest>) : null,
    )
    .catch(() => null);
  return manifestPromise;
}

function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function matchEntry(
  manifest: ScorecardPackManifest | null,
  courseName: string | null | undefined,
  loop?: string | null,
): ScorecardPackManifestEntry | null {
  if (!manifest?.courses?.length || !courseName) return null;
  const n = normalizeName(courseName);
  const loopN = loop?.toLowerCase().trim() || null;

  const exact = manifest.courses.find((c) => {
    const names = [c.name, ...(c.aliases ?? [])].map(normalizeName);
    if (!names.includes(n) && !names.some((a) => n.includes(a) || a.includes(n))) {
      return false;
    }
    if (loopN && c.loop) return c.loop.toLowerCase() === loopN;
    return true;
  });
  return exact ?? null;
}

export async function resolveScorecardPackSlug(
  courseName: string | undefined | null,
  loop?: string | null,
): Promise<string | null> {
  const manifest = await loadScorecardPackManifest();
  return matchEntry(manifest, courseName, loop)?.slug ?? null;
}

export function loadScorecardPack(slug: string): Promise<ScorecardPack | null> {
  const hit = packCache.get(slug);
  if (hit) return hit;
  const pending = fetch(`${scorecardsBaseUrl()}/${slug}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<ScorecardPack>) : null))
    .catch(() => null);
  packCache.set(slug, pending);
  return pending;
}

export async function resolveScorecardPack(
  courseName: string | undefined | null,
  loop?: string | null,
): Promise<ScorecardPack | null> {
  const slug = await resolveScorecardPackSlug(courseName, loop);
  if (!slug) return null;
  return loadScorecardPack(slug);
}

export function prefetchScorecardPackManifest(): void {
  void loadScorecardPackManifest();
}

export async function resolveAndWarmScorecardPack(
  courseName: string | undefined | null,
  loop?: string | null,
): Promise<void> {
  const slug = await resolveScorecardPackSlug(courseName, loop);
  if (!slug) return;
  await loadScorecardPack(slug);
}
