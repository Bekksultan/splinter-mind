# Hikvision device setup (Phase 2B)

This guide covers connecting a real Hikvision NVR or camera to Splinter Mind:
creating a least-privilege ISAPI user, onboarding the device from the mobile
app (**Integrations**, owner/admin only), and pointing the NVR's alarm upload
at the event webhook.

## 1. Create a dedicated ISAPI user on the NVR

Do **not** use the NVR's main `admin` account — create a service user with the
minimum rights Splinter Mind needs (read device info, channels, snapshots).

On the NVR web UI (or iVMS-4200):

1. **System → User Management → Add**
   - User Name: `splintermind` (or similar)
   - Password: strong, unique (stored in Splinter Mind's server-side Vault —
     it is never saved in the mobile app)
   - Level: **Operator** (not Administrator)
2. Permissions for the new user:
   - ✅ Remote: **Parameters Settings** → System (device info / channels)
   - ✅ Remote: **Live View** (channel list + snapshots)
   - ❌ Everything else (Playback, PTZ Control, Video Export, User Management…)
3. Save. Note the NVR's LAN IP (e.g. `192.168.10.20`) and HTTP port
   (default `80`; `443` if you enabled HTTPS on the device).

> The backend must be able to reach the NVR over the network. If Splinter
> Mind's Supabase project is in the cloud and the NVR is on a private LAN,
> expose ISAPI through a VPN tunnel or a reverse proxy — never port-forward
> the NVR's admin port directly to the internet.

## 2. Onboard the device from the mobile app

**Integrations** (in the *More* tab) → **Add Hikvision device** — visible only
to organization owners/admins.

| Field    | Value                                    |
|----------|------------------------------------------|
| Branch   | The exchange office this NVR belongs to   |
| Name     | e.g. "NVR — Branch #14"                   |
| Host     | NVR IP or hostname (no `http://`, no path)|
| Port     | `80` (or `443` with HTTPS on)             |
| Username | the ISAPI user from step 1               |
| Password | its password (sent once over TLS)        |

On submit the backend (`POST /functions/v1/hikvision-onboard`):

1. `GET /ISAPI/System/deviceInfo` — verifies reachability + credentials
2. `GET /ISAPI/System/Video/inputs/channels` — enumerates channels
3. stores the password in **Supabase Vault** (only the secret id is kept)
4. inserts the `devices` row and **one `cameras` row per enabled channel**
   (`external_id = <device_id>:<channel_id>`)

## 3. Point NVR alarms at the event webhook

To receive motion/intrusion/line-crossing events, configure the NVR's
**HTTP alarm server** (Event → Linkage → HTTP / "Upload to Alarm Server"
depending on firmware):

- **URL:** `https://<project-ref>.supabase.co/functions/v1/hikvision-webhook`
- **Method:** POST, JSON body
- **Header:** `x-signature: <hmac>` where `hmac` = lowercase hex
  `HMAC-SHA256(HIKVISION_WEBHOOK_SECRET, raw_body)` (see `docs/API.md`)
- **Body:**
  ```json
  {
    "provider": "hikvision",
    "external_camera_id": "<device_id>:<channel_id>",
    "event_type": "motion_detected",
    "timestamp": "2026-10-16T02:17:00+06:00",
    "payload": { "channel": 101 }
  }
  ```

Event types the pipeline understands: `motion_detected`, `line_crossing`,
`intrusion`, `camera_offline`, `camera_online`, `video_loss`, `tampering`,
`person_detected`, `vehicle_detected`, `restricted_area`.

> Many deployments use a small on-prem relay (or the NVR's ISAPI
> `AlertStream`) to translate native Hikvision alarm XML into this JSON and
> add the HMAC signature. Keep the `HIKVISION_WEBHOOK_SECRET` on that relay —
> never on the cameras themselves.

## 4. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| `device_unreachable` on onboard | NVR not reachable from the backend: check host/port, firewall, VPN. |
| `device_unreachable` + "authentication failed" | Wrong ISAPI user/password, or the user lacks Operator rights. |
| `401` on the webhook | Missing/wrong `x-signature` — recompute the HMAC over the exact raw body. |
| `no_enabled_channels` | Device reachable but all video inputs disabled — enable channels on the NVR. |
| `device_already_registered` (409) | Same branch+host was already onboarded — check the device list. |
| Events arrive but no alerts | Rules engine: check enabled rules for the org (`supabase.rules`); see `docs/API.md` for the pipeline. |
| Snapshots fail for onboarded cameras | Per-device Vault credentials are not yet wired into the snapshot path (follows in a later slice); single-device env credentials (`HIKVISION_*`) still apply. |

## 5. Security notes

- Passwords live **only** in Supabase Vault (`devices.credentials_ref`
  stores the secret id). They are never logged, never in any table, and
  never returned by the API.
- Rotate the ISAPI password on the NVR periodically; re-onboard to update
  the Vault entry (or update the Vault secret directly and keep the same id).
- If a device is decommissioned, delete its `devices` row and revoke the
  Vault secret.
