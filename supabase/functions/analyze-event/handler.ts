/**
 * POST /analyze-event
 * Body: { "event_id": "<uuid>", "snapshot_url"?: "<url>" }
 * Runs the VisionAnalyzer on the event's snapshot and stores the structured
 * analysis on the event. On AI failure the event is marked
 * ai_analysis = { status: "pending" } and a 202 is returned — the event
 * itself is never lost and AI is never a single point of failure.
 */
import type { VisionAnalyzer } from '../../../packages/core/src/index.ts';
import type { DbPort } from '../_shared/db-port.ts';
import { badRequest, json, readJson } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';
import { captureSnapshot, type SnapshotEnv } from '../_shared/snapshots.ts';

export interface AnalyzeEventDeps {
  db: DbPort;
  vision: VisionAnalyzer;
  snapshotEnv: SnapshotEnv;
}

export async function handleAnalyzeEvent(req: Request, deps: AnalyzeEventDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const parsed = await readJson(req);
  if (!parsed.ok) return badRequest(parsed.error);
  const body = parsed.value as { event_id?: unknown; snapshot_url?: unknown };
  if (typeof body.event_id !== 'string' || body.event_id.length === 0) {
    return badRequest('event_id is required');
  }

  const event = await deps.db.getEvent(body.event_id);
  if (!event) return json(404, { error: 'event_not_found', event_id: body.event_id });

  let snapshotUrl =
    typeof body.snapshot_url === 'string' && body.snapshot_url.length > 0
      ? body.snapshot_url
      : event.snapshot_url;

  try {
    if (!snapshotUrl) {
      const camera = event.camera_id ? await deps.db.getCamera(event.camera_id) : null;
      if (!camera) return badRequest('no snapshot available and event has no camera');
      snapshotUrl = await captureSnapshot(deps.db, camera, deps.snapshotEnv);
    }
    const hint =
      typeof event.raw_payload['hint'] === 'string' ? event.raw_payload['hint'] : undefined;
    const branch = await deps.db.getBranch(event.branch_id);
    const camera = event.camera_id ? await deps.db.getCamera(event.camera_id) : null;
    const analysis = await deps.vision.analyzeImage(
      { url: snapshotUrl },
      {
        branch_name: branch?.name,
        camera_name: camera?.name ?? undefined,
        event_type: event.event_type,
        timestamp: event.timestamp,
        hint,
      },
    );
    await deps.db.updateEvent(event.id, { ai_analysis: analysis, snapshot_url: snapshotUrl });
    log('info', 'analyze-event completed', {
      event_id: event.id,
      risk_level: analysis.risk_level,
      confidence: analysis.confidence,
    });
    return json(200, { event_id: event.id, analysis });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await deps.db.updateEvent(event.id, {
      ai_analysis: { status: 'pending', reason },
      ...(snapshotUrl ? { snapshot_url: snapshotUrl } : {}),
    });
    log('error', 'analyze-event failed, marked pending', { event_id: event.id, error: reason });
    return json(202, { event_id: event.id, status: 'pending', reason });
  }
}
