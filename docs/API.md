# Splinter Mind — Backend API Reference

Base URL (Supabase Edge Functions): `https://<project-ref>.supabase.co/functions/v1`

All functions require the **service-role bearer** for server-to-server calls
(webhooks, internal invocation). The mobile app calls them with the user's
Supabase Auth JWT where noted. CORS is handled by the Supabase gateway.

Conventions:

- All timestamps are ISO-8601 UTC.
- Errors are JSON: `{ "error": "<code>", ...details }`.
- Every function emits structured JSON logs with `event_id` / `alert_id`
  trace fields.

Environment variables (set in the Supabase dashboard / Vault — never in code):

| Var | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Bypasses RLS (edge functions only) |
| `HIKVISION_WEBHOOK_SECRET` | yes | HMAC-SHA256 secret for `hikvision-webhook` |
| `HIKVISION_HOST` | for real cameras | Device/NVR host or IP |
| `HIKVISION_PORT` | no (80/443) | ISAPI port |
| `HIKVISION_HTTPS` | no (`false`) | `true` to use HTTPS |
| `HIKVISION_USER` / `HIKVISION_PASS` | for real cameras | Device credentials (server-side only) |
| `VISION_PROVIDER` | no (`mock`) | `mock` or `openai-compatible` |
| `VISION_API_URL` / `VISION_API_KEY` / `VISION_MODEL` | when `openai-compatible` | Real vision provider |
| `ALLOW_SIMULATE` | no (`false`) | `true` enables `POST /simulate` (dev only) |

---

## POST /hikvision-webhook

Ingests camera/NVR events (Hikvision ISAPI alert stream, HikCentral, or the
`/simulate` helper).

**Auth:** `x-signature` header = lowercase hex `HMAC-SHA256(HIKVISION_WEBHOOK_SECRET, raw_body)`.
A `sha256=` prefix is tolerated.

**Request body:**

```json
{
  "provider": "hikvision",
  "external_camera_id": "nvr1-ch102",
  "event_type": "motion_detected",
  "timestamp": "2026-10-16T02:17:00+06:00",
  "payload": { "channel": 102 }
}
```

- `provider`: `"hikvision"` or `"mock"`.
- `event_type`: one of `motion_detected | line_crossing | intrusion | camera_offline | camera_online | video_loss | tampering | person_detected | vehicle_detected | restricted_area | rate_not_updated | rate_deviation | cash_below_threshold | shift_no_show | info`.
- `timestamp`: optional (defaults to now).

**Responses:**

| Status | Meaning |
|---|---|
| `202` | `{ "event_id": "<uuid>" }` — stored; rules pipeline invoked. With `{ "deduplicated": true }` when the same `(camera, type, timestamp)` was already ingested. |
| `400` | `{ "error": "<code>" }` — bad payload / unknown event_type. |
| `401` | `{ "error": "invalid_signature" }` |
| `404` | `{ "error": "unknown_camera" }` |
| `500` | `{ "error": "webhook_not_configured" }` — secret missing. |

Notes: the camera's `last_seen_at` is refreshed; severity is the type's
default until `process-event` runs. If the internal `process-event` call
fails, the event is still stored and `202` is returned (re-invoke manually).

---

## POST /process-event

Runs the rules-engine pipeline for one stored event.

**Auth:** service-role bearer (called by `hikvision-webhook`, `simulate`, or ops tooling).

**Request body:** `{ "event_id": "<uuid>" }`

**Pipeline:**

1. Atomically claim the event (`processed_at`) — concurrent/repeated calls converge; losers get `already_processed`.
2. Load branch, camera, enabled org rules.
3. Deterministic rules, pass 1 (`evaluateRules` from `@splinter-mind/core`).
4. If a rule action is `ai_analysis`: capture snapshot via the camera provider → store in `snapshots/` bucket → call the vision analyzer → store `ai_analysis` on the event. **On AI failure the event is marked `ai_analysis: { status: "pending", reason }` and the pipeline continues — AI is never a single point of failure.**
5. Deterministic rules, pass 2 with the AI context (confidence / risk-level gates).
6. Create **one** alert per event (most severe winning action; idempotent on `event_id`), record rule cooldown fires.
7. Fan out push notifications.

**Responses:**

| Status | Body |
|---|---|
| `200` | `{ "status": "processed", "event_id", "actions": [{ "action", "severity?", "rule_id?" }], "alert_id": "<uuid>" \| null, "notification": { "users_targeted", "delivered", "skipped_quiet_hours", "errors": [] } }` |
| `200` | `{ "status": "already_processed", "event_id", "actions": [], "alert_id": null }` |
| `404` | `{ "status": "no_event", ... }` |

---

## POST /analyze-event

Runs the vision analyzer on demand for an event (used standalone or by the pipeline).

**Auth:** service-role bearer.

