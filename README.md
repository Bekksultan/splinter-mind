# Splinter Mind — Backend

AI Exchange Operations & Security Platform. Backend half of the MVP:
Supabase (Postgres + Auth + Storage + Realtime + Edge Functions) and the
framework-free `@splinter-mind/core` package (types, provider interfaces,
deterministic rules engine). The mobile app lives in `/mobile` (separate owner).

## Layout

```
packages/core/            # framework-free TS: types, providers, rules — shared by app + functions
  src/types.ts            # enums, DB row types, AI JSON shape, alert state machine, tenant helpers
  src/providers.ts        # CameraProvider / VisionAnalyzer / NotificationProvider + mocks + Hikvision ISAPI skeleton
  src/rules.ts            # pure rules engine: evaluateRules, cooldowns, working-hours, escalation, AI gating
  tests/                  # vitest suites (incl. tests/edge handler tests)
supabase/
  migrations/0001_initial_schema.sql   # enums, tables, indexes, RLS, audit + RBAC triggers
  migrations/0002_rules_seed.sql      # seed_default_rules(org_id)
  seed.sql                            # "Demo Exchange Group" demo data
  functions/                          # Deno edge functions (handlers are Deno-free & unit-tested)
    _shared/                          # db port, pipeline, vision, notifications, snapshots, log, http, crypto
    hikvision-webhook/ process-event/ analyze-event/ create-alert/
    send-notification/ snapshot/ simulate/
docs/
  API.md                  # every edge-function contract
  RLS_TESTS.md            # manual security checklist (no pgTAP in this env)
```

## Prerequisites

- Node 20+ (for `packages/core` typecheck/tests)
- Supabase CLI (`npm i -g supabase`) + a Supabase project
- Deno (only if typechecking functions locally: `deno check`)

## Setup

```bash
# 1. core package: typecheck + tests
cd packages/core
npm install
npx tsc --noEmit
npx vitest run

# 2. link + push schema
cd ../..
supabase link --project-ref <project-ref>
supabase db push            # applies 0001 + 0002

# 3. auth users for the demo seed (ids must match seed.sql!)
#    create via dashboard or Auth admin API:
#    aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa  owner@demo.exchange
#    bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb  ops@demo.exchange
#    cccccccc-cccc-cccc-cccc-cccccccccccc  sec@demo.exchange

# 4. demo data
psql $DATABASE_URL -f supabase/seed.sql

# 5. edge functions env (dashboard > Edge Functions > Secrets), then deploy
supabase secrets set \
  HIKVISION_WEBHOOK_SECRET='<random 32+ chars>' \
  ALLOW_SIMULATE=true            # dev only; unset/false in prod
supabase functions deploy hikvision-webhook process-event analyze-event \
  create-alert send-notification snapshot simulate
```

Optional (real hardware / real AI):

```bash
supabase secrets set \
  HIKVISION_HOST=192.168.1.64 HIKVISION_USER=admin HIKVISION_PASS='...' \
  VISION_PROVIDER=openai-compatible VISION_API_URL='https://...' \
  VISION_API_KEY='...' VISION_MODEL='gpt-4o-mini'
```

## End-to-end smoke test (no hardware)

```bash
export URL=https://<project-ref>.supabase.co
# 1. fire a mock intrusion at Branch #14's cashier camera (use a real camera id from seed)
CAM=$(psql $DATABASE_URL -tAc "select id from cameras where external_id='mock-b14-cam2'")
SIG=$(node -e "const c=require('crypto');const b=JSON.stringify({provider:'mock',external_camera_id:'mock-b14-cam2',event_type:'intrusion',payload:{hint:'person in restricted area'}});process.stdout.write(c.createHmac('sha256',process.env.S).update(b).digest('hex'))")
# 2. POST /simulate instead (simpler): scenario=suspicious, camera_id=$CAM
curl -X POST $URL/functions/v1/simulate \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H 'Content-Type: application/json' \
  -d "{\"scenario\":\"suspicious\",\"camera_id\":\"$CAM\"}"
# expect: status=processed, alert created (critical), push fan-out attempted
```

## Key design decisions

- **Rules before AI.** Deterministic rules (`supabase.rules`, evaluated by pure
  `evaluateRules`) decide everything cheap; only `needs_ai` rules fetch a
  snapshot and call the vision model. AI failure → `ai_analysis: {status:'pending'}`.
- **One alert per event.** `alerts.event_id` is unique; concurrent pipelines converge.
- **Cooldowns** are recorded in `rule_fires` per `(rule, camera-or-branch)`.
- **Security:** RLS tenant isolation on every org table, `guard_alert_update()`
  trigger enforces operational roles on direct writes, `log_alert_change()`
  trigger writes audit rows with `auth.uid()`. Secrets live in env/Vault only.
- **Mocks where the brief allows:** `MockHikvisionProvider`, `MockVisionAnalyzer`
  (deterministic, zero-cost), WhatsApp stubbed. The Hikvision ISAPI provider is a
  working skeleton (digest auth, timeout/retry) — credentials via constructor,
  never logged.
