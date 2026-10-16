import { describe, expect, it } from 'vitest';
import {
  ALERT_TRANSITIONS,
  AlertTransitionError,
  assertAlertTransition,
  canTransitionAlert,
  type AlertStatus,
} from '../src/types.ts';

describe('alert state machine', () => {
  it('open can go to acknowledged, resolved, ignored', () => {
    expect(canTransitionAlert('open', 'acknowledged')).toBe(true);
    expect(canTransitionAlert('open', 'resolved')).toBe(true);
    expect(canTransitionAlert('open', 'ignored')).toBe(true);
  });

  it('acknowledged can go to resolved or ignored, but not back to open', () => {
    expect(canTransitionAlert('acknowledged', 'resolved')).toBe(true);
    expect(canTransitionAlert('acknowledged', 'ignored')).toBe(true);
    expect(canTransitionAlert('acknowledged', 'open')).toBe(false);
  });

  it('resolved and ignored are terminal', () => {
    const all: AlertStatus[] = ['open', 'acknowledged', 'resolved', 'ignored'];
    for (const from of ['resolved', 'ignored'] as const) {
      for (const to of all) {
        expect(canTransitionAlert(from, to)).toBe(false);
      }
    }
    expect(ALERT_TRANSITIONS['resolved']).toHaveLength(0);
    expect(ALERT_TRANSITIONS['ignored']).toHaveLength(0);
  });

  it('assertAlertTransition throws AlertTransitionError with from/to', () => {
    expect(() => assertAlertTransition('open', 'acknowledged')).not.toThrow();
    try {
      assertAlertTransition('resolved', 'open');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AlertTransitionError);
      const e = err as AlertTransitionError;
      expect(e.from).toBe('resolved');
      expect(e.to).toBe('open');
      expect(e.message).toContain('resolved -> open');
    }
  });
});
