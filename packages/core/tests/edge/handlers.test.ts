/**
 * Handler-level tests: hikvision-webhook validation, process-event
 * idempotency + full pipeline, create-alert idempotency, send-notification
 * fan-out, simulate gating.
 */
import { describe, expect, it } from 'vitest';
import {
  MockNotificationProvider,
  MockVisionAnalyzer,
  type NotificationProvider,
} from '../../src/providers.ts';
import { handleHikvisionWebhook } from '../../../../supabase/functions/hikvision-webhook/handler.ts';
import { handleProcessEvent } from '../../../../supabase/functions/process-event/handler.ts';
import { handleCreateAlert } from '../../../../supabase/functions/create-alert/handler.ts';
import { handleSendNotification } from '../../../../supabase/functions/send-notification/handler.ts';
import { handleSimulate } from '../../../../supabase/functions/simulate/handler.ts';
import { signHmacSha256Hex } from '../../../../supabase/functions/_shared/crypto.ts';
import { FakeDb, TEST_CAMERA, TEST_BRANCH } from './fake-db.ts';

const SECRET = 'test-webhook-secret';

function webhookRequest(body: unknown, secret = SECRET): Request {
  return new Request('https://functions.test/hikvision-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function signedWebhookRequest(body: unknown, secret = SECRET): Promise<Request> {
  const raw = JSON.stringify(body);
  const sig = await signHmacSha256Hex(secret, raw);
  return new Request('https://functions.test/hikvision-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signature': sig },
    body: raw,
  });
}

function pipelineDeps(db: FakeDb, notifier?: NotificationProvider) {
  return {
    db,
    vision: new MockVisionAnalyzer(),
    notifier: notifier ?? new MockNotificationProvider(),
    snapshotEnv: {},
  };
}

const MOTION_BODY = {
  provider: 'hikvision',
  external_camera_id: 'mock-b14-cam2',
  event_type: 'motion_detected',
  timestamp: '2026-10-15T20:17:00Z', // 02:17 Asia/Bishkek — outside working hours
  payload: { hint: 'person in restricted area' },
};

