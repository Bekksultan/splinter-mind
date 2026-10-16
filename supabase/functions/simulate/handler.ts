/**
 * POST /simulate  (DEV ONLY — requires ALLOW_SIMULATE=true)
 * Fires mock events end-to-end without hardware, for development and product
 * demos. Each scenario inserts an event and runs the full process-event
 * pipeline (rules -> optional AI -> alert -> push).
 *
 * Body: { "scenario": "camera_offline" | "motion_after_hours" | "suspicious"
 *                     | "rate_mismatch" | "low_cash",
 *         "camera_id"?: "<uuid>", "branch_id"?: "<uuid>", "timestamp"?: "<iso>" }
 */
import {
  DEFAULT_EVENT_SEVERITY,
  type EventType,
} from '../../../packages/core/src/index.ts';
import type { CameraEvent } from '../../../packages/core/src/index.ts';
import type { DbPort, NewCameraEvent } from '../_shared/db-port.ts';
import { badRequest, json, readJson } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';
import { processEvent, type PipelineDeps, type ProcessResult } from '../_shared/pipeline.ts';
import type { NotificationProvider, VisionAnalyzer } from '../../../packages/core/src/index.ts';
import type { SnapshotEnv } from '../_shared/snapshots.ts';

export const SIMULATE_SCENARIOS = [
  'camera_offline',
  'motion_after_hours',
  'suspicious',
  'rate_mismatch',
  'low_cash',
] as const;

export type SimulateScenario = (typeof SIMULATE_SCENARIOS)[number];

export interface SimulateDeps {
  db: DbPort;
  allowSimulate: boolean;
  vision: VisionAnalyzer;
  notifier: NotificationProvider;
  snapshotEnv: SnapshotEnv;
}

interface ScenarioSpec {
  eventType: EventType;
  needsCamera: boolean;
  payload: Record<string, unknown>;
}

const SCENARIOS: Record<SimulateScenario, ScenarioSpec> = {
  camera_offline: {
    eventType: 'camera_offline',
    needsCamera: true,
    payload: { simulated: true, note: 'signal lost (simulated)' },
  },
  motion_after_hours: {
    eventType: 'motion_detected',
    needsCamera: true,
    payload: { simulated: true, hint: 'person near the cashier desk' },
  },
  suspicious: {
    eventType: 'intrusion',
    needsCamera: true,
    payload: { simulated: true, hint: 'person in restricted area' },
  },
  rate_mismatch: {
    eventType: 'rate_deviation',
    needsCamera: false,
    payload: { simulated: true, currency: 'USD', deviation_pct: 3.35 },
  },
  low_cash: {
    eventType: 'cash_below_threshold',
    needsCamera: false,
    payload: { simulated: true, currency: 'USD' },
  },
};

export async function handleSimulate(req: Request, deps: SimulateDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!deps.allowSimulate) {
    log('warn', 'simulate rejected: ALLOW_SIMULATE is not true');
    return json(403, { error: 'simulate_disabled' });
  }
  const parsed = await readJson(req);
  if (!parsed.ok) return badRequest(parsed.error);
  const body = parsed.value as {
    scenario?: unknown;
    camera_id?: unknown;
    branch_id?: unknown;
    timestamp?: unknown;
  };
  if (typeof body.scenario !== 'string' || !(body.scenario in SCENARIOS)) {
    return badRequest(`scenario must be one of: ${SIMULATE_SCENARIOS.join(', ')}`);
  }
  const spec = SCENARIOS[body.scenario as SimulateScenario];

  const camera =
    typeof body.camera_id === 'string' ? await deps.db.getCamera(body.camera_id) : null;
  if (spec.needsCamera && !camera) {
    return badRequest('camera_id is required for this scenario');
  }
  const branchId =
    camera?.branch_id ??
    (typeof body.branch_id === 'string' ? body.branch_id : null);
  if (!branchId) return badRequest('branch_id is required when no camera_id is given');
  const branch = await deps.db.getBranch(branchId);
  if (!branch) return json(404, { error: 'branch_not_found' });

  const ts =
    typeof body.timestamp === 'string' && !Number.isNaN(new Date(body.timestamp).getTime())
      ? body.timestamp
      : new Date().toISOString();

  // For the offline scenario, age the camera's last_seen so escalation rules fire.
  if (body.scenario === 'camera_offline' && camera) {
    await deps.db.updateCameraStatus(
      camera.id,
      'offline',
      new Date(Date.now() - 40 * 60_000).toISOString(),
    );
  }

  const row: NewCameraEvent = {
    organization_id: branch.organization_id,
    branch_id: branch.id,
    camera_id: camera?.id ?? null,
    event_type: spec.eventType,
    source: 'manual',
    severity: DEFAULT_EVENT_SEVERITY[spec.eventType],
    timestamp: ts,
    raw_payload: spec.payload,
    snapshot_url: null,
    video_url: null,
    ai_analysis: null,
    dedupe_key: `simulate:${branch.id}:${camera?.id ?? 'nobranch-cam'}:${spec.eventType}:${Date.now()}`,
  };
  const event: CameraEvent = await deps.db.insertEvent(row);
  log('info', 'simulate: event created', { event_id: event.id, scenario: body.scenario });

  const pipelineDeps: PipelineDeps = {
    db: deps.db,
    vision: deps.vision,
    notifier: deps.notifier,
    snapshotEnv: deps.snapshotEnv,
  };
  const result: ProcessResult = await processEvent(event.id, pipelineDeps);
  return json(200, { scenario: body.scenario, ...result });
}
