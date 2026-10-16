/**
 * Splinter Mind — deterministic rules engine (pure functions, no I/O).
 *
 * Pipeline: provider event -> deterministic rules (DB `rules` table, evaluated
 * in order) -> only if a rule says `needs_ai` -> snapshot -> VisionAnalyzer ->
 * alert iff confidence/severity passes the rule's gates.
 *
 * Pure: every function here is a pure function of its arguments, so the whole
 * engine is unit-testable without a database. Side effects (cooldown writes,
 * alert inserts, AI calls) live in the edge-function layer.
 */

import type {
  EventType,
  Rule,
  RuleAction,
  RuleCondition,
  Severity,
  VisionAnalysis,
  WeekdayKey,
  WorkingHours,
} from './types.ts';

// ---------------------------------------------------------------------------
// Evaluation inputs
// ---------------------------------------------------------------------------

export interface RuleEvalEvent {
  id: string;
  organization_id: string;
  branch_id: string;
  camera_id: string | null;
  event_type: EventType;
  /** ISO timestamp of when the event happened (not when it was ingested). */
  timestamp: string;
  severity: Severity;
}

export interface BusinessFacts {
  cashAmount?: number;
  cashThreshold?: number;
  /** signed percent, e.g. +3.35 or -1.2 */
  deviationPct?: number;
  hoursSinceRateUpdate?: number;
}

export interface RuleEvalContext {
  now: Date;
  workingHours: WorkingHours | null;
  /** IANA timezone of the branch, e.g. "Asia/Bishkek" */
  timezone: string;
  cameraLastSeenAt: string | null;
  /** Present on the second pass, after analyze-event ran. */
  ai: VisionAnalysis | null;
  business?: BusinessFacts;
}

export interface CooldownRecord {
  cooldown_key: string;
  fired_at: string;
}

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

/** Cooldown scope: one rule firing for one camera (or whole branch if no camera). */
export function buildCooldownKey(ruleId: string, scopeId: string): string {
  return `${ruleId}:${scopeId}`;
}

export function isCooldownActive(
  key: string,
  records: readonly CooldownRecord[],
  now: Date,
  cooldownMinutes: number,
): boolean {
  if (cooldownMinutes <= 0) return false;
  const cutoff = now.getTime() - cooldownMinutes * 60_000;
  return records.some(
    (r) => r.cooldown_key === key && new Date(r.fired_at).getTime() > cutoff,
  );
}

// ---------------------------------------------------------------------------
// Working hours
// ---------------------------------------------------------------------------

const WEEKDAY_KEYS: readonly WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function localWeekdayAndMinutes(
  date: Date,
  timeZone: string,
): { weekday: WeekdayKey; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  const rawWd = get('weekday').toLowerCase().slice(0, 3);
  const weekday: WeekdayKey = (WEEKDAY_KEYS as readonly string[]).includes(rawWd)
    ? (rawWd as WeekdayKey)
    : 'mon';
  let hours = parseInt(get('hour'), 10);
  if (hours === 24) hours = 0; // some ICU builds emit 24:xx at midnight
  const minutes = (Number.isFinite(hours) ? hours : 0) * 60 + (parseInt(get('minute'), 10) || 0);
  return { weekday, minutes };
}

/**
 * True when `at` falls outside the branch working hours (in the branch tz).
 * Unknown/missing hours -> false (fail-open: do NOT burn AI budget on a guess).
 * A `closed: true` day counts as outside working hours.
 */
export function isOutsideWorkingHours(
  at: Date,
  workingHours: WorkingHours | null | undefined,
  timeZone: string,
): boolean {
  if (!workingHours) return false;
  const { weekday, minutes } = localWeekdayAndMinutes(at, timeZone);
  const day = workingHours[weekday];
  if (!day || day.closed || !day.open || !day.close) return true;
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (open === null || close === null) return false;
  if (close <= open) {
    // overnight window, e.g. 22:00 -> 06:00
    return !(minutes >= open || minutes < close);
  }
  return minutes < open || minutes >= close;
}

// ---------------------------------------------------------------------------
// Camera offline helpers
// ---------------------------------------------------------------------------

/** Minutes since the camera was last seen; null when unknown. */
export function offlineMinutes(lastSeenAt: string | null | undefined, now: Date): number | null {
  if (!lastSeenAt) return null;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now.getTime() - t) / 60_000);
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

function conditionMatches(
  cond: RuleCondition,
  eventTime: Date,
  ctx: RuleEvalContext,
): boolean {
  if (cond.offline_minutes_gt != null) {
    const mins = offlineMinutes(ctx.cameraLastSeenAt, ctx.now);
    if (mins === null || mins <= cond.offline_minutes_gt) return false;
  }
  if (cond.outside_working_hours) {
    if (!isOutsideWorkingHours(eventTime, ctx.workingHours, ctx.timezone)) return false;
  }
  const b = ctx.business;
  if (cond.amount_below_threshold) {
    if (b?.cashAmount == null || b?.cashThreshold == null) return false;
    if (b.cashAmount >= b.cashThreshold) return false;
  }
  if (cond.deviation_pct_gt != null) {
    if (b?.deviationPct == null) return false;
    if (Math.abs(b.deviationPct) <= cond.deviation_pct_gt) return false;
  }
  if (cond.hours_since_update_gt != null) {
    if (b?.hoursSinceRateUpdate == null) return false;
    if (b.hoursSinceRateUpdate <= cond.hours_since_update_gt) return false;
  }
  return true;
}

/**
 * Decide what a matching rule wants. Returns null when a needs_ai gate
 * rejects the AI result (low confidence / wrong risk band / likely false
 * positive) — i.e. "matched, but deliberately no alert".
 */
function decideAction(
  rule: Rule,
  ctx: RuleEvalContext,
): { action: 'alert' | 'ai_analysis'; severity?: Severity } | null {
  const cond = rule.condition;
  if (cond.needs_ai && !ctx.ai) {
    return { action: 'ai_analysis' };
  }
  if (cond.needs_ai && ctx.ai) {
    const ai = ctx.ai;
    if (cond.min_confidence != null && ai.confidence < cond.min_confidence) return null;
    if (cond.risk_levels && cond.risk_levels.length > 0 && !cond.risk_levels.includes(ai.risk_level)) {
      return null;
    }
    if (ai.likely_false_positive) return null;
    return { action: 'alert', severity: rule.severity };
  }
  return { action: 'alert', severity: rule.severity };
}

/**
 * Evaluate enabled rules for one event, in rule order.
 * Cooldowns suppress repeat firing per (rule, camera-or-branch).
 * AI-gating: a `needs_ai` rule yields `ai_analysis` on the first pass
 * (no AI yet) and `alert`/nothing on the second pass (AI present).
 */
export function evaluateRules(
  event: RuleEvalEvent,
  rules: readonly Rule[],
  ctx: RuleEvalContext,
  recentFires: readonly CooldownRecord[] = [],
): RuleAction[] {
  const actions: RuleAction[] = [];
  const eventTime = new Date(event.timestamp);
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.event_type !== event.event_type) continue;
    if (!conditionMatches(rule.condition, eventTime, ctx)) continue;
    const scopeId = event.camera_id ?? event.branch_id;
    const cooldownKey = buildCooldownKey(rule.id, scopeId);
    const decided = decideAction(rule, ctx);
    if (!decided) continue;
    if (isCooldownActive(cooldownKey, recentFires, ctx.now, rule.cooldown_minutes)) continue;
    actions.push({ ...decided, rule_id: rule.id, cooldown_key: cooldownKey });
  }
  return actions;
}
