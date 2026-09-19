# TeeReady

Golf planning, course maps, weather, swing analysis, and multiplayer groups. React + Vite frontend with Vercel Edge API handlers and Supabase accounts.

## Local setup

Use Node 22.12+ (`nvm use`) and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev:offline
```

Fill in the public Supabase URL and publishable/anon key to enable accounts. Never put a service-role key or an upstream API secret in a `VITE_` variable. `npm run dev` proxies non-caddy API requests to the existing production site by default; use `DEV_API_PROXY=http://127.0.0.1:3000` with `vercel dev` to test your own backend. Local caddy uses Ollama.

```sh
npm run check       # frontend + API types, regression tests, golf/coach tests
npm run build       # catalog generation, contrast audit, production bundle
npm run preview -- --host 127.0.0.1
npm run smoke       # routes and asset content types
npm run test:browser # desktop and mobile route smoke (Playwright Chromium)
```

Install the browser with `npx playwright install chromium`. On a workstation with Chrome, `PLAYWRIGHT_CHANNEL=chrome npm run test:browser` uses it. The browser smoke mocks API failures and checks that routes render without uncaught exceptions; it does not prove live weather, account, camera, GPS, or multiplayer functionality.

## Production deployment

Deploy this repository to Vercel with `npm ci`, build command `npm run build`, output directory `dist`, and Node 22. The `api/` directory contains Edge handlers; a static-only host cannot run these endpoints. Configure environment variables separately for preview and production before building.

Required launch configuration:

- Set the Supabase public client variables; configure the site URL and allowed email confirmation redirects for your real domain. Test signup, confirmation, sign-in, sign-out, and two-user data isolation on a preview deployment.
- Provision the database from `supabase/migrations` for a fresh installation. These files are snapshots of an existing remote history; do not blindly replay them against an existing database. The group snapshot now creates its membership table before the helper function that queries it and grants access to the private helper schema. It also prevents members from taking group ownership or moving their membership into an uninvited group. Compare those changes with the live schema. PGlite tests cover fresh installation and basic RLS; live Supabase configuration and Realtime still require verification.
- Set `NWS_USER_AGENT` to a real identifying contact. Review provider usage rights and capacity; keep `OPEN_METEO_ENABLED=false` for the default production setup. Public Nominatim's global limits cannot be enforced by per-isolate throttling; configure an approved geocoding service before high-volume use.
- Configure a supported caddy model and its server-only provider key. Public caddy requests consume your provider budget. Enable hosting-level distributed rate limits and provider spending limits before public launch. The in-process limiter is only best effort and resets across isolates/deployments.
- Verify all course asset packs are present in the deployed output. Raw `public/golf/osm` backups are intentionally excluded by `.vercelignore`; greens, holes, scorecards, and their manifests are required. Budget disk space for the repository and the copied build output.
- Enable auth abuse controls, email delivery, database backups, error monitoring, and alerts for API failures, upstream latency, and quota exhaustion. Verify a restore and the rollback process before launch.

CI runs dependency auditing, types (including API handlers), regression tests, build, and desktop/mobile smoke checks. Require the CI check in branch protection before deployment.

## Release and rollback

1. Create a Vercel preview with the intended environment variables and full assets.
2. Run `SMOKE_BASE=https://your-preview.example npm run smoke`. Exercise real account, multiplayer, weather, map/3D, GPS, and camera flows on actual desktop and mobile devices. Validate permissions and denied-permission paths.
3. Confirm headers and service-worker updates after a second deploy. Hashed assets are immutable; `sw.js` is never cached by the CDN. The worker avoids authenticated requests and private/no-store responses.
4. Promote the verified deployment, watch error rates and upstream quotas, and roll back to the previous Vercel deployment if they regress. Database migrations need a separate compatible rollback/restore plan.

Known limits: this is not a load-test certification; some map bundles remain large, global rate limiting is external, and local offline smoke does not validate live integrations. Do not publish a sparse build missing course assets.
