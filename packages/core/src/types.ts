/**
 * Splinter Mind — shared domain types.
 *
 * Framework-free TypeScript: safe to import from the mobile app, Supabase edge
 * functions, and tests. These types mirror the Postgres enums and tables in
 * supabase/migrations/0001_initial_schema.sql. Keep them in sync.
 */

// ---------------------------------------------------------------------------
// Enums (mirror Postgres enums 1:1)
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** Higher number = more severe. Used to pick the winning alert when several rules fire. */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'ignored';
export const ALERT_STATUSES: readonly AlertStatus[] = ['open', 'acknowledged', 'resolved', 'ignored'];

export type UserRole = 'owner' | 'admin' | 'coordinator' | 'manager' | 'security' | 'cashier';
export const USER_ROLES: readonly UserRole[] = ['owner', 'admin', 'coordinator', 'manager', 'security', 'cashier'];

/** Roles allowed to act on alerts / operational data. Cashiers are intentionally excluded. */
export const OPERATIONAL_ROLES: readonly UserRole[] = ['owner', 'admin', 'coordinator', 'manager', 'security'];

export type EntityStatus = 'active' | 'inactive' | 'maintenance';
export type CameraStatus = 'online' | 'offline' | 'degraded' | 'unknown';
export type CameraProviderName = 'hikvision' | 'mock';

export type EventType =
  | 'motion_detected'
  | 'line_crossing'
  | 'intrusion'
  | 'camera_offline'
  | 'camera_online'
  | 'video_loss'
  | 'tampering'
  | 'person_detected'
  | 'vehicle_detected'
  | 'restricted_area'
  | 'rate_not_updated'
  | 'rate_deviation'
  | 'cash_below_threshold'
  | 'shift_no_show'
  | 'info';

export const EVENT_TYPES: readonly EventType[] = [
  'motion_detected',
  'line_crossing',
  'intrusion',
  'camera_offline',
  'camera_online',
  'video_loss',
  'tampering',
  'person_detected',
  'vehicle_detected',
  'restricted_area',
  'rate_not_updated',
  'rate_deviation',
  'cash_below_threshold',
  'shift_no_show',
  'info',
];

export type EventSource = 'hikvision' | 'rule_engine' | 'manual' | 'system';
export type ShiftStatus = 'scheduled' | 'active' | 'completed' | 'missed' | 'cancelled';

export type AuditAction =
  | 'login'
  | 'logout'
  | 'alert_acknowledged'
  | 'alert_resolved'
  | 'alert_ignored'
  | 'alert_assigned'
  | 'alert_note_added'
  | 'alert_created'
  | 'exchange_rate_changed'
  | 'camera_config_changed'
  | 'user_created'
  | 'user_permissions_changed';

/** Initial severity assigned to an event before rules run. Rules may escalate. */
export const DEFAULT_EVENT_SEVERITY: Record<EventType, Severity> = {
  motion_detected: 'low',
  line_crossing: 'medium',
  intrusion: 'high',
  camera_offline: 'medium',
  camera_online: 'info',
  video_loss: 'medium',
  tampering: 'high',
  person_detected: 'medium',
  vehicle_detected: 'low',
  restricted_area: 'high',
  rate_not_updated: 'medium',
  rate_deviation: 'high',
  cash_below_threshold: 'medium',
  shift_no_show: 'medium',
  info: 'info',
};

// ---------------------------------------------------------------------------
// Structural types
// ---------------------------------------------------------------------------

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayHours {
  /** "HH:MM" 24h local time, e.g. "09:00". Omit when closed. */
  open?: string;
  /** "HH:MM" 24h local time, e.g. "18:00". May be earlier than open for overnight hours. */
  close?: string;
  closed?: boolean;
}

export type WorkingHours = Partial<Record<WeekdayKey, DayHours>>;

export interface QuietHours {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  timezone: string;
}

// ---------------------------------------------------------------------------
// AI vision analysis — exact contract from ARCHITECTURE.md §2.
// Neutral language only: the AI advises, never accuses, never decides.
// ---------------------------------------------------------------------------

export interface VisionAnalysis {
  person_detected: boolean;
  restricted_area: boolean;
  outside_working_hours: boolean;
  /** 0..1 */
  confidence: number;
  risk_level: 'critical' | 'high' | 'medium' | 'low' | 'info';
  summary: string;
  objects_visible: string[];
  likely_false_positive: boolean;
}

/** Stored on the event when the vision provider is unavailable. Never a crash. */
export interface AiAnalysisPending {
  status: 'pending';
  reason?: string;
}

export type AiAnalysis = VisionAnalysis | AiAnalysisPending;

export function isVisionAnalysis(a: AiAnalysis | null | undefined): a is VisionAnalysis {
  return !!a && typeof (a as VisionAnalysis).confidence === 'number';
}

// ---------------------------------------------------------------------------
// Rules engine contracts
// ---------------------------------------------------------------------------

/**
 * Stored in the `rules` table `condition` jsonb column. All fields optional;
 * a rule matches when every present field's predicate holds.
 */
