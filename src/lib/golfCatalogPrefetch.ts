/** Prefetch the public course catalog for faster first search. */

const CATALOG_URL = '/golf/catalog.us.json';
const LS_KEY = 'teeready-golf-catalog:v1';
const TTL_MS = 7 * 24 * 60 * 60_000;

let inflight: Promise<void> | null = null;

export function warmGolfCatalog(): void {
  if (inflight) return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number };
      if (Date.now() - parsed.at < TTL_MS) return;
    }
  } catch {
    /* ignore */
  }

  inflight = fetch(CATALOG_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), data }));
      } catch {
        /* quota */
      }
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
}
