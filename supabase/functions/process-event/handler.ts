/**
 * POST /process-event
 * Body: { "event_id": "<uuid>" }
 * Runs the rules-engine pipeline for one stored event. Idempotent: the event
 * is claimed atomically, so concurrent/repeated invocations converge.
 */
import type { NotificationProvider, VisionAnalyzer } from '../../../packages/core/src/index.ts';
import type { DbPort } from '../_shared/db-port.ts';
import { badRequest, json, readJson } from '../_shared/http.ts';
import { processEvent, type PipelineDeps } from '../_shared/pipeline.ts';
import type { SnapshotEnv } from '../_shared/snapshots.ts';

export interface ProcessEventDeps {
  db: DbPort;
  vision: VisionAnalyzer;
  notifier: NotificationProvider;
  snapshotEnv: SnapshotEnv;
}

export async function handleProcessEvent(req: Request, deps: ProcessEventDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const parsed = await readJson(req);
  if (!parsed.ok) return badRequest(parsed.error);
  const eventId = (parsed.value as { event_id?: unknown }).event_id;
  if (typeof eventId !== 'string' || eventId.length === 0) {
    return badRequest('event_id is required');
  }
  const pipelineDeps: PipelineDeps = {
    db: deps.db,
    vision: deps.vision,
    notifier: deps.notifier,
    snapshotEnv: deps.snapshotEnv,
  };
  const result = await processEvent(eventId, pipelineDeps);
  return json(result.status === 'no_event' ? 404 : 200, result);
}
