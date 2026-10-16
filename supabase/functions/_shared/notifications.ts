/**
 * Notification fan-out: Expo push to the org's operational users, honoring
 * per-user notification_prefs (enabled flag, severity filter, quiet hours).
 * Critical alerts bypass quiet hours. WhatsApp is stubbed (optional channel).
 * Every provider call is wrapped so one failing token never breaks the batch.
 */
import {
  fetchWithRetry,
  type NotificationProvider,
  type PushMessage,
  type SendResult,
} from '../../../packages/core/src/index.ts';
import type {
  Alert,
  QuietHours,
  Severity,
} from '../../../packages/core/src/index.ts';
import type { DbPort } from './db-port.ts';
import { log } from './log.ts';

/** Real Expo push sender (server-side only). */
export class ExpoPushProvider implements NotificationProvider {
  async sendPush(tokens: string[], message: PushMessage): Promise<SendResult> {
    if (tokens.length === 0) return { ok: true, delivered: 0 };
    try {
      const res = await fetchWithRetry(
        'https://exp.host/--/api/v2/push/send',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: tokens,
            title: message.title,
            body: message.body,
            data: message.data ?? {},
            priority: 'high',
            channelId: 'alerts',
          }),
        },
        { timeoutMs: 10000, retries: 2 },
      );
      const body = (await res.json().catch(() => ({}))) as {
        data?: Array<{ status?: string }>;
      };
      const delivered = body.data?.filter((t) => t.status === 'ok').length ?? 0;
      if (!res.ok) {
        return { ok: false, delivered, error: `expo push http ${res.status}` };
      }
      return { ok: true, delivered };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async sendWhatsApp(_to: string, _text: string): Promise<SendResult> {
    // Optional channel — stubbed until a WhatsApp provider is wired.
    return { ok: false, error: 'whatsapp_not_configured' };
  }
}

function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '0';
  let h = parseInt(get('hour'), 10);
  if (h === 24) h = 0;
  return h * 60 + parseInt(get('minute'), 10);
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

export function isQuietNow(qh: QuietHours, now: Date): boolean {
  const start = toMinutes(qh.start);
  const end = toMinutes(qh.end);
  if (start === null || end === null) return false;
  const mins = localMinutes(now, qh.timezone);
  return start <= end ? mins >= start && mins < end : mins >= start || mins < end;
}

export interface FanoutSummary {
  users_targeted: number;
  delivered: number;
  skipped_quiet_hours: number;
  errors: string[];
}

export async function fanOutAlertNotifications(
  db: DbPort,
  notifier: NotificationProvider,
  alert: Alert,
  now: Date = new Date(),
): Promise<FanoutSummary> {
  const users = await db.getNotificationUsers(alert.organization_id);
  const summary: FanoutSummary = { users_targeted: 0, delivered: 0, skipped_quiet_hours: 0, errors: [] };
  if (users.length === 0) {
    log('warn', 'no notification users for org', { alert_id: alert.id, org_id: alert.organization_id });
    return summary;
  }
  const userIds = users.map((u) => u.id);
  const [tokens, prefs] = await Promise.all([
    db.getPushTokens(userIds),
    db.getNotificationPrefs(userIds),
  ]);
  const prefByUser = new Map(prefs.map((p) => [p.user_id, p]));
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokens) {
    const pref = prefByUser.get(t.user_id);
    if (pref && !pref.push_enabled) continue;
    if (pref && !pref.severities.includes(alert.severity as Severity)) continue;
    if (pref?.quiet_hours && alert.severity !== 'critical' && isQuietNow(pref.quiet_hours, now)) {
      summary.skipped_quiet_hours += 1;
      continue;
    }
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push(t.expo_push_token);
    tokensByUser.set(t.user_id, list);
  }

  const message: PushMessage = {
    title: `${alert.severity.toUpperCase()}: ${alert.title}`,
    body: alert.description ?? alert.title,
    data: { alert_id: alert.id, branch_id: alert.branch_id, severity: alert.severity },
  };

  for (const [userId, userTokens] of tokensByUser) {
    summary.users_targeted += 1;
    try {
      const result = await notifier.sendPush(userTokens, message);
      summary.delivered += result.delivered ?? 0;
      if (!result.ok) summary.errors.push(`user ${userId}: ${result.error ?? 'send failed'}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`user ${userId}: ${msg}`);
      log('error', 'push send threw', { alert_id: alert.id, error: msg });
    }
  }
  log('info', 'notification fan-out complete', {
    alert_id: alert.id,
    users_targeted: summary.users_targeted,
    delivered: summary.delivered,
    skipped_quiet_hours: summary.skipped_quiet_hours,
    errors: summary.errors.length,
  });
  return summary;
}
