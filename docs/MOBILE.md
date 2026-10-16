# Splinter Mind — Mobile App

Expo + React Native + TypeScript app for the Splinter Mind AI Exchange
Operations & Security Platform (B2B SaaS for currency-exchange networks).

Stack: Expo Router v4 (file-based routing), React Query (server state),
Zustand (auth/theme/sync stores), Supabase (Auth, Postgres, Realtime,
Edge Functions, Storage). TypeScript strict. No business logic in screens —
all data flows through hooks in `mobile/services/`; presentation only in
`mobile/components/ui/`.

## Route tree

```
app/
├── _layout.tsx                 # root Stack; boots auth, guards routes
├── +not-found.tsx              # unknown route → "Page not found" → Go home
├── (auth)/
│   └── login.tsx               # sign in / enter demo
├── (tabs)/                     # bottom tabs, headers hidden (in-screen headers)
│   ├── _layout.tsx             # Dashboard | Alerts | Branches | More
│   ├── dashboard.tsx           # ops overview: open alerts, branch status, simulate tool
│   ├── alerts.tsx              # alert inbox with status filter chips
│   ├── branches.tsx            # branch list w/ open-alert + camera-online counts
│   └── more.tsx                # menu: Events, Exchange rates, Cash balances,
│                               #        Employees, Profile, Settings
├── alerts/
│   └── [id].tsx                # alert detail: acknowledge / resolve / ignore /
│                               #   assign, notes, audit-visible actions
├── branches/
│   └── [id].tsx                # branch detail: status, rates, cash, shift,
│                               #   cameras, open alerts, timeline
├── cameras/
│   └── [id].tsx                # camera detail: status, snapshot refresh,
│                               #   last event, event timeline
├── events.tsx                  # event feed with severity filter chips
├── exchange-rates.tsx          # rates table with branch chips + deviation flags
├── cash-balances.tsx           # balances with threshold bars + branch chips
├── employees.tsx               # staff directory with shift status
├── profile.tsx                 # account details, sign out
└── settings.tsx                # notifications, appearance, demo mode
```

### Navigation map

- Tab screens push detail routes as siblings of the tab group, so the tab
  bar stays mounted underneath: `(tabs)/branches` → `/branches/:id`,
  `(tabs)/alerts` → `/alerts/:id`, camera rows → `/cameras/:id`.
- `more.tsx` menu routes are top-level: `/events`, `/exchange-rates`,
  `/cash-balances`, `/employees`, `/profile`, `/settings`.
- Events rows deep-link to `/cameras/:camera_id` when the event has a
  camera, otherwise to `/branches/:branch_id`.
- Unknown routes render `+not-found.tsx` with a "Go home" button that
  replaces the stack with `/dashboard`.
- Sign out replaces the stack with `/(auth)/login`.

### Screen inventory

| Route | Purpose | Data sources |
|---|---|---|
| `(tabs)/dashboard` | Ops overview, simulate-event dev tool | `useDashboardSummary`, `useAlerts` |
| `(tabs)/alerts` | Alert inbox, status filters | `useAlerts`, `useBranches` |
| `alerts/[id]` | Alert detail + lifecycle actions + notes | `useAlert`, `useAlertNotes`, `useAlertAction`, `useAssignAlert`, `useAddAlertNote`, `useUsers` |
| `(tabs)/branches` | Branch list, per-branch open alerts + camera counts | `useBranches`, `useAlerts({status:'open'})`, `useCameras` |
| `branches/[id]` | Branch ops detail (7 sections) | `useBranch`, `useExchangeRates`, `useCashBalances`, `useShifts`, `useEmployees`, `useCameras`, `useAlerts`, `useBranchTimeline` |
| `cameras/[id]` | Camera status, snapshot, events | `useCamera`, `useEvents`, `fnSnapshot` |
| `(tabs)/more` | Navigation menu | `useAuthStore` (profile) |
| `events` | Severity-filtered event feed | `useEvents({limit:50})`, `useBranches` |
| `exchange-rates` | Rates by branch, >2% deviation flagged | `useExchangeRates`, `useBranches` |
| `cash-balances` | Vault cash vs thresholds | `useCashBalances`, `useBranches` |
| `employees` | Staff directory + active shifts | `useEmployees`, `useShifts`, `useBranches` |
| `profile` | Account details, sign out | `useAuthStore` |
| `settings` | Push prefs, theme, demo override | `useNotificationPrefs`, `useUpdateNotificationPrefs`, `useThemeMode`, `useAuthStore` |

Every screen implements loading, error (with retry), and empty states
using the shared `LoadingState` / `ErrorState` / `EmptyState` components.
Lists use pull-to-refresh; the branches list also updates the sync store.

## Demo mode

The app runs fully offline on mock data when **any** of these hold:

1. `EXPO_PUBLIC_DEMO_MODE=true` is set, or
2. no Supabase URL is configured, or
3. the runtime override is forced on (Settings → Demo mode → On, or the
   "Enter demo" button on the login screen).

The override is tri-state: `Auto` (follow env/config), `On`, `Off`,
stored via `setDemoOverride(v: boolean | null)`.

Demo data (`mobile/lib/demo.ts`) includes the **Meridian Exchange Group**
org with branches #1, #2, #3, #7 (plus #14 in seed), open alerts matching
the dashboard example, canned exchange rates and cash balances, mock
camera snapshots, and a coordinator profile. Snapshot refresh in demo mode
reveals the stored snapshot without a network call.

The dashboard exposes a **Simulate event** dev tool (scenarios:
`camera_offline`, `motion_after_hours`, `suspicious`,
`rate_mismatch`, `low_cash`). In demo mode it fires local mock events via
`demoSimulate`; against a backend it calls the `simulate` edge function
(requires `ALLOW_SIMULATE=true` server-side).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | live mode | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | live mode | Supabase anon key |
| `EXPO_PUBLIC_DEMO_MODE` | no | `true` forces demo mode |
| `ALLOW_SIMULATE` | backend dev | enables the `simulate` edge function |
| `VISION_PROVIDER` | backend | `openai-compatible` for real AI analysis (mock otherwise) |

No secrets live in the mobile app — camera credentials never leave the
server (Supabase Vault / env); the app only ever calls edge functions.

## Offline / caching

- React Query persists cache for branches, alerts, events, and profile so
  the app opens usefully offline.
- The branches header shows `formatLastSync(lastSync)` — "Last synchronized
  5 min ago" — and the sync store is touched after each successful refresh.
- Stale/cached data is never presented as live; pull-to-refresh revalidates.
- Realtime subscriptions (alerts/events inserts) are active in live mode;
  demo mode is driven locally.

## Audit

Every alert lifecycle action — acknowledge, resolve, ignore, assign —
writes an `audit_logs` row server-side (`alert_acknowledged`,
`alert_resolved`, `alert_ignored`, `alert_assigned`) with the acting user,
entity type/id, and timestamp. Reads go through `useAuditLogs(limit?)`;
RLS scopes all rows to the caller's organization.

## Types

`mobile/types/index.ts` is a local mirror of
`packages/core/src/types.ts` (enums: severity, alert_status, user_role,
entity_status, camera_status, event_type, shift_status; tables: branches,
cameras, employees, shifts, events, alerts, exchange_rates, cash_balances,
notification_prefs, audit_logs, …). The core package is the single source
of truth — do not let the two drift.

## How to run

```bash
cd mobile
npx expo start          # dev server; scan QR with Expo Go
```

EAS config lives in `eas.json`. New native builds are only needed when
native dependencies change; everything else ships over the air.
