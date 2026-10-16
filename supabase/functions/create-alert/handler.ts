/**
 * POST /create-alert
 * Body: { "event_id"?: "<uuid>", "title": "...", "description"?: "...",
 *         "severity": "critical|high|medium|low|info",
 *         "organization_id"?: "<uuid>", "branch_id"?: "<uuid>",   // when no event_id
 *         "rule_id"?: "<uuid>", "cooldown_key"?: "..." }
 * Idempotent on event_id: at most one alert per event (unique constraint).
 * Returns 201 on create, 200 with deduplicated:true when it already exists.
 */
import { SEVERITIES, type Severity } from '../../../packages/core/src/index.ts';
import type { DbPort, NewAlert } from '../_shared/db-port.ts';
import { badRequest, json, readJson } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';

export interface CreateAlertDeps {
  db: DbPort;
}

export async function handleCreateAlert(req: Request, deps: CreateAlertDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const parsed = await readJson(req);
  if (!parsed.ok) return badRequest(parsed.error);
  const body = parsed.value as Record<string, unknown>;

  const title = body['title'];
  const severity = body['severity'];
  if (typeof title !== 'string' || title.trim().length === 0) {
    return badRequest('title is required');
  }
  if (typeof severity !== 'string' || !(SEVERITIES as readonly string[]).includes(severity)) {
    return badRequest(`severity must be one of: ${(SEVERITIES as readonly string[]).join(', ')}`);
  }
  const description = typeof body['description'] === 'string' ? body['description'] : null;
  const eventId = typeof body['event_id'] === 'string' ? body['event_id'] : null;
  const ruleId = typeof body['rule_id'] === 'string' ? body['rule_id'] : undefined;
  const cooldownKey = typeof body['cooldown_key'] === 'string' ? body['cooldown_key'] : undefined;

  let organizationId: string;
  let branchId: string;

  if (eventId) {
    const existing = await deps.db.getAlertByEventId(eventId);
    if (existing) return json(200, { alert_id: existing.id, deduplicated: true });
    const event = await deps.db.getEvent(eventId);
    if (!event) return json(404, { error: 'event_not_found', event_id: eventId });
    organizationId = event.organization_id;
    branchId = event.branch_id;
  } else {
    if (typeof body['organization_id'] !== 'string' || typeof body['branch_id'] !== 'string') {
      return badRequest('organization_id and branch_id are required when event_id is absent');
    }
    organizationId = body['organization_id'];
    branchId = body['branch_id'];
  }

  const row: NewAlert = {
    organization_id: organizationId,
    branch_id: branchId,
    event_id: eventId,
    title: title.trim(),
    description,
    severity: severity as Severity,
    status: 'open',
    assigned_to: null,
  };
  const created = await deps.db.insertAlert(row);
  if (ruleId && cooldownKey) {
    await deps.db.recordFire({ organization_id: organizationId, rule_id: ruleId, cooldown_key: cooldownKey });
  }
  log('info', 'alert created via create-alert', {
    alert_id: created.id,
    event_id: eventId,
    severity: created.severity,
  });
  return json(201, { alert_id: created.id });
}
