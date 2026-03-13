# Andes

Strava replacement. Records activities with GPS + BLE HR, shows history, integrates Oura body data and Strava import. React 19 + Vite 7 + Tailwind 4 + Capacitor 7. Deployed on Vercel (web) and TestFlight (iOS).

## Architecture
- **Frontend**: TypeScript, multi-file feature-based structure in `src/`
  - `src/app/App.tsx` -- main shell, routing, integration orchestration
  - `src/app/store.ts` -- Zustand global store
  - `src/features/` -- screen components (home, history, settings, sleep, recording, activity-detail, coach)
  - `src/ui/` -- shared UI components (AreaChart, StaticMap, SectionHeader, etc.)
  - `src/lib/` -- API client, storage, native bridges, utilities
- **API routes** (Vercel serverless, `api/` directory, TypeScript):
  - `api/_lib/` -- shared: KV, auth, HTTP helpers, Strava/Oura clients
  - `api/activity/` -- CRUD, comments, backfill
  - `api/integrations/strava/` -- OAuth connect/callback, full import
  - `api/integrations/oura/` -- refresh, backfill
  - `api/bootstrap.ts` -- initial data load
  - Legacy JS routes: `get-data.js`, `update-data.js`, `oura-proxy.js`, `strava-proxy.js`, `strava-sync.js`
- **Data**: Upstash Redis. Keys: `an_settings`, `an_activities`, `an_activity_{id}`, `an_daily_{date}`
- **Native**: Capacitor 7 for iOS (background GPS, BLE HR, HealthKit, KeepAwake)

## Critical Constraints
- **NEVER use `npm run build`** with tsc. Use `npx vite build`
- **NEVER add `pnpm-lock.yaml`** -- this is an npm project
- **KV prefix**: All keys start with `an_` (not `lye_`)
- **Dark theme only**: multiple theme variants in `src/styles/tokens.css`
- **Fonts**: Haas Grot Display R (body), Sharp Grotesk (labels/eyebrows)

## Strava Integration
- **OAuth flow**: `/api/integrations/strava/connect` redirects to Strava auth, `/api/integrations/strava/callback` exchanges code for tokens, redirects back with refresh token in URL fragment
- **Manual entry**: Settings screen supports entering client ID, secret, refresh token directly
- **Import**: `/api/integrations/strava/import` fetches all historical activities, merges into KV
- **Server env**: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` for OAuth flow

## Commands
```bash
npx vite dev     # local dev (includes API route proxy)
npx vite build   # production build
npx cap sync     # sync web build to iOS project
```

## Deploy
Push to main (auto-deploys via Vercel). iOS: Xcode archive from `ios/` directory.

## Theme
```
Background:  #020304
Surface:     #080a0b
Border:      rgba(255,255,255,0.055)
Accent:      #5ae6de (turquoise)
Text:        #f5f7f8
Text dim:    rgba(245,247,248,0.38)
Font body:   Haas Grot Display R
Font labels: Sharp Grotesk
```
