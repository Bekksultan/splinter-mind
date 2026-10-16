/**
 * process-event orchestration: the rules-engine pipeline as deployable logic.
 *
 *   event (claimed atomically -> idempotent)
 *     -> load branch/camera/rules
 *     -> deterministic rules, pass 1
 *     -> if any rule wants ai_analysis: capture snapshot -> VisionAnalyzer
 *        (failure -> ai_analysis {status:'pending'}, pipeline continues)
 *     -> deterministic rules, pass 2 (with AI context)
 *     -> create ONE alert per event (idempotent on event_id)
 *     -> record cooldown fires
 *     -> fan out push notifications
 *
 * Pure rule evaluation lives in @splinter-mind/core; this module does I/O.
 */
import {
  buildCooldownKey,
  evaluateRules,
  isOutsideWorkingHours,
  isVisionAnalysis,
  type BusinessFacts,
  type CooldownRecord,
  type EventType,
  type RuleEvalContext,
  type RuleEvalEvent,
  type Severity,
  type VisionAnalysis,
} from '../../../packages/core/src/index.ts';
import { SEVERITY_RANK } from '../../../packages/core/src/index.ts';
import type { NotificationProvider, VisionAnalyzer } from '../../../packages/core/src/index.ts';
import type { CameraEvent } from '../../../packages/core/src/index.ts';
import type { DbPort, NewAlert } from './db-port.ts';
import { log } from './log.ts';
import { captureSnapshot, type SnapshotEnv } from './snapshots.ts';
import { fanOutAlertNotifications, type FanoutSummary } from './notifications.ts';

export interface PipelineDeps {
  db: DbPort;
  vision: VisionAnalyzer;
  notifier: NotificationProvider;
  snapshotEnv: SnapshotEnv;
  now?: () => Date;
}

export interface ProcessResult {
  status: 'processed' | 'already_processed' | 'no_event';
  event_id: string;
  actions: Array<{ action: string; severity?: Severity; rule_id?: string }>;
  alert_id: string | null;
  alert_deduplicated?: boolean;
  notification?: FanoutSummary;
}

const EVENT_TITLES: Record<EventType, string> = {
  motion_detected: 'Motion detected',
  line_crossing: 'Line crossing detected',
  intrusion: 'Security event detected',
  camera_offline: 'Camera offline',
  camera_online: 'Camera back online',
  video_loss: 'Video signal lost',
  tampering: 'Camera tampering detected',
  person_detected: 'Person detected',
  vehicle_detected: 'Vehicle detected',
  restricted_area: 'Restricted area event',
  rate_not_updated: 'Exchange rate not synchronized',
  rate_deviation: 'Exchange rate deviation',
  cash_below_threshold: 'Cash balance below threshold',
  shift_no_show: 'Employee shift no-show',
  info: 'Information',
};

