# Splinter Mind — Architecture Brief (MVP Phase 1)

AI Exchange Operations & Security Platform. B2B SaaS for currency exchange networks.
Mobile: Expo + React Native + TypeScript. Backend: Supabase (Postgres, Auth, Storage, Realtime, Edge Functions).

## 0. Repo layout (monorepo)

```
/README.md
/ARCHITECTURE.md                      (this file)
/packages/core/                       # framework-free TS: types, enums, provider interfaces, rules engine — OWNED BY BACKEND AGENT, read-only for mobile agent
  src/types.ts                        # shared DB/DTO types
  src/providers.ts                    # CameraProvider, VisionAnalyzer, NotificationProvider interfaces + MockHikvisionProvider + MockVisionAnalyzer + MockNotificationProvider
  src/rules.ts                        # deterministic rules engine (pure functions, testable)
  src/index.ts
  package.json, tsconfig.json, vitest.config.ts (or node:test)
/supabase/
  migrations/0001_initial_schema.sql  # all tables, enums, indexes, RLS, audit trigger
  migrations/0002_rules_seed.sql      # default rules per org template
  seed.sql                            # demo org data (branches #1,#2,#3,#7,#14 etc.)
  functions/
    _shared/                          # imports from ../../../packages/core/src + supabase client helper, logger
    hikvision-webhook/                # POST: ingest camera/NVR events -> stores events row -> invokes process-event
    process-event/                    # rules engine: event -> optional AI -> alert -> notification fan-out
    analyze-event/                    # VisionAnalyzer call (mock or real), stores ai_analysis on event
    create-alert/                     # POST: create alert from event/rule (idempotent on event_id)
    send-notification/                # POST: NotificationProvider fan-out (Expo push; WhatsApp stubbed)
    snapshot/                         # GET: fetch camera snapshot via provider, store to Storage, return signed URL
    simulate/                         # POST (dev only): fire mock events for demo (camera offline, motion, suspicious, rate mismatch, low cash)
/mobile/                              # Expo app — OWNED BY MOBILE AGENT
  app/                                # Expo Router: (auth)/login, (tabs)/dashboard, alerts, alerts/[id], branches, branches/[id], cameras/[id], events, exchange-rates, cash-balances, employees, profile, settings
  components/ui/                      # design system (see section 7)
  lib/                                # supabase client, api, notifications, utils, demo-data
  services/                           # alerts, branches, cameras, events (React Query wrappers, NO business logic)
  hooks/ stores/ types/ constants/
  app.json, eas.json, package.json, tsconfig.json
/docs/                                # backend agent: API.md (edge function contracts); mobile agent: MOBILE.md (screens, demo mode)
```

## 1. Vertical slice (build this FIRST, end to end)

login → dashboard → branch → camera → hikvision-webhook receives event → event row →
process-event evaluates rules → (if needed) analyze-event → create-alert → send-notification (Expo push) →
alert visible in app → open alert → snapshot → acknowledge → audit log entry.
Everything else is secondary.

## 2. Shared contracts (do not drift)

### Enums (Postgres enums + TS string unions in packages/core/src/types.ts)
- severity: `critical | high | medium | low | info`
- alert_status: `open | acknowledged | resolved | ignored`
- user_role: `owner | admin | coordinator | manager | security | cashier`
- entity_status (org/branch/camera/employee): `active | inactive | maintenance`
- camera_status: `online | offline | degraded | unknown`
- camera_provider: `hikvision | mock` (extensible later)
- event_type: `motion_detected | line_crossing | intrusion | camera_offline | camera_online | video_loss | tampering | person_detected | vehicle_detected | restricted_area | rate_not_updated | rate_deviation | cash_below_threshold | shift_no_show | info`
- event_source: `hikvision | rule_engine | manual | system`
- shift_status: `scheduled | active | completed | missed | cancelled`
- audit_action: `login | logout | alert_acknowledged | alert_resolved | alert_ignored | alert_assigned | exchange_rate_changed | camera_config_changed | user_created | user_permissions_changed`

