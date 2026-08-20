/// <reference types="vite/client" />

// Best-effort service worker registration. Only runs in production
// builds; dev mode skips registration so HMR isn't fighting the cache.

export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  // `once: true` so the listener detaches itself after firing. The
  // hourly `update()` interval below is intentionally retained for the
  // page's lifetime — it's how the SW notices a new build.
  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          // Pick up a new sw.js as soon as the tab loads (not only hourly).
          registration.update().catch(() => undefined);
          window.setInterval(
            () => {
              registration.update().catch(() => undefined);
            },
            60 * 60_000,
          );
        })
        .catch(() => {
          // Registration failures are non-fatal.
        });
    },
    { once: true },
  );
}
