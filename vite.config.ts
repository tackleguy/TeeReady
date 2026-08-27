import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const DEFAULT_DEV_API = 'https://tee-ready.vercel.app';
const DEFAULT_LLM_PROXY = 'http://127.0.0.1:1234';

/**
 * Dev API routing:
 * - default → proxy /api to production (course search, wind, live OSM soft-refresh)
 * - DEV_API_PROXY=http://127.0.0.1:3000 → local `vercel dev` (npm run dev:api)
 * - DEV_API_PROXY=none → no /api (static packs under /golf/* still work)
 *
 * Local LLM: `/llm` → LM Studio / Ollama (default http://127.0.0.1:1234) so the
 * browser uses same-origin requests and never hits mixed-content blocks.
 *
 * Hole lines / 3D greens / scorecards load from public/golf/* first; Prep paints
 * from packs without waiting on Overpass.
 */

function devApiStub(enabled: boolean): Plugin {
  return {
    name: 'teeready-dev-api-stub',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        res.statusCode = 503;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            error:
              'Local API disabled. Run with DEV_API_PROXY=https://tee-ready.vercel.app (default) or use `vercel dev`.',
            path: req.url,
          }),
        );
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyRaw = env.DEV_API_PROXY;
  const apiProxy =
    proxyRaw === 'none' || proxyRaw === 'false'
      ? undefined
      : proxyRaw || DEFAULT_DEV_API;

  const llmTarget = (env.SWING_LLM_PROXY || DEFAULT_LLM_PROXY).replace(
    /\/$/,
    '',
  );

  const proxy: Record<string, string | ProxyOptions> = {
    '/llm': {
      target: llmTarget,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/llm/, ''),
    },
  };
  if (apiProxy) {
    proxy['/api'] = { target: apiProxy, changeOrigin: true, secure: true };
  }

  return {
    plugins: [react(), devApiStub(!apiProxy)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy,
      watch: {
        ignored: ['**/api/**', '**/.vercel/**', '**/dist/**'],
      },
    },
    preview: {
      host: true,
      port: 4173,
      proxy,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('/three/') || id.includes('three/examples')) {
                return 'three';
              }
              if (id.includes('@mediapipe')) return 'mediapipe';
              if (id.includes('maplibre-gl')) return 'maplibre';
              if (id.includes('/motion/') || id.includes('framer-motion')) {
                return 'motion';
              }
              if (
                id.includes('react-router-dom') ||
                id.includes('@remix-run/router')
              )
                return 'router';
              if (id.includes('lucide-react')) return 'icons';
              if (id.includes('zustand') || id.includes('swr')) {
                return 'state';
              }
              if (id.includes('react-dom')) return 'react-dom';
              if (id.includes('/react/')) return 'react';
            }
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
  };
});