### Core tables (names + key columns — full DDL by backend agent)
organizations(id, name, status, created_at, updated_at)
users(id uuid PK = auth.users.id, organization_id FK, name, email, phone, role, status, created_at, updated_at)
branches(id, organization_id FK, name, address, latitude, longitude, timezone, status, working_hours jsonb, created_at, updated_at)
cameras(id, branch_id FK, name, external_id, provider, status, camera_type, last_seen_at, configuration jsonb, created_at, updated_at)
employees(id, organization_id FK, branch_id FK nullable, name, phone, role, status, schedule jsonb, created_at, updated_at)
shifts(id, branch_id FK, employee_id FK, start_time, end_time, status, created_at)
events(id, organization_id FK, branch_id FK, camera_id FK nullable, event_type, source, severity, timestamp, raw_payload jsonb, snapshot_url, video_url, ai_analysis jsonb nullable, created_at)
alerts(id, organization_id FK, branch_id FK, event_id FK nullable unique, title, description, severity, status, assigned_to FK users nullable, created_at, acknowledged_at, resolved_at)
exchange_rates(id, organization_id FK, branch_id FK, currency text, buy_rate, sell_rate, previous_buy_rate, previous_sell_rate, updated_by FK users, created_at) — unique(branch_id, currency) latest-wins
cash_balances(id, branch_id FK, currency text, amount, threshold, updated_at) — unique(branch_id, currency)
alert_notes(id, alert_id FK, user_id FK, note, created_at)
rules(id, organization_id FK, name, event_type, condition jsonb, severity, cooldown_minutes, enabled, created_at) — condition e.g. {"offline_minutes_gt": 5} or {"outside_working_hours": true, "needs_ai": true}
audit_logs(id, organization_id FK, user_id FK nullable, action, entity_type, entity_id, metadata jsonb, created_at)
notification_prefs(user_id PK FK, push_enabled, severities text[], quiet_hours jsonb)
push_tokens(user_id FK, expo_push_token, created_at) — unique(user_id, expo_push_token)

### RLS (non-negotiable)
- Enable RLS on every table.
- Helper: `public.current_org_id()` returns `(select organization_id from public.users where id = auth.uid())`.
- Tenant tables: `USING (organization_id = public.current_org_id())` for SELECT/INSERT/UPDATE/DELETE (service_role bypasses for edge functions).
- users: user can read own row; owner/admin can read org users.
- No frontend-only filtering anywhere.

### AI analysis JSON (VisionAnalyzer output — exact shape)
```json
{ "person_detected": true, "restricted_area": true, "outside_working_hours": true,
  "confidence": 0.94, "risk_level": "high",
  "summary": "A person appears to be present in the cashier area outside working hours.",
  "objects_visible": ["person"], "likely_false_positive": false }
```
Neutral language only. AI never accuses, never decides — it advises.

### Rules engine pipeline (packages/core/src/rules.ts, pure functions)
Stage 1: provider event in → Stage 2: deterministic rules (DB rules table, evaluated in order) →
Stage 3: only if rule says `needs_ai` → fetch snapshot → Stage 4: VisionAnalyzer →
Stage 5: create alert if confidence/severity passes threshold.
Pure functions: `evaluateRules(event, rules, context) -> RuleAction[]` where
RuleAction = `{ action: 'alert'|'ai_analysis'|'ignore', severity?, cooldown_key? }`.
Context includes: branch working_hours, current time, camera last_seen, cash/rate state for business rules.
Cooldown: no duplicate alert for same (rule_id, branch_id/camera_id) within cooldown_minutes.

