import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Set DEV_API_PROXY to a deployed origin to hit real /api routes locally, e.g.
//   DEV_API_PROXY=https://your-teeready.vercel.app npm run dev
const API_PROXY = process.env.DEV_API_PROXY;

function devApiStub(): Plugin {
  return {
    name: 'teeready-dev-api-stub',
    apply: 'serve',
    configureServer(server) {
      if (API_PROXY) return;
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        res.statusCode = 503;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            error:
              'API routes are only served via `vercel dev` or in production.',
            path: req.url,
          }),
        );
      });
    },
  };
}

const apiProxyConfig = API_PROXY
  ? { '/api': { target: API_PROXY, changeOrigin: true, secure: true } }
  : undefined;

export default defineConfig({
  plugins: [react(), devApiStub()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: apiProxyConfig,
    watch: {
      ignored: ['**/api/**', '**/.vercel/**', '**/dist/**'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('maplibre-gl')) return 'maplibre';
            if (id.includes('framer-motion')) return 'motion';
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
});