export interface RuleCondition {
  /** camera offline longer than N minutes (uses camera.last_seen_at) */
  offline_minutes_gt?: number;
  /** event timestamp falls outside the branch working_hours */
  outside_working_hours?: boolean;
  /** route through the VisionAnalyzer before deciding on an alert */
  needs_ai?: boolean;
  /** with needs_ai: only alert if AI confidence >= this (0..1) */
  min_confidence?: number;
  /** with needs_ai: only alert if AI risk_level is in this set */
  risk_levels?: Array<VisionAnalysis['risk_level']>;
  /** cash amount is below the configured threshold */
  amount_below_threshold?: boolean;
  /** abs(rate deviation %) greater than N */
  deviation_pct_gt?: number;
  /** rate not updated for longer than N hours */
  hours_since_update_gt?: number;
}

export interface RuleAction {
  action: 'alert' | 'ai_analysis' | 'ignore';
  severity?: Severity;
  rule_id?: string;
  cooldown_key?: string;
}

// ---------------------------------------------------------------------------
// Database row types (snake_case mirrors the SQL columns exactly)
// ---------------------------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
}

export interface OrgUser {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  status: EntityStatus;
  working_hours: WorkingHours | null;
  created_at: string;
  updated_at: string;
}

export interface Camera {
  id: string;
  organization_id: string;
  branch_id: string;
  name: string;
  external_id: string | null;
  provider: CameraProviderName;
  status: CameraStatus;
  camera_type: string | null;
  last_seen_at: string | null;
  configuration: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  organization_id: string;
  branch_id: string | null;
  name: string;
  phone: string | null;
  role: string;
  status: EntityStatus;
  schedule: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  organization_id: string;
  branch_id: string;
  employee_id: string;
  start_time: string;
  end_time: string;
  status: ShiftStatus;
  created_at: string;
}

export interface CameraEvent {
  id: string;
  organization_id: string;
  branch_id: string;
  camera_id: string | null;
  event_type: EventType;
  source: EventSource;
  severity: Severity;
  timestamp: string;
  raw_payload: Record<string, unknown>;
  snapshot_url: string | null;
  video_url: string | null;
  ai_analysis: AiAnalysis | null;
  dedupe_key: string | null;
  /** Set when process-event has claimed/handled the event (idempotency). */
  processed_at: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  organization_id: string;
  branch_id: string;
  event_id: string | null;
  title: string;
  description: string | null;
  severity: Severity;
  status: AlertStatus;
  assigned_to: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface AlertNote {
  id: string;
  organization_id: string;
  alert_id: string;
  user_id: string;
  note: string;
  created_at: string;
}

export interface ExchangeRate {
  id: string;
  organization_id: string;
  branch_id: string;
  currency: string;
  buy_rate: number;
  sell_rate: number;
  previous_buy_rate: number | null;
  previous_sell_rate: number | null;
  updated_by: string | null;
  created_at: string;
}

export interface CashBalance {
  id: string;
  organization_id: string;
  branch_id: string;
  currency: string;
  amount: number;
  threshold: number;
  updated_at: string;
}

export interface Rule {
  id: string;
  organization_id: string;
  name: string;
  event_type: EventType;
  condition: RuleCondition;
  severity: Severity;
  cooldown_minutes: number;
  enabled: boolean;
  created_at: string;
}

export interface RuleFire {
  id: string;
  organization_id: string;
  rule_id: string;
  cooldown_key: string;
  fired_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface NotificationPref {
  user_id: string;
  push_enabled: boolean;
  severities: Severity[];
  quiet_hours: QuietHours | null;
}

export interface PushToken {
  user_id: string;
  expo_push_token: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Alert state machine
// ---------------------------------------------------------------------------

/**
 * Allowed transitions. `ignored` and `resolved` are terminal — an ignored
 * alert stays ignored (re-alerts come from new events, never resurrection).
 */
export const ALERT_TRANSITIONS: Record<AlertStatus, readonly AlertStatus[]> = {
  open: ['acknowledged', 'resolved', 'ignored'],
  acknowledged: ['resolved', 'ignored'],
  resolved: [],
  ignored: [],
};

export function canTransitionAlert(from: AlertStatus, to: AlertStatus): boolean {
  return ALERT_TRANSITIONS[from].includes(to);
}

export class AlertTransitionError extends Error {
  readonly from: AlertStatus;
  readonly to: AlertStatus;
  constructor(from: AlertStatus, to: AlertStatus) {
    super(`Illegal alert transition: ${from} -> ${to}`);
    this.name = 'AlertTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function assertAlertTransition(from: AlertStatus, to: AlertStatus): void {
  if (!canTransitionAlert(from, to)) throw new AlertTransitionError(from, to);
}

// ---------------------------------------------------------------------------
// Multi-tenant helpers (pure logic layer; RLS is the real enforcement in SQL)
// ---------------------------------------------------------------------------

export class TenantIsolationError extends Error {
  constructor() {
    super('Cross-organization access denied');
    this.name = 'TenantIsolationError';
  }
}

/** Throws unless the row belongs to the caller's organization. */
export function assertSameOrg<T extends { organization_id: string }>(row: T, organizationId: string): T {
  if (row.organization_id !== organizationId) throw new TenantIsolationError();
  return row;
}

/** Pure in-memory org scoping for lists (defense in depth; RLS is authoritative). */
export function filterByOrg<T extends { organization_id: string }>(
  rows: readonly T[],
  organizationId: string,
): T[] {
  return rows.filter((r) => r.organization_id === organizationId);
}
