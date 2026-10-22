/// <reference types="vite/client" />

// Best-effort service worker registration. Only runs in production
// builds; dev mode skips registration so HMR isn't fighting the cache.
// No hourly update polling — that was free traffic that still hits CDN/edge.

export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          registration.update().catch(() => undefined);
        })
        .catch(() => {
          // Registration failures are non-fatal.
        });
    },
    { once: true },
  );
}
