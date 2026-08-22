# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: React 18, TypeScript, Vite, Tailwind CSS, React Router, MapLibre GL, Supabase Auth. Deployed on Vercel (`https://tee-ready.vercel.app`). Dev: `npm run dev` (port 5173).

## Users

Recreational and improving golfers, league players, and social groups — TeeReady serves all equally. Typical situations: planning an upcoming round, checking conditions for the best tee window, prepping hole-by-hole with miss lines and wind-adjusted yardages, tracking a live round with background GPS, logging stats, and coordinating with playing partners.

## Product Purpose

TeeReady helps golfers play smarter rounds by combining weather-aware playability, hole prep, live GPS ranging, scoring/stats, and goal-based coaching in one web app. Success means a player can go from "should I play today?" through prep, on-course decisions, and post-round review without switching tools.

## Positioning

Best-in-class hole prep (miss lines, wind, front/mid/back yardages) plus reliable background GPS that keeps running while the user switches tabs or views. Competitors may offer GPS or yardages; TeeReady's core claim is prep depth tied to the player's bag, miss pattern, and conditions — then carrying that context through a live round without losing the session.

## Operating Context

- **On course:** mobile browser (PWA-capable), GPS enabled, often switching between map, scorecard, and other app areas mid-round.
- **Off course:** checking Today for conditions windows, browsing courses, completing player questionnaire, reviewing stats.
- **Social:** creating/joining groups, picking a course, navigating to GPS together.
- **Data sources:** OpenStreetMap golf courses, weather/ensemble models for wind briefs, local storage for rounds with optional Supabase profile sync.

## Capabilities and Constraints

**Confirmed capabilities:**
- Auth via Supabase (sign up, sign in, remember me, cloud profile sync)
- Today: playability/conditions by hour, goal-based AI coach
- Rounds Prep: miss-line planning, wind-adjusted yardages per hole
- Rounds GPS: live map, shot tracking, scorecard with net scoring from your handicap index, FIR/GIR/chips/penalties/sand stats
- Background round persistence when navigating away from GPS view
- Courses browser with search and imagery
- Social/multiplayer groups with course pick → GPS flow
- Player questionnaire (goals, rhythm, leaks, motivation) separate from Settings
- Golfer info profile (handicap, bag stocks, miss bias, home courses)
- Stats page with archived round history and aggregates
- Themes: light, dark, sand, auto

**Constraints:**
- API routes require Vercel dev or production (`/api/*` stubbed locally unless `DEV_API_PROXY` set)
- Profile and round data primarily local-first; cloud sync for core profile fields only
- No fabricated testimonials, customer logos, or performance benchmarks in marketing
- Golf course data quality varies by OSM coverage

**Terminology:** Prep, GPS, Today, Rounds, Golfer info, Questionnaire, Stats, Social

## Brand Commitments

- Product name: **TeeReady**
- Tagline direction (from meta): golf weather intelligence / playability forecasts
- Voice: knowledgeable caddie — practical, encouraging, not corporate
- Visual incumbent: dark emerald landing hero; app shell uses brand green tokens, card surfaces, monospace labels
- Flag icon mark in hero nav
- Production URL: `https://tee-ready.vercel.app`
- Repo: `github.com/tackleguy/TeeReady`

## Evidence on Hand

- Real deployed app at `https://tee-ready.vercel.app`
- Hero photography via Unsplash (golf course imagery)
- Course images via Unsplash mappings in codebase
- User-provided profile data (handicap, goals, courses) — no stock personas
- **Do not fabricate:** testimonials, press mentions, user counts, handicap improvement claims, course partnerships

## Product Principles

1. **Prep before pins** — The round is won in preparation; every surface should reinforce smart targets before the first tee.
2. **Keep the round alive** — GPS and scoring must survive tab switches and app navigation; losing a live round breaks trust.
3. **Coach to goals** — Personalization comes from stated goals and player context, not generic tips.
4. **Course-first, not feature-first** — Workflows follow how golfers actually play: conditions → prep → play → stats → social.
5. **Honest data** — Show real OSM/weather limitations; never fake social proof or performance stats.

## Accessibility & Inclusion

Mobile-first web app with PWA meta tags. Target WCAG-conscious contrast (recent pass bumped muted/faint text and `.on-light` / `.golf-hud` contrast fixes). GPS and map interactions must remain usable on small screens. No product-specific accessibility certification claimed.
