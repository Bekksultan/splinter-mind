/**
 * DbPort — the database seam used by every edge-function handler.
 *
 * Handlers depend ONLY on this interface (never on supabase-js directly),
 * which makes them unit-testable with an in-memory fake. The production
 * implementation (SupabaseDbPort, service_role) lives in db-supabase.ts and
 * is wired in each function's index.ts.
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
} from '../../../packages/core/src/index.ts';

export type NewCameraEvent = Omit<CameraEvent, 'id' | 'created_at' | 'processed_at'> & { id?: string };

export type CameraEventPatch = Partial<
  Pick<CameraEvent, 'snapshot_url' | 'video_url' | 'ai_analysis' | 'severity' | 'processed_at'>
>;

export type NewAlert = Omit<Alert, 'id' | 'created_at' | 'acknowledged_at' | 'resolved_at'> & {
  id?: string;
};

export type NewRuleFire = Omit<RuleFire, 'id' | 'fired_at'> & { fired_at?: string };

export type NewAuditLog = Omit<AuditLog, 'id' | 'created_at'>;

export interface DbPort {
  // cameras / branches
  getCameraByExternalId(externalId: string): Promise<Camera | null>;
  getCamera(cameraId: string): Promise<Camera | null>;
  getBranch(branchId: string): Promise<Branch | null>;
  updateCameraLastSeen(cameraId: string, atIso: string): Promise<void>;
  updateCameraStatus(cameraId: string, status: CameraStatus, lastSeenIso: string): Promise<void>;

  // rules
  getRules(organizationId: string): Promise<Rule[]>;
  getRecentFires(ruleIds: string[], sinceIso: string): Promise<RuleFire[]>;
  recordFire(row: NewRuleFire): Promise<void>;

  // events
  findEventByDedupe(dedupeKey: string): Promise<CameraEvent | null>;
  insertEvent(row: NewCameraEvent): Promise<CameraEvent>;
  getEvent(eventId: string): Promise<CameraEvent | null>;
  /**
   * Atomically mark the event processed. Returns the event when this caller
   * won the claim, null when it was already processed (or missing).
   */
  claimEvent(eventId: string): Promise<CameraEvent | null>;
  updateEvent(eventId: string, patch: CameraEventPatch): Promise<void>;

  // alerts
  getAlertByEventId(eventId: string): Promise<Alert | null>;
  insertAlert(row: NewAlert): Promise<Alert>;
  getAlert(alertId: string): Promise<Alert | null>;

  // business data
  getLatestRates(branchId: string): Promise<ExchangeRate[]>;
  getCashBalances(branchId: string): Promise<CashBalance[]>;

  // notifications
  getNotificationUsers(organizationId: string): Promise<OrgUser[]>;
  getPushTokens(userIds: string[]): Promise<PushToken[]>;
  getNotificationPrefs(userIds: string[]): Promise<NotificationPref[]>;

  // audit
  insertAuditLog(row: NewAuditLog): Promise<void>;

  // storage
  uploadSnapshot(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
}