describe('hikvision-webhook', () => {
  it('rejects requests with a bad signature (401)', async () => {
    const db = new FakeDb().seedBasics();
    const req = await signedWebhookRequest(MOTION_BODY, 'wrong-secret');
    const res = await handleHikvisionWebhook(req, {
      db,
      webhookSecret: SECRET,
      onEventStored: async () => {},
    });
    expect(res.status).toBe(401);
    expect(db.events.size).toBe(0);
  });

  it('rejects missing signature (401)', async () => {
    const db = new FakeDb().seedBasics();
    const res = await handleHikvisionWebhook(webhookRequest(MOTION_BODY), {
      db,
      webhookSecret: SECRET,
      onEventStored: async () => {},
    });
    expect(res.status).toBe(401);
  });

  it('rejects unknown event_type (400)', async () => {
    const db = new FakeDb().seedBasics();
    const req = await signedWebhookRequest({ ...MOTION_BODY, event_type: 'alien_invasion' });
    const res = await handleHikvisionWebhook(req, {
      db,
      webhookSecret: SECRET,
      onEventStored: async () => {},
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown camera (404)', async () => {
    const db = new FakeDb().seedBasics();
    const req = await signedWebhookRequest({ ...MOTION_BODY, external_camera_id: 'nope' });
    const res = await handleHikvisionWebhook(req, {
      db,
      webhookSecret: SECRET,
      onEventStored: async () => {},
    });
    expect(res.status).toBe(404);
  });

  it('stores the event, returns 202, and triggers processing', async () => {
    const db = new FakeDb().seedBasics();
    let processed: string | null = null;
    const req = await signedWebhookRequest(MOTION_BODY);
    const res = await handleHikvisionWebhook(req, {
      db,
      webhookSecret: SECRET,
      onEventStored: async (id) => {
        processed = id;
      },
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { event_id: string };
    expect(body.event_id).toBeTruthy();
    expect(processed).toBe(body.event_id);
    const stored = db.events.get(body.event_id);
    expect(stored?.event_type).toBe('motion_detected');
    expect(stored?.camera_id).toBe(TEST_CAMERA);
    expect(stored?.severity).toBe('low'); // default before rules run
  });

  it('dedupes replays of the same webhook (202, deduplicated)', async () => {
    const db = new FakeDb().seedBasics();
    const deps = { db, webhookSecret: SECRET, onEventStored: async () => {} };
    const r1 = await handleHikvisionWebhook(await signedWebhookRequest(MOTION_BODY), deps);
    const r2 = await handleHikvisionWebhook(await signedWebhookRequest(MOTION_BODY), deps);
    const b1 = (await r1.json()) as { event_id: string };
    const b2 = (await r2.json()) as { event_id: string; deduplicated: boolean };
    expect(r2.status).toBe(202);
    expect(b2.deduplicated).toBe(true);
    expect(b2.event_id).toBe(b1.event_id);
    expect(db.events.size).toBe(1);
  });

  it('still returns 202 when process-event invocation throws (event is safe)', async () => {
    const db = new FakeDb().seedBasics();
    const req = await signedWebhookRequest(MOTION_BODY);
    const res = await handleHikvisionWebhook(req, {
      db,
      webhookSecret: SECRET,
      onEventStored: async () => {
        throw new Error('network down');
      },
    });
    expect(res.status).toBe(202);
    expect(db.events.size).toBe(1);
  });
});

describe('process-event', () => {
  function motionEvent(db: FakeDb) {
    return db.insertEvent({
      organization_id: 'test-org-1',
      branch_id: TEST_BRANCH,
      camera_id: TEST_CAMERA,
      event_type: 'motion_detected',
      source: 'hikvision',
      severity: 'low',
      timestamp: '2026-10-15T20:17:00Z',
      raw_payload: { hint: 'person in restricted area' },
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: 'test:motion:1',
    });
  }

  it('runs the full pipeline: rules -> AI -> alert -> push', async () => {
    const db = new FakeDb().seedBasics().seedRules();
    const notifier = new MockNotificationProvider();
    db.seedNotificationUser();
    const event = await motionEvent(db);

    const req = new Request('https://functions.test/process-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: event.id }),
    });
    const res = await handleProcessEvent(req, pipelineDeps(db, notifier));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      alert_id: string | null;
      actions: Array<{ action: string }>;
    };
    expect(body.status).toBe('processed');
    expect(body.actions.map((a) => a.action)).toContain('ai_analysis');
    expect(body.alert_id).toBeTruthy();

    const alert = db.alerts.get(body.alert_id!);
    expect(alert?.severity).toBe('high');
    expect(alert?.status).toBe('open');

    const stored = db.events.get(event.id)!;
    expect(stored.snapshot_url).toContain('https://storage.test/snapshots/');
    expect(stored.ai_analysis).toMatchObject({ person_detected: true, risk_level: 'high' });

    expect(notifier.sentPush).toHaveLength(1);
    expect(notifier.sentPush[0]!.message.title).toContain('HIGH');
  });

  it('is idempotent: second invocation returns already_processed, no duplicate alert', async () => {
    const db = new FakeDb().seedBasics().seedRules();
    const event = await motionEvent(db);
    const deps = pipelineDeps(db);
    const req = () =>
      new Request('https://functions.test/process-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id }),
      });
    const r1 = await handleProcessEvent(req(), deps);
    const r2 = await handleProcessEvent(req(), deps);
    expect(((await r1.json()) as { status: string }).status).toBe('processed');
    expect(((await r2.json()) as { status: string }).status).toBe('already_processed');
    expect(db.alerts.size).toBe(1);
  });

  it('escalates camera offline to HIGH when offline > 30 min (most severe wins)', async () => {
    const db = new FakeDb().seedBasics().seedRules();
    const camera = db.cameras.get(TEST_CAMERA)!;
    camera.last_seen_at = new Date(Date.now() - 40 * 60_000).toISOString();
    const event = await db.insertEvent({
      organization_id: 'test-org-1',
      branch_id: TEST_BRANCH,
      camera_id: TEST_CAMERA,
      event_type: 'camera_offline',
      source: 'hikvision',
      severity: 'medium',
      timestamp: new Date().toISOString(),
      raw_payload: {},
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: 'test:offline:1',
    });
    const req = new Request('https://functions.test/process-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: event.id }),
    });
    const res = await handleProcessEvent(req, pipelineDeps(db));
    const body = (await res.json()) as { status: string; alert_id: string };
    expect(body.status).toBe('processed');
    const alert = db.alerts.get(body.alert_id)!;
    expect(alert.severity).toBe('high');
    // both rules recorded cooldown fires
    expect(db.fires.length).toBe(2);
  });

  it('marks AI as pending when the vision provider fails (no crash)', async () => {
    const db = new FakeDb().seedBasics().seedRules();
    const event = await motionEvent(db);
    const failingVision: MockVisionAnalyzer = {
      analyzeImage: async () => {
        throw new Error('provider outage');
      },
    } as unknown as MockVisionAnalyzer;
    const req = new Request('https://functions.test/process-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: event.id }),
    });
    const res = await handleProcessEvent(req, {
      ...pipelineDeps(db, new MockNotificationProvider()),
      vision: failingVision,
    });
    expect(res.status).toBe(200);
    const stored = db.events.get(event.id)!;
    expect(stored.ai_analysis).toMatchObject({ status: 'pending', reason: 'provider outage' });
    // no alert from the AI-gated rule, but the event was processed, not crashed
    expect(((await res.json()) as { status: string }).status).toBe('processed');
    expect(db.alerts.size).toBe(0);
  });

  it('returns 404 for unknown event_id', async () => {
    const db = new FakeDb().seedBasics();
    const req = new Request('https://functions.test/process-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: 'missing' }),
    });
    const res = await handleProcessEvent(req, pipelineDeps(db));
    expect(res.status).toBe(404);
  });
});

