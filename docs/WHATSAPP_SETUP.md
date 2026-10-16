# WhatsApp notifications — setup guide (Phase 2A)

Splinter Mind sends WhatsApp alerts as **approved template messages** via the
Meta WhatsApp Business Cloud API. Business-initiated messages *require* a
template — free-text messaging is forbidden outside the 24-hour
customer-service window, and the code deliberately has no free-text fallback:
if the template send fails, the failure is recorded and the push batch is
unaffected.

## 1. Meta app setup

1. Go to [Meta for Developers](https://developers.facebook.com) → **Create App**
   → choose **Business** type.
2. In the app dashboard → **Add Product** → **WhatsApp** → **Set up**.
3. Under **API Setup** you get a temporary test token and a test
   `phone_number_id`. For production, create a **System User**
   (Business Settings → System Users) with the `whatsapp_business_messaging`
   permission and generate a long-lived token — never use a personal user token.
4. Add your real business phone number (**Phone numbers → Add phone number**)
   and complete Meta's verification (SMS/voice code + business verification).

## 2. Create the message template

WhatsApp Manager → **Message templates** → **Create template**:

| Field | Value |
|---|---|
| Name | `splinter_alert` (or set `WHATSAPP_TEMPLATE_NAME` to your name) |
| Category | **UTILITY** |
| Language | `en_US` |
| Body | `{{1}} alert — {{2}}` (line break) `{{3}}` (line break) `Detected at {{4}}. Open the Splinter Mind app to review.` |

Parameter layout — the code sends them in exactly this order:

| Param | Content | Example |
|---|---|---|
| `{{1}}` | Severity (uppercased) | `CRITICAL` |
| `{{2}}` | Branch name | `Branch #14` |
| `{{3}}` | Alert title | `Security event detected` |
| `{{4}}` | Alert timestamp (ISO-8601) | `2026-10-16T02:17:00.000Z` |

A rendered message looks like:

> CRITICAL alert — Branch #14
> Security event detected
> Detected at 2026-10-16T02:17:00.000Z. Open the Splinter Mind app to review.

**Template approval:** Meta reviews templates manually — typically a few hours,
occasionally up to 24h. Test sends to an unapproved template name return
HTTP 400 (`template not approved`); the failure is logged per-recipient and
does not affect push delivery. Do not rename parameters after approval —
any body change needs re-approval.

## 3. Supabase configuration

Apply migration `0003_whatsapp.sql` (adds `whatsapp_number` + `whatsapp_enabled`
to `notification_prefs`), then set secrets (dashboard → Edge Functions →
Secrets, or `supabase secrets set`):

| Var | Required | Purpose |
|---|---|---|
| `WHATSAPP_TOKEN` | yes | System-user access token (server-side only) |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | Sending phone's `phone_number_id` |
| `WHATSAPP_TEMPLATE_NAME` | no | Defaults to `splinter_alert` |

Redeploy the `send-notification` function after setting secrets.

If the vars are missing, the WhatsApp leg is **skipped silently** (info log) —
push notifications keep working. One failing recipient never breaks the batch;
per-recipient errors are collected in `whatsapp_errors`.

## 4. User opt-in (mobile app)

Settings → **WhatsApp**: enter the number in E.164 format (`+996555123456`),
toggle **WhatsApp alerts** on, tap **Save**. The number + flag are stored in
`notification_prefs` (RLS: users manage only their own row).

Per-alert gating (server-side, in `send-notification`):
- `whatsapp_enabled = true` **and** a valid E.164 `whatsapp_number`
- alert severity ∈ the user's `severities` list
- quiet hours honored exactly like push (critical bypasses)

## 5. Testing

```bash
# 1. Unit: provider contract + no-fallback behavior
cd packages/core && npx vitest run tests/whatsapp.test.ts

# 2. Handler: gating + per-recipient error isolation
cd packages/core && npx vitest run tests/edge/handlers.test.ts

# 3. End-to-end (needs secrets + approved template + ALLOW_SIMULATE=true):
curl -X POST $URL/functions/v1/simulate \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H 'Content-Type: application/json' \
  -d '{"scenario":"suspicious","camera_id":"<uuid>","branch_id":"<uuid>"}'
# → response includes whatsapp_targeted / whatsapp_delivered / whatsapp_errors
```

## 6. Cost & limits notes

- Template (UTILITY) messages are billed per conversation by Meta; marketing
  templates are not used here.
- The 24-hour customer-service window does not apply — every message is a
  template send, so there is no window to track.
- Rate limits are per phone_number_id; the fan-out sends one message per
  opted-in user per alert, with cooldowns already enforced upstream by the
  rules engine (`rule_fires`).
