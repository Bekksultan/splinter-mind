import { describe, expect, it } from 'vitest';
import {
  MockHikvisionProvider,
  MockNotificationProvider,
  MockVisionAnalyzer,
  md5Hex,
  type CameraRef,
} from '../src/providers.ts';

const cam: CameraRef = {
  id: 'cam-1',
  external_id: 'mock-cam-1',
  provider: 'mock',
  configuration: null,
  branch_id: 'branch-1',
};

describe('md5Hex (digest-auth primitive)', () => {
  it('matches the RFC 1321 test vector', () => {
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
  it('matches empty-string vector', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });
});

describe('MockHikvisionProvider contract', () => {
  const p = new MockHikvisionProvider();

  it('reports online with a fresh last_seen_at', async () => {
    const s = await p.getStatus(cam);
    expect(s.status).toBe('online');
    expect(Date.now() - new Date(s.last_seen_at).getTime()).toBeLessThan(10_000);
  });

  it('can be forced offline (demo hook)', async () => {
    p.setOffline('mock-cam-1', true);
    const s = await p.getStatus(cam);
    expect(s.status).toBe('offline');
    p.setOffline('mock-cam-1', false);
    expect((await p.getStatus(cam)).status).toBe('online');
  });

  it('returns PNG snapshot bytes', async () => {
    const snap = await p.getSnapshot(cam);
    expect(snap.contentType).toBe('image/png');
    expect(snap.imageBytes.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(Array.from(snap.imageBytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('getRecording returns null (not supported in MVP)', async () => {
    await expect(p.getRecording(cam, '2026-10-16T00:00:00Z', '2026-10-16T01:00:00Z')).resolves.toBeNull();
  });

  it('lists canned demo devices', async () => {
    const devices = await p.listDevices({ host: 'x', username: 'u', password: 'p' });
    expect(devices.length).toBeGreaterThan(0);
    expect(devices[0]?.external_id).toBeTruthy();
  });
});

describe('MockVisionAnalyzer contract (AI mock mode)', () => {
  const a = new MockVisionAnalyzer();

  it('person hint -> person_detected, neutral summary, exact JSON shape', async () => {
    const out = await a.analyzeImage(
      { url: 'https://example/snap.jpg' },
      { event_type: 'motion_detected', timestamp: '2026-10-15T20:17:00Z', hint: 'person in restricted area' },
    );
    expect(out.person_detected).toBe(true);
    expect(out.restricted_area).toBe(true);
    expect(out.confidence).toBeGreaterThanOrEqual(0.7);
    expect(out.confidence).toBeLessThanOrEqual(1);
    expect(['critical', 'high', 'medium', 'low', 'info']).toContain(out.risk_level);
    expect(typeof out.summary).toBe('string');
    expect(out.summary.toLowerCase()).not.toContain('steal');
    expect(Array.isArray(out.objects_visible)).toBe(true);
    expect(typeof out.likely_false_positive).toBe('boolean');
  });

  it('is deterministic for the same hint', async () => {
    const ctx = { event_type: 'motion_detected' as const, timestamp: '2026-10-15T20:17:00Z', hint: 'person near door' };
    const r1 = await a.analyzeImage({ url: 'x' }, ctx);
    const r2 = await a.analyzeImage({ url: 'x' }, ctx);
    expect(r1).toEqual(r2);
  });

  it('empty/false-positive hint -> likely_false_positive', async () => {
    const out = await a.analyzeImage(
      { url: 'x' },
      { event_type: 'motion_detected', timestamp: '2026-10-16T08:00:00Z', hint: 'empty room, false positive' },
    );
    expect(out.likely_false_positive).toBe(true);
    expect(out.person_detected).toBe(false);
  });
});

describe('MockNotificationProvider contract', () => {
  it('records pushes and reports delivery count', async () => {
    const n = new MockNotificationProvider();
    const res = await n.sendPush(['tok1', 'tok2'], { title: 't', body: 'b' });
    expect(res).toEqual({ ok: true, delivered: 2 });
    expect(n.sentPush).toHaveLength(1);
  });

  it('WhatsApp is stubbed, never throws', async () => {
    const n = new MockNotificationProvider();
    const res = await n.sendWhatsApp!('+123', 'hello');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('whatsapp_not_configured');
  });
});