describe('create-alert', () => {
  it('creates once; second call with same event_id deduplicates', async () => {
    const db = new FakeDb().seedBasics();
    const event = await db.insertEvent({
      organization_id: 'test-org-1',
      branch_id: TEST_BRANCH,
      camera_id: null,
      event_type: 'cash_below_threshold',
      source: 'rule_engine',
      severity: 'medium',
      timestamp: new Date().toISOString(),
      raw_payload: {},
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: 'test:cash:1',
    });
    const body = {
      event_id: event.id,
      title: 'USD balance below threshold',
      description: 'test',
      severity: 'medium',
    };
    const req = () =>
      new Request('https://functions.test/create-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const r1 = await handleCreateAlert(req(), { db });
    const r2 = await handleCreateAlert(req(), { db });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as { deduplicated: boolean }).deduplicated).toBe(true);
    expect(db.alerts.size).toBe(1);
  });

  it('rejects invalid severity', async () => {
    const db = new FakeDb().seedBasics();
    const req = new Request('https://functions.test/create-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x', severity: 'extreme' }),
    });
    expect((await handleCreateAlert(req, { db })).status).toBe(400);
  });
});

describe('send-notification', () => {
  async function alertFixture(db: FakeDb, severity: 'medium' | 'critical' = 'medium') {
    return db.insertAlert({
      organization_id: 'test-org-1',
      branch_id: TEST_BRANCH,
      event_id: null,
      title: 'Test alert',
      description: 'Test description',
      severity,
      status: 'open',
      assigned_to: null,
    });
  }

  it('sends push to eligible users', async () => {
    const db = new FakeDb().seedBasics();
    db.seedNotificationUser();
    const notifier = new MockNotificationProvider();
    const alert = await alertFixture(db);
    const req = new Request('https://functions.test/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: alert.id }),
    });
    const res = await handleSendNotification(req, { db, notifier });
    expect(res.status).toBe(200);
    expect(notifier.sentPush).toHaveLength(1);
    const summary = (await res.json()) as { delivered: number };
    expect(summary.delivered).toBe(1);
  });

  it('skips medium alerts during user quiet hours, but not critical ones', async () => {
    const db = new FakeDb().seedBasics();
    const user = db.seedNotificationUser();
    // quiet hours covering the whole day
    db.prefs.find((p) => p.user_id === user.id)!.quiet_hours = {
      start: '00:00',
      end: '23:59',
      timezone: 'UTC',
    };
    const notifier = new MockNotificationProvider();
    const medium = await alertFixture(db, 'medium');
    const critical = await alertFixture(db, 'critical');
    const req = (id: string) =>
      new Request('https://functions.test/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: id }),
      });
    await handleSendNotification(req(medium.id), { db, notifier });
    expect(notifier.sentPush).toHaveLength(0);
    await handleSendNotification(req(critical.id), { db, notifier });
    expect(notifier.sentPush).toHaveLength(1);
  });

  it('returns 404 for unknown alert', async () => {
    const db = new FakeDb().seedBasics();
    const req = new Request('https://functions.test/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: 'missing' }),
    });
    expect((await handleSendNotification(req, { db, notifier: new MockNotificationProvider() })).status).toBe(404);
  });
});

describe('simulate', () => {
  it('is disabled without ALLOW_SIMULATE=true (403)', async () => {
    const db = new FakeDb().seedBasics();
    const req = new Request('https://functions.test/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'low_cash', branch_id: TEST_BRANCH }),
    });
    const res = await handleSimulate(req, { ...pipelineDeps(db), allowSimulate: false });
    expect(res.status).toBe(403);
    expect(db.events.size).toBe(0);
  });

  it('runs the low_cash scenario end to end when enabled', async () => {
    const db = new FakeDb().seedBasics().seedRules();
    db.balances.push({
      id: 'bal-1',
      organization_id: 'test-org-1',
      branch_id: TEST_BRANCH,
      currency: 'USD',
      amount: 2400,
      threshold: 5000,
      updated_at: new Date().toISOString(),
    });
    // rule for cash events
    db.rules.push({
      id: 'rule-cash',
      organization_id: 'test-org-1',
      name: 'Cash below threshold',
      event_type: 'cash_below_threshold',
      condition: { amount_below_threshold: true },
      severity: 'medium',
      cooldown_minutes: 240,
      enabled: true,
      created_at: new Date().toISOString(),
    });
    const notifier = new MockNotificationProvider();
    db.seedNotificationUser();
    const req = new Request('https://functions.test/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'low_cash', branch_id: TEST_BRANCH }),
    });
    const res = await handleSimulate(req, { ...pipelineDeps(db, notifier), allowSimulate: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; alert_id: string | null };
    expect(body.status).toBe('processed');
    expect(body.alert_id).toBeTruthy();
    expect(notifier.sentPush).toHaveLength(1);
  });
});
