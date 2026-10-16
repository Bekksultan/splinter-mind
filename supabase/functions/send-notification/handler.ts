/**
 * POST /send-notification
 * Body: { "alert_id": "<uuid>" }
 * Fans out Expo push notifications for an alert, honoring each user's
 * notification_prefs (enabled, severities, quiet hours; critical bypasses).
 */
import type { NotificationProvider } from '../../../packages/core/src/index.ts';
import type { DbPort } from '../_shared/db-port.ts';
import { badRequest, json, readJson } from '../_shared/http.ts';
import { ExpoPushProvider, fanOutAlertNotifications } from '../_shared/notifications.ts';
import { log } from '../_shared/log.ts';

export interface SendNotificationDeps {
  db: DbPort;
  notifier: NotificationProvider;
}

export async function handleSendNotification(
  req: Request,
  deps: SendNotificationDeps,
): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const parsed = await readJson(req);
  if (!parsed.ok) return badRequest(parsed.error);
  const alertId = (parsed.value as { alert_id?: unknown }).alert_id;
  if (typeof alertId !== 'string' || alertId.length === 0) {
    return badRequest('alert_id is required');
  }
  const alert = await deps.db.getAlert(alertId);
  if (!alert) return json(404, { error: 'alert_not_found', alert_id: alertId });
  const summary = await fanOutAlertNotifications(deps.db, deps.notifier, alert);
  log('info', 'send-notification done', { alert_id: alertId, ...summary, errors: summary.errors });
  return json(200, { alert_id: alertId, ...summary });
}