**Request body:** `{ "event_id": "<uuid>", "snapshot_url": "<url>" }` (`snapshot_url` optional — falls back to the event's snapshot, else captures a fresh one).

**Responses:**

| Status | Body |
|---|---|
| `200` | `{ "event_id", "analysis": { "person_detected", "restricted_area", "outside_working_hours", "confidence", "risk_level", "summary", "objects_visible", "likely_false_positive" } }` |
| `202` | `{ "event_id", "status": "pending", "reason" }` — AI unavailable; event marked pending, safe to retry. |
| `400` | `{ "error": "<code>" }` |
| `404` | `{ "error": "event_not_found" }` |

The analysis uses neutral language only — it advises, never accuses.

---

## POST /create-alert

Creates an alert, idempotent on `event_id` (unique constraint — at most one alert per event).

**Auth:** service-role bearer (or an authenticated operational role via RLS + `guard_alert_update` trigger for direct table writes).

**Request body:**

```json
{
  "event_id": "<uuid>",
  "title": "Camera offline",
  "description": "Entrance camera offline for 17 minutes.",
  "severity": "high",
  "rule_id": "<uuid>",
  "cooldown_key": "rule-id:camera-id"
}
```

Without `event_id`, `organization_id` + `branch_id` are required instead.

**Responses:**

| Status | Body |
|---|---|
| `201` | `{ "alert_id": "<uuid>" }` |
| `200` | `{ "alert_id": "<uuid>", "deduplicated": true }` |
| `400` | `{ "error": "<code>" }` — bad severity / missing title. |
| `404` | `{ "error": "event_not_found" }` |

Alert status transitions are guarded server-side: `open → acknowledged|resolved|ignored`, `acknowledged → resolved|ignored`; `resolved`/`ignored` are terminal. Every change writes an `audit_logs` row via trigger.

---

## POST /send-notification

Fans out Expo push for an alert, honoring `notification_prefs` (enabled flag, severity filter, quiet hours; **critical bypasses quiet hours**).

When `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` are set, opted-in users
(`whatsapp_enabled` + valid E.164 `whatsapp_number`, severity in their
`severities`, same quiet-hours rule) additionally receive the approved
`WHATSAPP_TEMPLATE_NAME` template message (default `splinter_alert`).
Missing env → WhatsApp leg skipped silently. See `docs/WHATSAPP_SETUP.md`.

**Auth:** service-role bearer.

**Request body:** `{ "alert_id": "<uuid>" }`

**Response `200`:**

```json
{
  "alert_id": "<uuid>",
  "users_targeted": 2,
  "delivered": 2,
  "skipped_quiet_hours": 1,
  "errors": [],
  "whatsapp_targeted": 1,
  "whatsapp_delivered": 1,
  "whatsapp_errors": []
}
```

`404` when the alert does not exist. One failing token/recipient never breaks the batch (errors are collected).

---

## GET /snapshot?camera_id=\<uuid\>

Captures a still from the camera via its provider (`mock` returns a canned
frame; `hikvision` calls ISAPI with digest auth), uploads it to the private
`snapshots` Storage bucket, and returns a 1-hour signed URL.

**Auth:** user's Supabase JWT (RLS applies) or service-role.

**Response `200`:** `{ "camera_id": "<uuid>", "snapshot_url": "<signed https url>" }`

**Errors:** `400` missing param, `404` unknown camera, `502` `{ "error": "snapshot_failed", "reason" }` (device unreachable — graceful, not a crash).

---

## POST /simulate (dev only)

Fires mock scenarios end-to-end without hardware. **Requires `ALLOW_SIMULATE=true`, otherwise `403`.**

**Auth:** service-role bearer.

**Request body:**

```json
{ "scenario": "low_cash", "branch_id": "<uuid>", "camera_id": "<uuid>", "timestamp": "<iso>" }
```

| Scenario | Event | Notes |
|---|---|---|
| `camera_offline` | `camera_offline` | Requires `camera_id`; ages `last_seen_at` 40 min so escalation rules fire. |
| `motion_after_hours` | `motion_detected` | Requires `camera_id`; payload hint steers the mock vision. |
| `suspicious` | `intrusion` | Requires `camera_id`. |
| `rate_mismatch` | `rate_deviation` | `branch_id`; payload carries `deviation_pct: 3.35`. |
| `low_cash` | `cash_below_threshold` | `branch_id`; amount/threshold resolved from `cash_balances`. |

**Response `200`:** `{ "scenario", "event_id", ...process-event result }`.

---

## Realtime (mobile)

The app subscribes to Postgres changes (filtered by `organization_id`, RLS-enforced):

- `alerts` INSERT/UPDATE → live dashboard + alert detail.
- `events` INSERT → branch/camera timelines.

## Manual alert actions (mobile → PostgREST)

`PATCH /rest/v1/alerts?id=eq.<uuid>` with `{ "status": "acknowledged" }` etc.
Server-side guards: RLS tenant isolation + `guard_alert_update()` trigger
(operational roles only) + `log_alert_change()` trigger writing `audit_logs`
with `auth.uid()` as the actor. `alert_notes` are inserted via
`POST /rest/v1/alert_notes`.
