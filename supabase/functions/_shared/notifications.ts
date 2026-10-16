/**
 * Notification fan-out: Expo push to the org's operational users, honoring
 * per-user notification_prefs (enabled flag, severity filter, quiet hours).
 * Critical alerts bypass quiet hours.
 * WhatsApp (Meta Cloud API, approved template) is an optional second channel:
 * it is attempted only when WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set
 * and the user opted in with a valid number. Every provider call is wrapped
 * so one failing recipient never breaks the batch.
 */
import {
  DEFAULT_WHATSAPP_TEMPLATE_NAME,
  WhatsAppCloudApiProvider,
  fetchWithRetry,
  isValidE164,
  type NotificationProvider,
  type PushMessage,
  type SendResult,
  type WhatsAppAlertSender,
} from '../../../packages/core/src/index.ts';
import type {
  Alert,
  NotificationPref,
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
  whatsapp_targeted: number;
  whatsapp_delivered: number;
  whatsapp_errors: string[];
}

/** Server-side WhatsApp env. Missing token/phoneNumberId disables the channel. */
export interface WhatsAppEnv {
  token?: string;
  phoneNumberId?: string;
  templateName?: string;
}

/**
 * Builds the WhatsApp provider from env, or null when not configured.
 * Null is not an error: the push batch proceeds normally.
 */
export function createWhatsAppProvider(env: WhatsAppEnv): WhatsAppCloudApiProvider | null {
  if (!env.token || !env.phoneNumberId) {
    log('info', 'whatsapp channel disabled: WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set');
    return null;
  }
  return new WhatsAppCloudApiProvider(
    { token: env.token, phoneNumberId: env.phoneNumberId },
    { name: env.templateName || DEFAULT_WHATSAPP_TEMPLATE_NAME },
  );
}

export async function fanOutAlertNotifications(
  db: DbPort,
  notifier: NotificationProvider,
  alert: Alert,
  now: Date = new Date(),
  whatsapp: WhatsAppAlertSender | null = null,
): Promise<FanoutSummary> {
  const users = await db.getNotificationUsers(alert.organization_id);
  const summary: FanoutSummary = {
    users_targeted: 0,
    delivered: 0,
    skipped_quiet_hours: 0,
    errors: [],
    whatsapp_targeted: 0,
    whatsapp_delivered: 0,
    whatsapp_errors: [],
  };
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

  await fanOutWhatsApp(db, whatsapp, alert, prefByUser, summary, now);

  log('info', 'notification fan-out complete', {
    alert_id: alert.id,
    users_targeted: summary.users_targeted,
    delivered: summary.delivered,
    skipped_quiet_hours: summary.skipped_quiet_hours,
    errors: summary.errors.length,
    whatsapp_targeted: summary.whatsapp_targeted,
    whatsapp_delivered: summary.whatsapp_delivered,
    whatsapp_errors: summary.whatsapp_errors.length,
  });
  return summary;
}

/**
 * WhatsApp leg of the fan-out. Gated per user by: whatsapp_enabled,
 * a valid E.164 whatsapp_number, the alert severity in their severities,
 * and the same quiet-hours rule as push (critical bypasses).
 * One failing recipient never breaks the others.
 */
async function fanOutWhatsApp(
  db: DbPort,
  whatsapp: WhatsAppAlertSender | null,
  alert: Alert,
  prefByUser: Map<string, NotificationPref>,
  summary: FanoutSummary,
  now: Date,
): Promise<void> {
  if (!whatsapp) return; // channel not configured — push batch already done
  const branch = await db.getBranch(alert.branch_id).catch(() => null);
  for (const [userId, pref] of prefByUser) {
    if (!pref.whatsapp_enabled) continue;
    const to = (pref.whatsapp_number ?? '').trim();
    if (!isValidE164(to)) {
      if (to) summary.whatsapp_errors.push(`user ${userId}: invalid whatsapp_number`);
      continue;
    }
    if (!pref.severities.includes(alert.severity as Severity)) continue;
    if (pref.quiet_hours && alert.severity !== 'critical' && isQuietNow(pref.quiet_hours, now)) {
      summary.skipped_quiet_hours += 1;
      continue;
    }
    summary.whatsapp_targeted += 1;
    try {
      const result = await whatsapp.sendAlertTemplate(to, {
        severity: alert.severity,
        branchName: branch?.name ?? 'Unknown branch',
        title: alert.title,
        timestamp: alert.created_at,
      });
      if (result.ok) {
        summary.whatsapp_delivered += 1;
      } else {
        summary.whatsapp_errors.push(`user ${userId}: ${result.error ?? 'send failed'}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.whatsapp_errors.push(`user ${userId}: ${msg}`);
      log('error', 'whatsapp send threw', { alert_id: alert.id, error: msg });
    }
  }
}
