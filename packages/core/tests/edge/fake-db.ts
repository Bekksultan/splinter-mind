/**
 * In-memory DbPort fake for handler/pipeline tests. No Deno, no network.
 */
import type {
  Alert,
  AuditLog,
  Branch,
  Camera,
  CameraEvent,
  CameraStatus,
  CashBalance,
  ExchangeRate,
  NotificationPref,
  OrgUser,
  PushToken,
  Rule,
  RuleFire,
  WorkingHours,
} from '../../src/index.ts';
import type {
  CameraEventPatch,
  DbPort,
  NewAlert,
  NewAuditLog,
  NewCameraEvent,
  NewRuleFire,
} from '../../../../supabase/functions/_shared/db-port.ts';

let seq = 0;
function uuid(): string {
  seq += 1;
  return `test-${Date.now().toString(36)}-${seq.toString().padStart(4, '0')}`;
}

export const TEST_ORG = 'test-org-1';
export const TEST_BRANCH = 'test-branch-14';
export const TEST_CAMERA = 'test-cam-1';

export const TEST_WORKING_HOURS: WorkingHours = {
  mon: { open: '09:00', close: '18:00' },
  tue: { open: '09:00', close: '18:00' },
  wed: { open: '09:00', close: '18:00' },
  thu: { open: '09:00', close: '18:00' },
  fri: { open: '09:00', close: '18:00' },
  sat: { open: '10:00', close: '14:00' },
  sun: { closed: true },
};

