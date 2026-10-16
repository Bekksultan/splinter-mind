# Splinter Mind — Web Console (Phase 2C)

Coordinator web dashboard for the Splinter Mind AI Exchange Operations &
Security Platform. Desktop web app sharing the **same Supabase backend** as
the mobile app (`/mobile`): same Postgres tables, same RLS policies, same
edge functions.

## Setup

```bash
cd web
npm install          # installs @splinter-mind/core via file:../packages/core
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev          # http://localhost:3000
```

Only the **anon key** is used — never the service role key. All queries run
as the signed-in user, so Postgres Row Level Security enforces tenant
isolation. The app never filters by organization client-side as a security
measure.

`@splinter-mind/core` (`../packages/core`) is the single source of truth for
types and enums — the web app re-exports it, never mirrors it. The package is
read-only for this track (owned by the backend tracks).

> Build note: the core package is installed as a symlinked `file:` dependency,
> which Turbopack cannot resolve across the project-root boundary. The
> `postinstall` script therefore builds core and vendors a copy of its `dist`
> into `web/vendor/` (gitignored); `next.config.ts` aliases the bundler to
> that copy. TypeScript still resolves types from `node_modules`. If you pull
> newer core sources, re-run `npm install` (or `npm run postinstall`) in `web/`.

## Route map

| Route | Description |
|---|---|
| `/login` | Email/password sign-in (Supabase Auth) |
| `/` | Operations dashboard: branch count, open alerts by severity, critical/warnings sections, realtime updates |
| `/alerts` | Filterable alert list (status / severity / branch) |
| `/alerts/[id]` | Alert detail: severity, snapshot, AI analysis card, timeline, acknowledge/resolve/ignore/assign/note |
| `/branches` | Branch grid with open-alert counts |
| `/branches/[id]` | Status, hours, rates, cash vs thresholds, shifts, cameras, open alerts, timeline |
| `/cameras/[id]` | Camera status, snapshot refresh, event timeline, open alerts |
| `/events` | Filterable event table (branch / event type) |
| `/settings` | Notification preferences (push severities; WhatsApp fields appear only if the backend provides them) |

## Auth & RLS

- `middleware.ts` redirects unauthenticated users to `/login` (Supabase SSR
  session refresh).
- Server components use `lib/supabase/server.ts` (cookie-based client);
  mutations use the browser client in `lib/mutations.ts`.
- Alert mutations go through PostgREST directly (`PATCH alerts`, `POST
  alert_notes`). The backend's `log_alert_change()` trigger writes audit rows
  and `guard_alert_update()` enforces roles server-side. **Never insert into
  `audit_logs` directly — RLS denies it.**
- Realtime: `components/Realtime.tsx` subscribes to `alerts`/`events`
  Postgres changes (RLS-filtered) and calls `router.refresh()`.

## Defensive coding notes (parallel Phase 2 tracks)

- **Track A (WhatsApp)** adds columns to `notification_prefs` (migration
  0003). The settings page selects `*` and renders WhatsApp fields only when
  the columns are present in the returned row — it works with or without the
  migration applied.
- **Track B (devices table)** is not queried by this app yet; camera
  onboarding lives in the mobile app / edge functions.