### Provider interfaces (packages/core/src/providers.ts)
```ts
interface CameraProvider {
  readonly name: string;
  getStatus(camera: CameraRef): Promise<CameraStatusResult>;
  getSnapshot(camera: CameraRef): Promise<{ imageBytes: Uint8Array; contentType: string }>;
  getRecording(camera: CameraRef, from: string, to: string): Promise<{ videoUrl: string } | null>;
  listDevices(credentials: ProviderCredentials): Promise<DeviceInfo[]>;
}
interface VisionAnalyzer {
  analyzeImage(image: { url: string } | { bytes: Uint8Array }, context: VisionContext): Promise<VisionAnalysis>;
}
interface NotificationProvider {
  sendPush(tokens: string[], n: PushMessage): Promise<SendResult>;
  sendWhatsApp?(to: string, text: string): Promise<SendResult>; // stubbed in MVP
}
```
- HikvisionProvider: ISAPI/Hik-Connect behind this interface; credentials NEVER leave server (Supabase Vault / env).
- MockHikvisionProvider + MockVisionAnalyzer: deterministic canned outputs for demo (motion → person_detected per input hint).
- AI cost rule: mock mode default in dev; real analyzer only via env `VISION_PROVIDER=openai-compatible`.

### Edge function contracts (document in /docs/API.md)
- POST /hikvision-webhook { provider, external_camera_id, event_type, timestamp, payload } → 202 { event_id }. Verifies HMAC/shared secret header.
- POST /process-event { event_id } → evaluates rules, may call analyze-event, create-alert, send-notification. Idempotent per event.
- POST /analyze-event { event_id, snapshot_url } → { analysis } stored on event.
- POST /create-alert { event_id, title, description, severity } → 201 { alert_id }; unique on event_id.
- POST /send-notification { alert_id } → fans out to push tokens honoring notification_prefs.
- GET /snapshot?camera_id= → { snapshot_url } (fetches via provider, uploads to Storage `snapshots/`).
- POST /simulate { scenario } (dev only, requires env ALLOW_SIMULATE=true).

### Realtime
Mobile subscribes to `alerts` and `events` inserts filtered by organization_id for live dashboard updates.

## 3. Design tokens (mobile — exact)
critical #DC2626, high #EA580C, medium #D97706, low #2563EB, success #16A34A, neutral #64748B.
Light backgrounds, dark text, high density, no consumer/social styling. Dark mode optional via theme toggle.

## 4. Mobile structure (Expo Router)
(auth)/login → (tabs): dashboard | alerts | branches | more(events, exchange-rates, cash-balances, employees, profile, settings).
Detail routes: alerts/[id], branches/[id], cameras/[id].
Offline: React Query persist cache for branches/alerts/events/profile; header shows "Last synchronized Xm ago"; stale data labeled, never presented as live.

## 5. Demo mode (mobile + backend)
- `EXPO_PUBLIC_DEMO_MODE=true` or no Supabase URL → app runs fully offline on mock provider + canned demo org (branches #1,#2,#3,#7,#14 with open alerts matching the spec's dashboard example).
- Backend /simulate endpoint + MockHikvisionProvider for hardware-free demos.

## 6. Testing (required)
- packages/core: vitest — rule evaluation incl. cooldowns, severity escalation (offline 5min→medium, 30min→high), AI-gating (business-hours motion ignored, after-hours → ai_analysis), alert state transition guards (open→acknowledged→resolved; ignored terminal), multi-tenant isolation (org A fixtures never leak to org B queries — test the RLS helper logic via policy simulation or documented SQL tests).
- Edge functions: at least handler-level tests for hikvision-webhook validation + process-event idempotency.
- Backend agent: include `supabase/tests/` with SQL RLS tests if pgTAP available, else a documented manual test checklist in docs.

## 7. UI components (mobile agent)
StatusBadge, SeverityBadge, AlertCard, BranchCard, CameraStatus, EventTimeline, EmptyState, LoadingState, ErrorState, PrimaryButton, SecondaryButton, ConfirmationModal.

## 8. Standards
- TypeScript strict everywhere. No `any` without justification.
- No business logic in React components; no secrets in the mobile app.
- Structured logging in edge functions (JSON, traceable event_id).
- Timeouts + retries + graceful degradation on every external call; AI failure → event stored with `ai_analysis: { status: "pending" }`, never a crash.
- English code + comments. README with setup (supabase link/start, seed, mobile `npx expo start`, demo mode).

## 9. What NOT to build (MVP Phase 1)
No facial recognition, no accusations, no predictive forecasting, no accounting/POS, no complex reports (simple operational summary only), no WhatsApp as primary channel, no n8n.
