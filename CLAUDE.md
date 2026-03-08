# Andes

Strava replacement. Records activities with GPS + BLE HR, shows history, integrates Oura body data. React 19 + Vite 7 + Tailwind 4 + Capacitor 7. Single-page app. Deployed on Vercel (web) and TestFlight (iOS).

## Architecture
- **Frontend**: `src/App.jsx` (single file, all components inline)
- **API routes** (Vercel serverless, `api/` directory):
  - `get-data.js` / `update-data.js` -- Upstash Redis KV (read/write JSON by key, `an_` prefix)
  - `oura-proxy.js` -- Oura Ring sleep/readiness/HRV
  - `strava-proxy.js` -- Strava incremental sync (recent activities)
  - `strava-sync.js` -- Strava full backfill (one-time import)
- **Data**: Upstash Redis (same instance as LYE). Keys: `an_settings`, `an_activities`, `an_activity_{id}`, `an_daily_{date}`
- **Native**: Capacitor 7 for iOS (background GPS, BLE HR, HealthKit, KeepAwake)

## Critical Constraints
- **NEVER use `npm run build`** with tsc. Use `npx vite build`
- **NEVER add `pnpm-lock.yaml`** -- this is an npm project
- **Single-file app**: Everything in `src/App.jsx`. No component files.
- **KV prefix**: All keys start with `an_` (not `lye_`)
- **Dark theme only**: bg #0a0a0a, surface #1a1a1a, accent #5ae6de

## Commands
```bash
npx vite dev     # local dev
npx vite build   # production build
npx cap sync     # sync web build to iOS project
```

## Deploy
Push to main (auto-deploys via Vercel). iOS: Xcode archive from `ios/` directory.

## Theme
```
Background:  #0a0a0a
Surface:     #1a1a1a
Border:      #2a2a2a
Accent:      #5ae6de (turquoise)
Accent dim:  #5ae6de40
Text:        #e8e8e8
Text dim:    #666
Font:        Inter, tabular-nums for stats
```
