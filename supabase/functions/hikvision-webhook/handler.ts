/**
 * POST /hikvision-webhook
 * Ingests camera/NVR events. Verifies HMAC signature, validates the payload,
 * resolves the camera by external id, stores the event (dedupe-safe), then
 * asks process-event to run the rules pipeline.
 */
import {
  DEFAULT_EVENT_SEVERITY,
  EVENT_TYPES,
  type EventType,
} from '../../../packages/core/src/index.ts';
import type { DbPort } from '../_shared/db-port.ts';
import { verifyHmacSha256Hex } from '../_shared/crypto.ts';
import { badRequest, json } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';

export interface WebhookDeps {
  db: DbPort;
  webhookSecret: string;
  onEventStored: (eventId: string) => Promise<void>;
  now?: () => Date;
}

interface WebhookBody {
  provider?: unknown;
  external_camera_id?: unknown;
  event_type?: unknown;
  timestamp?: unknown;
  payload?: unknown;
}

export async function handleHikvisionWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const raw = await req.text();
  if (!deps.webhookSecret) {
    log('error', 'HIKVISION_WEBHOOK_SECRET not configured');
    return json(500, { error: 'webhook_not_configured' });
  }
  const signature = req.headers.get('x-signature');
  if (!(await verifyHmacSha256Hex(deps.webhookSecret, raw, signature))) {
    log('warn', 'webhook signature rejected');
    return json(401, { error: 'invalid_signature' });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return badRequest('invalid JSON body');
  }

  const { provider, external_camera_id, event_type, timestamp } = body;
  if (provider !== 'hikvision' && provider !== 'mock') {
    return badRequest('provider must be "hikvision" or "mock"');
  }
  if (typeof external_camera_id !== 'string' || external_camera_id.length === 0) {
    return badRequest('external_camera_id is required');
  }
  if (typeof event_type !== 'string' || !(EVENT_TYPES as readonly string[]).includes(event_type)) {
    return badRequest(`unknown event_type: ${String(event_type)}`);
  }
  const ts = typeof timestamp === 'string' && timestamp.length > 0 ? timestamp : new Date().toISOString();
  if (Number.isNaN(new Date(ts).getTime())) return badRequest('invalid timestamp');

  const camera = await deps.db.getCameraByExternalId(external_camera_id);
  if (!camera) {
    log('warn', 'webhook for unknown camera', { external_camera_id });
    return json(404, { error: 'unknown_camera', external_camera_id });
  }

  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  const dedupeKey = `${camera.id}:${event_type}:${ts}`;
  const existing = await deps.db.findEventByDedupe(dedupeKey);
  if (existing) {
    return json(202, { event_id: existing.id, deduplicated: true });
  }

  const payload =
    body.payload !== null && typeof body.payload === 'object'
      ? (body.payload as Record<string, unknown>)
      : {};

  const event = await deps.db.insertEvent({
    organization_id: camera.organization_id,
    branch_id: camera.branch_id,
    camera_id: camera.id,
    event_type: event_type as EventType,
    source: 'hikvision',
    severity: DEFAULT_EVENT_SEVERITY[event_type as EventType],
    timestamp: ts,
    raw_payload: payload,
    snapshot_url: null,
    video_url: null,
    ai_analysis: null,
    dedupe_key: dedupeKey,
  });
  await deps.db.updateCameraLastSeen(camera.id, nowIso);
  log('info', 'event ingested', {
    event_id: event.id,
    event_type,
    camera_id: camera.id,
    org_id: camera.organization_id,
  });

  try {
    await deps.onEventStored(event.id);
  } catch (err) {
    // The event is safely stored; process-event can be re-invoked manually.
    log('error', 'process-event invocation failed', {
      event_id: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return json(202, { event_id: event.id });
}
