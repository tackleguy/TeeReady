import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const DEFAULT_DEV_API = 'https://tee-ready.vercel.app';

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

  const apiProxyConfig = apiProxy
    ? { '/api': { target: apiProxy, changeOrigin: true, secure: true } }
    : undefined;

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
  };
});
