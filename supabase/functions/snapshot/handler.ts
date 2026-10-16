/**
 * GET /snapshot?camera_id=<uuid>
 * Captures a still from the camera via its provider, uploads it to the
 * private `snapshots` Storage bucket, and returns a short-lived signed URL.
 * Used by the mobile app when a coordinator investigates an alert.
 */
import type { DbPort } from '../_shared/db-port.ts';
import { badRequest, getQueryParam, json } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';
import { captureSnapshot, type SnapshotEnv } from '../_shared/snapshots.ts';

export interface SnapshotDeps {
  db: DbPort;
  snapshotEnv: SnapshotEnv;
}

export async function handleSnapshot(req: Request, deps: SnapshotDeps): Promise<Response> {
  if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
  const cameraId = getQueryParam(req, 'camera_id');
  if (!cameraId) return badRequest('camera_id query param is required');
  const camera = await deps.db.getCamera(cameraId);
  if (!camera) return json(404, { error: 'camera_not_found', camera_id: cameraId });
  try {
    const snapshotUrl = await captureSnapshot(deps.db, camera, deps.snapshotEnv);
    return json(200, { camera_id: cameraId, snapshot_url: snapshotUrl });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log('error', 'snapshot capture failed', { camera_id: cameraId, error: reason });
    return json(502, { error: 'snapshot_failed', reason });
  }
}
