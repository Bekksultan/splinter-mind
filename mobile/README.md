# Splinter Mind — Mobile

Expo + React Native + TypeScript app for the Splinter Mind AI Exchange Operations & Security Platform.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

## Env vars

| Var | Required | Description |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | No | Supabase project URL. Empty = demo mode. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon key. Empty = demo mode. |
| `EXPO_PUBLIC_DEMO_MODE` | No | Set to `"true"` to force the offline demo dataset even when Supabase is configured. |

## Demo mode

Demo mode is active when `EXPO_PUBLIC_DEMO_MODE=true` **or** the Supabase URL is missing.
It serves a full offline dataset (org, 5 branches, 14 cameras, alerts, events, rates,
cash balances, employees, shifts) from `lib/demo.ts`, persisted to AsyncStorage under
`splintermind:demo:v1`. Mutations (acknowledge / resolve / assign / note / simulate)
work offline and append audit log entries.

## Scripts

- `npm start` — Expo dev server
- `npm run android` / `npm run ios` — run on a device/emulator
- `npm run typecheck` — `tsc --noEmit`

## Structure

- `app/` — Expo Router routes (screens live here; no business logic)
- `components/ui/` — design system (owned by the UI agent)
- `types/` — shared contracts (local mirror of `packages/core/src/types.ts`)
- `constants/` — design tokens + theme
- `lib/` — supabase client, edge-function API, notifications, utils, demo dataset
- `services/` — React Query hooks only; each branches on demo vs live
- `stores/` — zustand: theme, auth, sync
