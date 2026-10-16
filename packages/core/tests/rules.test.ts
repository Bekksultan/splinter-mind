/**
 * Rules engine tests: evaluation, cooldowns, severity escalation, AI gating.
 *
 * Timezone notes: branch timezone is Asia/Bishkek (UTC+6, no DST).
 * 2026-10-16 is a Friday.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCooldownKey,
  evaluateRules,
  isCooldownActive,
  isOutsideWorkingHours,
  offlineMinutes,
  type CooldownRecord,
  type RuleEvalContext,
  type RuleEvalEvent,
} from '../src/rules.ts';
import type { Rule, WorkingHours } from '../src/types.ts';

const TZ = 'Asia/Bishkek';
const ORG = 'org-1';
const BRANCH = 'branch-14';

const WORKING_HOURS: WorkingHours = {
  mon: { open: '09:00', close: '18:00' },
  tue: { open: '09:00', close: '18:00' },
  wed: { open: '09:00', close: '18:00' },
  thu: { open: '09:00', close: '18:00' },
  fri: { open: '09:00', close: '18:00' },
  sat: { open: '10:00', close: '14:00' },
  sun: { closed: true },
};

function rule(over: Partial<Rule>): Rule {
  return {
    id: 'rule-1',
    organization_id: ORG,
    name: 'test rule',
    event_type: 'motion_detected',
    condition: {},
    severity: 'medium',
    cooldown_minutes: 30,
    enabled: true,
    created_at: '2026-10-16T00:00:00Z',
    ...over,
  };
}

function baseEvent(over: Partial<RuleEvalEvent> = {}): RuleEvalEvent {
  return {
    id: 'evt-1',
    organization_id: ORG,
    branch_id: BRANCH,
    camera_id: 'cam-1',
    event_type: 'motion_detected',
    timestamp: '2026-10-16T08:00:00Z', // 14:00 Bishkek, Friday — inside hours
    severity: 'low',
    ...over,
  };
}

function baseCtx(over: Partial<RuleEvalContext> = {}): RuleEvalContext {
  return {
    now: new Date('2026-10-16T08:30:00Z'),
    workingHours: WORKING_HOURS,
    timezone: TZ,
    cameraLastSeenAt: null,
    ai: null,
    ...over,
  };
}

describe('isOutsideWorkingHours', () => {
  it('is false during business hours on a weekday', () => {
    // Friday 14:00 Bishkek
    expect(isOutsideWorkingHours(new Date('2026-10-16T08:00:00Z'), WORKING_HOURS, TZ)).toBe(false);
  });
  it('is true at 02:17 on a weekday', () => {
    // Friday 02:17 Bishkek
    expect(isOutsideWorkingHours(new Date('2026-10-15T20:17:00Z'), WORKING_HOURS, TZ)).toBe(true);
  });
  it('is true on a closed Sunday', () => {
    // Sunday 12:00 Bishkek
    expect(isOutsideWorkingHours(new Date('2026-10-18T06:00:00Z'), WORKING_HOURS, TZ)).toBe(true);
  });
  it('is false on Saturday morning inside hours', () => {
    // Saturday 11:00 Bishkek
    expect(isOutsideWorkingHours(new Date('2026-10-17T05:00:00Z'), WORKING_HOURS, TZ)).toBe(false);
  });
  it('is false when working hours are unknown (fail-open, no AI burn)', () => {
    expect(isOutsideWorkingHours(new Date('2026-10-15T20:17:00Z'), null, TZ)).toBe(false);
  });
  it('handles overnight windows', () => {
    const wh: WorkingHours = {
      fri: { open: '22:00', close: '06:00' },
      sat: { open: '22:00', close: '06:00' },
    };
    expect(isOutsideWorkingHours(new Date('2026-10-16T18:00:00Z'), wh, TZ)).toBe(false); // 00:00 Sat Bishkek
    expect(isOutsideWorkingHours(new Date('2026-10-16T08:00:00Z'), wh, TZ)).toBe(true); // 14:00 Fri Bishkek
  });
});

describe('offlineMinutes', () => {
  it('computes minutes since last seen', () => {
    const now = new Date('2026-10-16T08:30:00Z');
    expect(offlineMinutes('2026-10-16T08:00:00Z', now)).toBeCloseTo(30, 5);
  });
  it('returns null when unknown', () => {
    expect(offlineMinutes(null, new Date())).toBeNull();
  });
});

describe('cooldowns', () => {
  it('builds stable keys per rule+scope', () => {
    expect(buildCooldownKey('r1', 'cam-1')).toBe('r1:cam-1');
    expect(buildCooldownKey('r1', 'cam-1')).toBe(buildCooldownKey('r1', 'cam-1'));
    expect(buildCooldownKey('r1', 'cam-1')).not.toBe(buildCooldownKey('r1', 'cam-2'));
  });
  it('suppresses within the window, releases after', () => {
    const records: CooldownRecord[] = [{ cooldown_key: 'r1:cam-1', fired_at: '2026-10-16T08:00:00Z' }];
    const now = new Date('2026-10-16T08:20:00Z');
    expect(isCooldownActive('r1:cam-1', records, now, 30)).toBe(true);
    expect(isCooldownActive('r1:cam-1', records, new Date('2026-10-16T08:31:00Z'), 30)).toBe(false);
    expect(isCooldownActive('r1:cam-2', records, now, 30)).toBe(false);
  });
});

describe('camera offline severity escalation', () => {
  const rules = [
    rule({ id: 'r-off-5', event_type: 'camera_offline', condition: { offline_minutes_gt: 5 }, severity: 'medium', cooldown_minutes: 60 }),
    rule({ id: 'r-off-30', event_type: 'camera_offline', condition: { offline_minutes_gt: 30 }, severity: 'high', cooldown_minutes: 120 }),
  ];
  const evt = baseEvent({ event_type: 'camera_offline' });

  it('offline 17 minutes -> medium only', () => {
    const ctx = baseCtx({ cameraLastSeenAt: '2026-10-16T08:13:00Z', now: new Date('2026-10-16T08:30:00Z') });
    const actions = evaluateRules(evt, rules, ctx);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: 'alert', severity: 'medium', rule_id: 'r-off-5' });
  });

  it('offline 40 minutes -> medium AND high (escalation)', () => {
    const ctx = baseCtx({ cameraLastSeenAt: '2026-10-16T07:50:00Z', now: new Date('2026-10-16T08:30:00Z') });
    const actions = evaluateRules(evt, rules, ctx);
    const sev = actions.map((a) => a.severity).sort();
    expect(sev).toEqual(['high', 'medium']);
  });

  it('offline 3 minutes -> no alert', () => {
    const ctx = baseCtx({ cameraLastSeenAt: '2026-10-16T08:27:00Z', now: new Date('2026-10-16T08:30:00Z') });
    expect(evaluateRules(evt, rules, ctx)).toHaveLength(0);
  });

  it('cooldown suppresses the repeat alert', () => {
    const ctx = baseCtx({ cameraLastSeenAt: '2026-10-16T08:13:00Z', now: new Date('2026-10-16T08:30:00Z') });
    const fires: CooldownRecord[] = [{ cooldown_key: 'r-off-5:cam-1', fired_at: '2026-10-16T08:00:00Z' }];
    const actions = evaluateRules(evt, rules, ctx, fires);
    expect(actions).toHaveLength(0);
  });
});

describe('AI gating', () => {
  const aiRule = rule({
    id: 'r-ai',
    event_type: 'motion_detected',
    condition: { outside_working_hours: true, needs_ai: true, min_confidence: 0.7, risk_levels: ['high', 'critical'] },
    severity: 'high',
  });

  it('business-hours motion -> no AI, no alert (rule does not match)', () => {
    const evt = baseEvent({ timestamp: '2026-10-16T08:00:00Z' }); // 14:00 Bishkek
    const actions = evaluateRules(evt, [aiRule], baseCtx());
    expect(actions).toHaveLength(0);
  });

  it('after-hours motion, first pass -> ai_analysis action', () => {
    const evt = baseEvent({ timestamp: '2026-10-15T20:17:00Z' }); // 02:17 Bishkek
    const actions = evaluateRules(evt, [aiRule], baseCtx());
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: 'ai_analysis', rule_id: 'r-ai' });
    expect(actions[0]?.cooldown_key).toBe('r-ai:cam-1');
  });

  it('after-hours motion, second pass with high-risk AI -> alert', () => {
    const evt = baseEvent({ timestamp: '2026-10-15T20:17:00Z' });
    const ctx = baseCtx({
      ai: {
        person_detected: true,
        restricted_area: true,
        outside_working_hours: true,
        confidence: 0.94,
        risk_level: 'high',
        summary: 'A person appears to be present in the cashier area outside working hours.',
        objects_visible: ['person'],
        likely_false_positive: false,
      },
    });
    const actions = evaluateRules(evt, [aiRule], ctx);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: 'alert', severity: 'high', rule_id: 'r-ai' });
  });

  it('second pass with low-confidence AI -> no alert', () => {
    const evt = baseEvent({ timestamp: '2026-10-15T20:17:00Z' });
    const ctx = baseCtx({
      ai: {
        person_detected: false, restricted_area: false, outside_working_hours: true,
        confidence: 0.2, risk_level: 'low', summary: 'Nothing unusual.', objects_visible: [],
        likely_false_positive: true,
      },
    });
    expect(evaluateRules(evt, [aiRule], ctx)).toHaveLength(0);
  });
});

describe('business rules', () => {
  it('cash below threshold -> alert', () => {
    const r = rule({
      id: 'r-cash', event_type: 'cash_below_threshold',
      condition: { amount_below_threshold: true }, severity: 'medium',
    });
    const evt = baseEvent({ event_type: 'cash_below_threshold', camera_id: null });
    const ctx = baseCtx({ business: { cashAmount: 2400, cashThreshold: 5000 } });
    const actions = evaluateRules(evt, [r], ctx);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.cooldown_key).toBe('r-cash:branch-14'); // branch scope when no camera
  });

  it('cash above threshold -> no alert', () => {
    const r = rule({
      id: 'r-cash', event_type: 'cash_below_threshold',
      condition: { amount_below_threshold: true }, severity: 'medium',
    });
    const evt = baseEvent({ event_type: 'cash_below_threshold', camera_id: null });
    const ctx = baseCtx({ business: { cashAmount: 24500, cashThreshold: 5000 } });
    expect(evaluateRules(evt, [r], ctx)).toHaveLength(0);
  });

  it('rate deviation beyond tolerance -> alert', () => {
    const r = rule({
      id: 'r-rate', event_type: 'rate_deviation',
      condition: { deviation_pct_gt: 2 }, severity: 'high',
    });
    const evt = baseEvent({ event_type: 'rate_deviation', camera_id: null });
    expect(evaluateRules(evt, [r], baseCtx({ business: { deviationPct: 3.35 } }))).toHaveLength(1);
    expect(evaluateRules(evt, [r], baseCtx({ business: { deviationPct: -3.35 } }))).toHaveLength(1);
    expect(evaluateRules(evt, [r], baseCtx({ business: { deviationPct: 0.4 } }))).toHaveLength(0);
  });

  it('disabled rules never fire', () => {
    const r = rule({ id: 'r-x', event_type: 'motion_detected', condition: {}, enabled: false });
    expect(evaluateRules(baseEvent(), [r], baseCtx())).toHaveLength(0);
  });

  it('unmatched event types never fire', () => {
    const r = rule({ id: 'r-x', event_type: 'intrusion', condition: {} });
    expect(evaluateRules(baseEvent({ event_type: 'motion_detected' }), [r], baseCtx())).toHaveLength(0);
  });
});