export function testBranch(over: Partial<Branch> = {}): Branch {
  return {
    id: TEST_BRANCH,
    organization_id: TEST_ORG,
    name: 'Branch #14',
    address: null,
    latitude: null,
    longitude: null,
    timezone: 'Asia/Bishkek',
    status: 'active',
    working_hours: TEST_WORKING_HOURS,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

export function testCamera(over: Partial<Camera> = {}): Camera {
  return {
    id: TEST_CAMERA,
    organization_id: TEST_ORG,
    branch_id: TEST_BRANCH,
    name: 'Cashier Area',
    external_id: 'mock-b14-cam2',
    provider: 'mock',
    status: 'online',
    camera_type: 'bullet',
    last_seen_at: new Date().toISOString(),
    configuration: { channel: 102 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

export function testRule(over: Partial<Rule> = {}): Rule {
  return {
    id: uuid(),
    organization_id: TEST_ORG,
    name: 'test rule',
    event_type: 'motion_detected',
    condition: {},
    severity: 'medium',
    cooldown_minutes: 30,
    enabled: true,
    created_at: new Date().toISOString(),
    ...over,
  };
}

export class FakeDb implements DbPort {
  cameras = new Map<string, Camera>();
  branches = new Map<string, Branch>();
  rules: Rule[] = [];
  events = new Map<string, CameraEvent>();
  alerts = new Map<string, Alert>();
  fires: RuleFire[] = [];
  rates: ExchangeRate[] = [];
  balances: CashBalance[] = [];
  users: OrgUser[] = [];
  tokens: PushToken[] = [];
  prefs: NotificationPref[] = [];
  audit: AuditLog[] = [];
  snapshots = new Map<string, { bytes: Uint8Array; contentType: string }>();

  seedBasics(): this {
    this.branches.set(TEST_BRANCH, testBranch());
    this.cameras.set(TEST_CAMERA, testCamera());
    return this;
  }

  seedRules(): this {
    this.rules.push(
      testRule({
        name: 'Camera offline > 5 min',
        event_type: 'camera_offline',
        condition: { offline_minutes_gt: 5 },
        severity: 'medium',
        cooldown_minutes: 60,
      }),
      testRule({
        name: 'Camera offline > 30 min',
        event_type: 'camera_offline',
        condition: { offline_minutes_gt: 30 },
        severity: 'high',
        cooldown_minutes: 120,
      }),
      testRule({
        name: 'Motion outside working hours -> AI review',
        event_type: 'motion_detected',
        condition: {
          outside_working_hours: true,
          needs_ai: true,
          min_confidence: 0.7,
          risk_levels: ['high', 'critical'],
        },
        severity: 'high',
        cooldown_minutes: 30,
      }),
    );
    return this;
  }

  seedNotificationUser(over: Partial<OrgUser> = {}, token = 'ExponentPushToken[test]'): OrgUser {
    const user: OrgUser = {
      id: uuid(),
      organization_id: TEST_ORG,
      name: 'Test Coordinator',
      email: 'ops@test.exchange',
      phone: null,
      role: 'coordinator',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...over,
    };
    this.users.push(user);
    this.tokens.push({ user_id: user.id, expo_push_token: token, created_at: new Date().toISOString() });
    this.prefs.push({ user_id: user.id, push_enabled: true, severities: ['critical', 'high', 'medium', 'low'], quiet_hours: null });
    return user;
  }

  // -- cameras / branches -------------------------------------------------
  async getCameraByExternalId(externalId: string): Promise<Camera | null> {
    return [...this.cameras.values()].find((c) => c.external_id === externalId) ?? null;
  }
  async getCamera(cameraId: string): Promise<Camera | null> {
    return this.cameras.get(cameraId) ?? null;
  }
  async getBranch(branchId: string): Promise<Branch | null> {
    return this.branches.get(branchId) ?? null;
  }
  async updateCameraLastSeen(cameraId: string, atIso: string): Promise<void> {
    const c = this.cameras.get(cameraId);
    if (c) c.last_seen_at = atIso;
  }
  async updateCameraStatus(cameraId: string, status: CameraStatus, lastSeenIso: string): Promise<void> {
    const c = this.cameras.get(cameraId);
    if (c) {
      c.status = status;
      c.last_seen_at = lastSeenIso;
    }
  }

  // -- rules --------------------------------------------------------------
  async getRules(organizationId: string): Promise<Rule[]> {
    return this.rules.filter((r) => r.organization_id === organizationId && r.enabled);
  }
  async getRecentFires(ruleIds: string[], sinceIso: string): Promise<RuleFire[]> {
    return this.fires.filter((f) => ruleIds.includes(f.rule_id) && f.fired_at >= sinceIso);
  }
  async recordFire(row: NewRuleFire): Promise<void> {
    this.fires.push({
      id: uuid(),
      organization_id: row.organization_id,
      rule_id: row.rule_id,
      cooldown_key: row.cooldown_key,
      fired_at: row.fired_at ?? new Date().toISOString(),
    });
  }

  // -- events --------------------------------------------------------------
  async findEventByDedupe(dedupeKey: string): Promise<CameraEvent | null> {
    return [...this.events.values()].find((e) => e.dedupe_key === dedupeKey) ?? null;
  }
  async insertEvent(row: NewCameraEvent): Promise<CameraEvent> {
    const event: CameraEvent = {
      id: row.id ?? uuid(),
      created_at: new Date().toISOString(),
      processed_at: null,
      ...row,
    } as CameraEvent;
    this.events.set(event.id, event);
    return event;
  }
  async getEvent(eventId: string): Promise<CameraEvent | null> {
    return this.events.get(eventId) ?? null;
  }
  async claimEvent(eventId: string): Promise<CameraEvent | null> {
    const e = this.events.get(eventId);
    if (!e || e.processed_at) return null;
    e.processed_at = new Date().toISOString();
    return e;
  }
  async updateEvent(eventId: string, patch: CameraEventPatch): Promise<void> {
    const e = this.events.get(eventId);
    if (e) Object.assign(e, patch);
  }

  // -- alerts ---------------------------------------------------------------
  async getAlertByEventId(eventId: string): Promise<Alert | null> {
    return [...this.alerts.values()].find((a) => a.event_id === eventId) ?? null;
  }
  async insertAlert(row: NewAlert): Promise<Alert> {
    const alert: Alert = {
      id: row.id ?? uuid(),
      created_at: new Date().toISOString(),
      acknowledged_at: null,
      resolved_at: null,
      ...row,
    } as Alert;
    this.alerts.set(alert.id, alert);
    return alert;
  }
  async getAlert(alertId: string): Promise<Alert | null> {
    return this.alerts.get(alertId) ?? null;
  }

  // -- business data ----------------------------------------------------------
  async getLatestRates(branchId: string): Promise<ExchangeRate[]> {
    return this.rates.filter((r) => r.branch_id === branchId);
  }
  async getCashBalances(branchId: string): Promise<CashBalance[]> {
    return this.balances.filter((b) => b.branch_id === branchId);
  }

  // -- notifications ------------------------------------------------------------
  async getNotificationUsers(organizationId: string): Promise<OrgUser[]> {
    return this.users.filter(
      (u) => u.organization_id === organizationId && u.status === 'active' && u.role !== 'cashier',
    );
  }
  async getPushTokens(userIds: string[]): Promise<PushToken[]> {
    return this.tokens.filter((t) => userIds.includes(t.user_id));
  }
  async getNotificationPrefs(userIds: string[]): Promise<NotificationPref[]> {
    return this.prefs.filter((p) => userIds.includes(p.user_id));
  }

  // -- audit ----------------------------------------------------------------------
  async insertAuditLog(row: NewAuditLog): Promise<void> {
    this.audit.push({ id: uuid(), created_at: new Date().toISOString(), ...row } as AuditLog);
  }

  // -- storage -----------------------------------------------------------------------
  async uploadSnapshot(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.snapshots.set(path, { bytes, contentType });
  }
  async createSignedUrl(path: string, _expiresInSeconds: number): Promise<string> {
    return `https://storage.test/snapshots/${path}?signed=1`;
  }
}
