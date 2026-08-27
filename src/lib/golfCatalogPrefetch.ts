/** Prefetch the public course catalog for faster first search. */

/** Full catalog URL — override with VITE_CATALOG_URL for CDN offload. */
function catalogUrl(): string {
  const raw = (import.meta.env as Record<string, string | undefined>)
    .VITE_CATALOG_URL;
  const trimmed = raw?.trim();
  return trimmed || '/golf/catalog.us.json';
}

const DB_NAME = 'teeready';
const STORE = 'catalog';
const STAMP_KEY = 'teeready-golf-catalog-at:v2';
const LEGACY_LS_KEY = 'teeready-golf-catalog:v1';
const TTL_MS = 7 * 24 * 60 * 60_000;

let inflight: Promise<void> | null = null;
let legacyPurged = false;

function purgeLegacyCatalogStorage(): void {
  if (legacyPurged) return;
  legacyPurged = true;
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    /* ignore */
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function readGolfCatalog(): Promise<unknown | null> {
  purgeLegacyCatalogStorage();
  try {
    const db = await openDb();
    const out = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get('us');
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return out ?? null;
  } catch {
    return null;
  }
}

export function warmGolfCatalog(): void {
  purgeLegacyCatalogStorage();
  // Static course packs — keep manifests hot so Prep/GPS resolve backups fast.
  void import('./golfCourseAssets').then((m) =>
    m.prefetchCourseAssetManifests(),
  );
  if (inflight) return;
  try {
    const at = Number(localStorage.getItem(STAMP_KEY));
    if (Number.isFinite(at) && Date.now() - at < TTL_MS) return;
  } catch {
    /* ignore */
  }

  inflight = fetch(catalogUrl())
    .then((res) => (res.ok ? res.json() : null))
    .then(async (data) => {
      if (!data) return;
      await idbPut('us', data);
      try {
        localStorage.setItem(STAMP_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
}
