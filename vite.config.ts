import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  completeCaddyPrompt,
  MAX_CADDY_SYSTEM,
  MAX_CADDY_USER,
  resolveCaddyUpstream,
} from './api/_lib/caddyLlm';

const DEFAULT_DEV_API = 'https://tee-ready.vercel.app';
const DEFAULT_LLM_PROXY = 'http://127.0.0.1:11434';

/**
 * Dev API routing:
 * - default → proxy /api to production (course search, wind, live OSM)
 * - /api/caddy is handled locally by Vite → Ollama (127.0.0.1:11434)
 * - DEV_API_PROXY=http://127.0.0.1:3000 → local `vercel dev`
 * - DEV_API_PROXY=none → no /api except local /api/caddy
 */

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function localOllamaCaddy(): Plugin {
  const handle = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const url = req.url?.split('?')[0];
    if (url !== '/api/caddy') return next();

    if (req.method === 'GET') {
      const up = await resolveCaddyUpstream({ preferOllama: true });
      sendJson(res, 200, {
        ok: true,
        configured: Boolean(up),
        backend: up?.base ?? null,
      });
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }

    let rec: Record<string, unknown> = {};
    try {
      const raw = await readBody(req);
      rec = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      sendJson(res, 400, { error: 'invalid json' });
      return;
    }

    const system = typeof rec.system === 'string' ? rec.system.trim() : '';
    const userText = typeof rec.userText === 'string' ? rec.userText.trim() : '';
    if (!system || !userText) {
      sendJson(res, 400, { error: 'system and userText required' });
      return;
    }
    if (system.length > MAX_CADDY_SYSTEM || userText.length > MAX_CADDY_USER) {
      sendJson(res, 413, { error: 'prompt too long' });
      return;
    }

    const temperature =
      typeof rec.temperature === 'number' && Number.isFinite(rec.temperature)
        ? Math.min(1, Math.max(0, rec.temperature))
        : 0.3;
    const maxTokens =
      typeof rec.maxTokens === 'number' && Number.isFinite(rec.maxTokens)
        ? Math.min(400, Math.max(40, Math.round(rec.maxTokens)))
        : 280;

    const result = await completeCaddyPrompt({
      system,
      userText,
      temperature,
      maxTokens,
      preferOllama: true,
    });
    if (!result.ok) {
      sendJson(res, result.status === 503 ? 503 : 502, {
        error: result.error ?? 'upstream llm failed',
        status: result.status,
      });
      return;
    }
    sendJson(res, 200, {
      text: result.text,
      model: result.model,
      source: 'llm',
    });
  };

  return {
    name: 'teeready-local-ollama-caddy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
  };
}

function devApiStub(enabled: boolean): Plugin {
  return {
    name: 'teeready-dev-api-stub',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/api/caddy') return next();
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
    proxy['/api'] = {
      target: apiProxy,
      changeOrigin: true,
      secure: true,
      bypass(req) {
        const url = req.url?.split('?')[0];
        if (url === '/api/caddy') return req.url || '/api/caddy';
      },
    };
  }

  return {
    plugins: [react(), localOllamaCaddy(), devApiStub(!apiProxy)],
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