function toRuleEvalEvent(event: CameraEvent): RuleEvalEvent {
  return {
    id: event.id,
    organization_id: event.organization_id,
    branch_id: event.branch_id,
    camera_id: event.camera_id,
    event_type: event.event_type,
    timestamp: event.timestamp,
    severity: event.severity,
  };
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Business facts for business rules: prefer the event payload, else DB. */
async function buildBusinessFacts(db: DbPort, event: CameraEvent, now: Date): Promise<BusinessFacts> {
  const p = event.raw_payload ?? {};
  const facts: BusinessFacts = {
    cashAmount: num(p['amount']),
    cashThreshold: num(p['threshold']),
    deviationPct: num(p['deviation_pct']),
    hoursSinceRateUpdate: num(p['hours_since_update']),
  };
  const currency = typeof p['currency'] === 'string' ? p['currency'] : 'USD';

  if (
    event.event_type === 'cash_below_threshold' &&
    (facts.cashAmount === undefined || facts.cashThreshold === undefined)
  ) {
    const balances = await db.getCashBalances(event.branch_id);
    const b = balances.find((x) => x.currency === currency);
    if (b) {
      facts.cashAmount = Number(b.amount);
      facts.cashThreshold = Number(b.threshold);
    }
  }
  if (event.event_type === 'rate_deviation' || event.event_type === 'rate_not_updated') {
    const rates = await db.getLatestRates(event.branch_id);
    const r = rates.find((x) => x.currency === currency);
    if (r) {
      if (facts.deviationPct === undefined && r.previous_sell_rate && Number(r.previous_sell_rate) !== 0) {
        const sell = Number(r.sell_rate);
        facts.deviationPct = ((sell - Number(r.previous_sell_rate)) / Number(r.previous_sell_rate)) * 100;
      }
      if (facts.hoursSinceRateUpdate === undefined) {
        facts.hoursSinceRateUpdate = Math.max(
          0,
          (now.getTime() - new Date(r.created_at).getTime()) / 3_600_000,
        );
      }
    }
  }
  return facts;
}

function buildAlertTitle(event: CameraEvent): string {
  return EVENT_TITLES[event.event_type] ?? 'Event';
}

function buildAlertDescription(
  event: CameraEvent,
  branchName: string | undefined,
  cameraName: string | undefined,
  ai: VisionAnalysis | null,
): string {
  const parts: string[] = [];
  if (branchName) parts.push(branchName);
  if (cameraName) parts.push(`camera "${cameraName}"`);
  let desc = `${EVENT_TITLES[event.event_type] ?? 'Event'}${parts.length ? ` at ${parts.join(', ')}` : ''}.`;
  if (ai?.summary) desc += ` AI: ${ai.summary}`;
  const p = event.raw_payload ?? {};
  if (typeof p['currency'] === 'string' && num(p['deviation_pct']) !== undefined) {
    desc += ` Deviation: ${Number(p['deviation_pct']).toFixed(2)}%.`;
  }
  if (typeof p['currency'] === 'string' && num(p['amount']) !== undefined) {
    desc += ` Balance: ${p['currency']} ${p['amount']}.`;
  }
  return desc;
}

export async function processEvent(eventId: string, deps: PipelineDeps): Promise<ProcessResult> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();

  // Idempotency: atomic claim. Losers (or replays) see processed_at set.
  const event = await db.claimEvent(eventId);
  if (!event) {
    const existing = await db.getEvent(eventId);
    if (!existing) {
      log('warn', 'process-event: unknown event', { event_id: eventId });
      return { status: 'no_event', event_id: eventId, actions: [], alert_id: null };
    }
    log('info', 'process-event: already processed, skipping', { event_id: eventId });
    return { status: 'already_processed', event_id: eventId, actions: [], alert_id: null };
  }

  const [branch, camera, rules] = await Promise.all([
    db.getBranch(event.branch_id),
    event.camera_id ? db.getCamera(event.camera_id) : Promise.resolve(null),
    db.getRules(event.organization_id),
  ]);

  // Measure offline duration from the last real sighting — capture it BEFORE
  // the status bookkeeping below overwrites last_seen_at.
  const cameraLastSeenAt = camera?.last_seen_at ?? null;

  // Keep camera presence fresh from device events.
  if (camera && event.event_type === 'camera_offline') {
    await db.updateCameraStatus(camera.id, 'offline', event.timestamp).catch((e: unknown) =>
      log('warn', 'camera status update failed', { event_id: eventId, error: String(e) }),
    );
  } else if (camera && event.event_type === 'camera_online') {
    await db.updateCameraStatus(camera.id, 'online', event.timestamp).catch((e: unknown) =>
      log('warn', 'camera status update failed', { event_id: eventId, error: String(e) }),
    );
  }

  const business = await buildBusinessFacts(db, event, now);
  const ctx: RuleEvalContext = {
    now,
    workingHours: branch?.working_hours ?? null,
    timezone: branch?.timezone ?? 'UTC',
    cameraLastSeenAt,
    ai: null,
    business,
  };

  const scopeId = event.camera_id ?? event.branch_id;
  const maxCooldown = rules.reduce((m, r) => Math.max(m, r.cooldown_minutes), 0);
  const recentFires: CooldownRecord[] = maxCooldown > 0
    ? (await db.getRecentFires(
        rules.map((r) => r.id),
        new Date(now.getTime() - maxCooldown * 60_000).toISOString(),
      )).map((f) => ({ cooldown_key: f.cooldown_key, fired_at: f.fired_at }))
    : [];

  const evalEvent = toRuleEvalEvent(event);
  const firstPass = evaluateRules(evalEvent, rules, ctx, recentFires);
  const firedKeys = new Set<string>();
  const recordFire = async (ruleId: string | undefined, cooldownKey: string | undefined): Promise<void> => {
    if (!ruleId || !cooldownKey || firedKeys.has(cooldownKey)) return;
    firedKeys.add(cooldownKey);
    await db.recordFire({ organization_id: event.organization_id, rule_id: ruleId, cooldown_key: cooldownKey });
  };

  let ai: VisionAnalysis | null =
    event.ai_analysis && isVisionAnalysis(event.ai_analysis) ? event.ai_analysis : null;

  const needsAi = firstPass.some((a) => a.action === 'ai_analysis');
  if (needsAi) {
    for (const a of firstPass) {
      if (a.action === 'ai_analysis') await recordFire(a.rule_id, a.cooldown_key);
    }
    if (camera) {
      try {
        let snapshotUrl = event.snapshot_url;
        if (!snapshotUrl) {
          snapshotUrl = await captureSnapshot(db, camera, deps.snapshotEnv);
          await db.updateEvent(event.id, { snapshot_url: snapshotUrl });
        }
        const hint = typeof event.raw_payload['hint'] === 'string' ? event.raw_payload['hint'] : undefined;
        const analysis = await deps.vision.analyzeImage(
          { url: snapshotUrl },
          {
            branch_name: branch?.name,
            camera_name: camera.name,
            event_type: event.event_type,
            timestamp: event.timestamp,
            outside_working_hours: isOutsideWorkingHours(
              new Date(event.timestamp),
              ctx.workingHours,
              ctx.timezone,
            ),
            hint,
          },
        );
        ai = analysis;
        await db.updateEvent(event.id, { ai_analysis: analysis });
        log('info', 'AI analysis completed', {
          event_id: event.id,
          risk_level: analysis.risk_level,
          confidence: analysis.confidence,
        });
      } catch (err) {
        // Graceful degradation: the event is stored; AI can be retried later.
        const reason = err instanceof Error ? err.message : String(err);
        await db.updateEvent(event.id, { ai_analysis: { status: 'pending', reason } });
        log('error', 'AI analysis failed, marked pending', { event_id: event.id, error: reason });
      }
    } else {
      log('warn', 'rule wanted AI but event has no camera; skipping AI', { event_id: event.id });
    }
  }

  const secondPass =
    needsAi && ai ? evaluateRules(evalEvent, rules, { ...ctx, ai }, recentFires) : [];

  const alertActions = [
    ...firstPass.filter((a) => a.action === 'alert'),
    ...secondPass.filter((a) => a.action === 'alert'),
  ];

  const result: ProcessResult = {
    status: 'processed',
    event_id: eventId,
    actions: [...firstPass, ...secondPass].map((a) => ({
      action: a.action,
      severity: a.severity,
      rule_id: a.rule_id,
    })),
    alert_id: null,
  };

  // One alert per event: when several rules fire, the most severe wins.
  // All firing rules still get their cooldown recorded.
  const ranked = [...alertActions].sort(
    (a, b) => SEVERITY_RANK[b.severity ?? 'info'] - SEVERITY_RANK[a.severity ?? 'info'],
  );
  const chosen = ranked[0];
  if (chosen) {
    // Idempotent on event_id: concurrent pipelines converge on one alert.
    const existingAlert = await db.getAlertByEventId(event.id);
    if (existingAlert) {
      result.alert_id = existingAlert.id;
      result.alert_deduplicated = true;
      log('info', 'alert already exists for event', { event_id: eventId, alert_id: existingAlert.id });
    } else {
      const row: NewAlert = {
        organization_id: event.organization_id,
        branch_id: event.branch_id,
        event_id: event.id,
        title: buildAlertTitle(event),
        description: buildAlertDescription(event, branch?.name, camera?.name ?? undefined, ai),
        severity: chosen.severity ?? event.severity,
        status: 'open',
        assigned_to: null,
      };
      const created = await db.insertAlert(row);
      result.alert_id = created.id;
      for (const a of ranked) await recordFire(a.rule_id, a.cooldown_key);
      log('info', 'alert created', {
        event_id: eventId,
        alert_id: created.id,
        severity: created.severity,
        rule_id: chosen.rule_id,
      });
      result.notification = await fanOutAlertNotifications(db, deps.notifier, created, now);
    }
  } else {
    log('info', 'no alert-worthy action for event', { event_id: eventId });
  }

  return result;
}
