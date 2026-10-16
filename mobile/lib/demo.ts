/**
 * Demo mode: full offline mock dataset for the Splinter Mind mobile app.
 *
 * Serves the same contracts as the live backend (types/index.ts) so services
 * can branch on shouldUseDemo(). Mutable state (alerts, events, notes, audit
 * log, camera statuses, shifts, notification prefs) is persisted to
 * AsyncStorage under 'splintermind:demo:v1' and loaded lazily — all reads
 * are async, which fits React Query query functions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Alert,
  AlertNote,
  AlertNoteWithAuthor,
  AuditAction,
  AuditLog,
  Branch,
  Camera,
  CashBalance,
  Employee,
  EventItem,
  ExchangeRate,
  NotificationPrefs,
  Organization,
  Shift,
  SimulateScenario,
  TimelineItem,
  User,
  VisionAnalysis,
  WorkingHours,
} from '../types';
import { humanize } from './utils';

// Re-export the scenario union for screens/services consumers.
export type { SimulateScenario } from '../types';

const STORAGE_KEY = 'splintermind:demo:v1';
const ORG_ID = 'org-demo';
const MIN = 60_000;
const HOUR = 60 * MIN;

// ---------------------------------------------------------------------------
// Mode switches
// ---------------------------------------------------------------------------

/** True when EXPO_PUBLIC_DEMO_MODE=true or Supabase is not configured. */
export function isDemoMode(): boolean {
  return (
    process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ||
    !process.env.EXPO_PUBLIC_SUPABASE_URL
  );
}

let demoOverride: boolean | null = null;

/** Runtime override (e.g. "Enter demo" from the login screen). */
export function setDemoOverride(v: boolean | null): void {
  demoOverride = v;
}

/** Effective demo decision: runtime override wins, then env config. */
export function shouldUseDemo(): boolean {
  return demoOverride ?? isDemoMode();
}

// ---------------------------------------------------------------------------
// Static reference data (org, users, branches, rates, cash, employees)
// ---------------------------------------------------------------------------

const seedTime = () => new Date().toISOString();
const iso = (t: number): string => new Date(t).toISOString();

const OPEN_HOURS = { open: '09:00', close: '21:00' } as const;
function defaultWorkingHours(): WorkingHours {
  return {
    mon: { ...OPEN_HOURS },
    tue: { ...OPEN_HOURS },
    wed: { ...OPEN_HOURS },
    thu: { ...OPEN_HOURS },
    fri: { ...OPEN_HOURS },
    sat: { ...OPEN_HOURS },
    sun: { closed: true },
  };
}

export function getDemoOrg(): Organization {
  const t = seedTime();
  return {
    id: ORG_ID,
    name: 'Meridian Exchange Group',
    status: 'active',
    created_at: t,
    updated_at: t,
  };
}

export function getDemoUser(): User {
  const t = seedTime();
  return {
    id: 'user-aibek',
    organization_id: ORG_ID,
    name: 'Aibek Koenbaev',
    email: 'coordinator@splintermind.demo',
    phone: '+996555010101',
    role: 'coordinator',
    status: 'active',
    created_at: t,
    updated_at: t,
  };
}

/** Demo user plus assignees: an admin, a security user, a manager, a cashier. */
export function getDemoUsers(): User[] {
  const t = seedTime();
  return [
    getDemoUser(),
    {
      id: 'user-nurlan',
      organization_id: ORG_ID,
      name: 'Nurlan Asanov',
      email: 'admin@splintermind.demo',
      phone: '+996555010102',
      role: 'admin',
      status: 'active',
      created_at: t,
      updated_at: t,
    },
    {
      id: 'user-erkin',
      organization_id: ORG_ID,
      name: 'Erkin Tologonov',
      email: 'security@splintermind.demo',
      phone: '+996555010103',
      role: 'security',
      status: 'active',
      created_at: t,
      updated_at: t,
    },
    {
      id: 'user-gulnara',
      organization_id: ORG_ID,
      name: 'Gulnara Sadykova',
      email: 'manager@splintermind.demo',
      phone: '+996555010104',
      role: 'manager',
      status: 'active',
      created_at: t,
      updated_at: t,
    },
    {
      id: 'user-cholpon',
      organization_id: ORG_ID,
      name: 'Cholpon Aitmatova',
      email: 'cashier@splintermind.demo',
      phone: '+996555010105',
      role: 'cashier',
      status: 'active',
      created_at: t,
      updated_at: t,
    },
  ];
}

const BRANCHES: Branch[] = [
  {
    id: 'branch-1',
    organization_id: ORG_ID,
    name: 'Branch #1 — City Center',
    address: '123 Chui Ave, Bishkek',
    latitude: 42.8746,
    longitude: 74.5698,
    timezone: 'Asia/Bishkek',
    status: 'active',
    working_hours: defaultWorkingHours(),
    created_at: '2025-01-10T08:00:00.000Z',
    updated_at: '2025-01-10T08:00:00.000Z',
  },
  {
    id: 'branch-2',
    organization_id: ORG_ID,
    name: 'Branch #2 — Bazaar',
    address: '45 Osh Bazaar St, Bishkek',
    latitude: 42.8681,
    longitude: 74.5612,
    timezone: 'Asia/Bishkek',
    status: 'active',
    working_hours: defaultWorkingHours(),
    created_at: '2025-02-02T08:00:00.000Z',
    updated_at: '2025-02-02T08:00:00.000Z',
  },
  {
    id: 'branch-3',
    organization_id: ORG_ID,
    name: 'Branch #3 — Airport',
    address: 'Terminal 1, Manas Intl Airport',
    latitude: 43.0613,
    longitude: 74.4776,
    timezone: 'Asia/Bishkek',
    status: 'active',
    working_hours: defaultWorkingHours(),
    created_at: '2025-03-15T08:00:00.000Z',
    updated_at: '2025-03-15T08:00:00.000Z',
  },
  {
    id: 'branch-7',
    organization_id: ORG_ID,
    name: 'Branch #7 — Riverside',
    address: '8 Riverside Blvd, Bishkek',
    latitude: 42.8452,
    longitude: 74.5843,
    timezone: 'Asia/Bishkek',
    status: 'active',
    working_hours: defaultWorkingHours(),
    created_at: '2025-05-20T08:00:00.000Z',
    updated_at: '2025-05-20T08:00:00.000Z',
  },
  {
    id: 'branch-14',
    organization_id: ORG_ID,
    name: 'Branch #14 — Old Town',
    address: '17 Sovetskaya St, Bishkek',
    latitude: 42.8834,
    longitude: 74.6121,
    timezone: 'Asia/Bishkek',
    status: 'active',
    working_hours: defaultWorkingHours(),
    created_at: '2025-07-01T08:00:00.000Z',
    updated_at: '2025-07-01T08:00:00.000Z',
  },
];

export function getDemoBranches(): Branch[] {
  return BRANCHES;
}

export function getDemoBranch(id: string): Branch | null {
  return BRANCHES.find((b) => b.id === id) ?? null;
}

const RATES: ExchangeRate[] = [
  // branch-1
  { id: 'rate-b1-usd', organization_id: ORG_ID, branch_id: 'branch-1', currency: 'USD', buy_rate: 88.5, sell_rate: 89.5, previous_buy_rate: 88.5, previous_sell_rate: 89.5, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  { id: 'rate-b1-eur', organization_id: ORG_ID, branch_id: 'branch-1', currency: 'EUR', buy_rate: 94.8, sell_rate: 96.2, previous_buy_rate: 94.8, previous_sell_rate: 96.2, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  { id: 'rate-b1-rub', organization_id: ORG_ID, branch_id: 'branch-1', currency: 'RUB', buy_rate: 0.92, sell_rate: 0.98, previous_buy_rate: 0.92, previous_sell_rate: 0.98, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  // branch-2
  { id: 'rate-b2-usd', organization_id: ORG_ID, branch_id: 'branch-2', currency: 'USD', buy_rate: 88.5, sell_rate: 89.5, previous_buy_rate: 88.5, previous_sell_rate: 89.5, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  { id: 'rate-b2-eur', organization_id: ORG_ID, branch_id: 'branch-2', currency: 'EUR', buy_rate: 94.8, sell_rate: 96.2, previous_buy_rate: 94.8, previous_sell_rate: 96.2, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  { id: 'rate-b2-rub', organization_id: ORG_ID, branch_id: 'branch-2', currency: 'RUB', buy_rate: 0.92, sell_rate: 0.98, previous_buy_rate: 0.92, previous_sell_rate: 0.98, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  // branch-3 (USD sell drifted — matches alert a3)
  { id: 'rate-b3-usd', organization_id: ORG_ID, branch_id: 'branch-3', currency: 'USD', buy_rate: 88.5, sell_rate: 92.5, previous_buy_rate: 88.5, previous_sell_rate: 89.5, updated_by: null, created_at: '2026-10-16T06:00:00.000Z' },
  { id: 'rate-b3-eur', organization_id: ORG_ID, branch_id: 'branch-3', currency: 'EUR', buy_rate: 94.8, sell_rate: 96.2, previous_buy_rate: 94.8, previous_sell_rate: 96.2, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  { id: 'rate-b3-rub', organization_id: ORG_ID, branch_id: 'branch-3', currency: 'RUB', buy_rate: 0.92, sell_rate: 0.98, previous_buy_rate: 0.92, previous_sell_rate: 0.98, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  // branch-7
  { id: 'rate-b7-usd', organization_id: ORG_ID, branch_id: 'branch-7', currency: 'USD', buy_rate: 88.5, sell_rate: 89.5, previous_buy_rate: 88.5, previous_sell_rate: 89.5, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  { id: 'rate-b7-eur', organization_id: ORG_ID, branch_id: 'branch-7', currency: 'EUR', buy_rate: 94.8, sell_rate: 96.2, previous_buy_rate: 94.8, previous_sell_rate: 96.2, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  { id: 'rate-b7-rub', organization_id: ORG_ID, branch_id: 'branch-7', currency: 'RUB', buy_rate: 0.92, sell_rate: 0.98, previous_buy_rate: 0.92, previous_sell_rate: 0.98, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  // branch-14
  { id: 'rate-b14-usd', organization_id: ORG_ID, branch_id: 'branch-14', currency: 'USD', buy_rate: 88.5, sell_rate: 89.5, previous_buy_rate: 88.5, previous_sell_rate: 89.5, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  { id: 'rate-b14-eur', organization_id: ORG_ID, branch_id: 'branch-14', currency: 'EUR', buy_rate: 94.8, sell_rate: 96.2, previous_buy_rate: 94.8, previous_sell_rate: 96.2, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
  { id: 'rate-b14-rub', organization_id: ORG_ID, branch_id: 'branch-14', currency: 'RUB', buy_rate: 0.92, sell_rate: 0.98, previous_buy_rate: 0.92, previous_sell_rate: 0.98, updated_by: null, created_at: '2026-10-16T02:00:00.000Z' },
];

export function getDemoRates(branchId?: string): ExchangeRate[] {
  return branchId ? RATES.filter((r) => r.branch_id === branchId) : RATES;
}

const CASH: CashBalance[] = [
  { organization_id: ORG_ID, id: 'cash-b1-usd', branch_id: 'branch-1', currency: 'USD', amount: 12400, threshold: 8000, updated_at: '2026-10-16T07:30:00.000Z' },
  { organization_id: ORG_ID, id: 'cash-b1-eur', branch_id: 'branch-1', currency: 'EUR', amount: 8300, threshold: 5000, updated_at: '2026-10-16T07:30:00.000Z' },
  { organization_id: ORG_ID, id: 'cash-b2-usd', branch_id: 'branch-2', currency: 'USD', amount: 2400, threshold: 5000, updated_at: '2026-10-16T07:30:00.000Z' },
  { organization_id: ORG_ID, id: 'cash-b2-eur', branch_id: 'branch-2', currency: 'EUR', amount: 6100, threshold: 5000, updated_at: '2026-10-16T07:30:00.000Z' },
  { organization_id: ORG_ID, id: 'cash-b3-usd', branch_id: 'branch-3', currency: 'USD', amount: 15200, threshold: 8000, updated_at: '2026-10-16T07:30:00.000Z' },
  { organization_id: ORG_ID, id: 'cash-b3-eur', branch_id: 'branch-3', currency: 'EUR', amount: 4200, threshold: 5000, updated_at: '2026-10-16T07:30:00.000Z' },
  { organization_id: ORG_ID, id: 'cash-b7-usd', branch_id: 'branch-7', currency: 'USD', amount: 9800, threshold: 6000, updated_at: '2026-10-16T07:30:00.000Z' },
  { organization_id: ORG_ID, id: 'cash-b7-eur', branch_id: 'branch-7', currency: 'EUR', amount: 5400, threshold: 4000, updated_at: '2026-10-16T07:30:00.000Z' },
  { organization_id: ORG_ID, id: 'cash-b14-usd', branch_id: 'branch-14', currency: 'USD', amount: 21000, threshold: 10000, updated_at: '2026-10-16T07:30:00.000Z' },
  { organization_id: ORG_ID, id: 'cash-b14-eur', branch_id: 'branch-14', currency: 'EUR', amount: 12000, threshold: 6000, updated_at: '2026-10-16T07:30:00.000Z' },
];

export function getDemoCash(branchId?: string): CashBalance[] {
  return branchId ? CASH.filter((c) => c.branch_id === branchId) : CASH;
}

const EMPLOYEES: Employee[] = [
  { id: 'emp-cholpon', organization_id: ORG_ID, branch_id: 'branch-1', name: 'Cholpon Aitmatova', phone: '+996555020201', role: 'cashier', status: 'active', schedule: {}, created_at: '2025-01-10T08:00:00.000Z', updated_at: '2025-01-10T08:00:00.000Z' },
  { id: 'emp-timur', organization_id: ORG_ID, branch_id: 'branch-1', name: 'Timur Abdiev', phone: '+996555020202', role: 'cashier', status: 'active', schedule: {}, created_at: '2025-04-11T08:00:00.000Z', updated_at: '2025-04-11T08:00:00.000Z' },
  { id: 'emp-daniyar', organization_id: ORG_ID, branch_id: 'branch-2', name: 'Daniyar Bekov', phone: '+996555020203', role: 'cashier', status: 'active', schedule: {}, created_at: '2025-02-02T08:00:00.000Z', updated_at: '2025-02-02T08:00:00.000Z' },
  { id: 'emp-gulnara', organization_id: ORG_ID, branch_id: 'branch-3', name: 'Gulnara Sadykova', phone: '+996555020204', role: 'manager', status: 'active', schedule: {}, created_at: '2025-03-15T08:00:00.000Z', updated_at: '2025-03-15T08:00:00.000Z' },
  { id: 'emp-erkin', organization_id: ORG_ID, branch_id: 'branch-7', name: 'Erkin Tologonov', phone: '+996555020205', role: 'security', status: 'active', schedule: {}, created_at: '2025-05-20T08:00:00.000Z', updated_at: '2025-05-20T08:00:00.000Z' },
  { id: 'emp-aigerim', organization_id: ORG_ID, branch_id: 'branch-14', name: 'Aigerim Jusupova', phone: '+996555020206', role: 'cashier', status: 'active', schedule: {}, created_at: '2025-07-01T08:00:00.000Z', updated_at: '2025-07-01T08:00:00.000Z' },
];

export function getDemoEmployees(): Employee[] {
  return EMPLOYEES;
}

export function getDemoEmployee(id: string): Employee | null {
  return EMPLOYEES.find((e) => e.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Mutable demo state (persisted)
// ---------------------------------------------------------------------------

interface DemoState {
  version: 1;
  alerts: Alert[];
  events: EventItem[];
  notes: AlertNoteWithAuthor[];
  audit: AuditLog[];
  cameras: Camera[];
  shifts: Shift[];
  prefs: NotificationPrefs;
}

let cache: DemoState | null = null;
let loadPromise: Promise<DemoState> | null = null;
let seq = 0;

function nid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

function seedCameras(now: number): Camera[] {
  const t = iso(now).slice(0, 10) + 'T08:00:00.000Z';
  const mk = (
    id: string,
    branch_id: string,
    name: string,
    external_id: string,
    status: Camera['status'],
    last_seen_at: string
  ): Camera => ({
    organization_id: ORG_ID,
    id,
    branch_id,
    name,
    external_id,
    provider: 'mock',
    status,
    camera_type: name.includes('Entrance') ? 'bullet' : 'dome',
    last_seen_at,
    configuration: { resolution: '1080p', stream: 'main' },
    created_at: t,
    updated_at: t,
  });
  const recent = iso(now - 2 * MIN);
  return [
    // Branch #1 — 3 online
    mk('cam-1a', 'branch-1', 'Entrance', 'CH01', 'online', recent),
    mk('cam-1b', 'branch-1', 'Cashier Area', 'CH02', 'online', recent),
    mk('cam-1c', 'branch-1', 'Hall', 'CH03', 'online', recent),
    // Branch #2 — 3 online
    mk('cam-2a', 'branch-2', 'Entrance', 'CH01', 'online', recent),
    mk('cam-2b', 'branch-2', 'Cashier Area', 'CH02', 'online', recent),
    mk('cam-2c', 'branch-2', 'Back Office', 'CH03', 'online', recent),
    // Branch #3 — 3 online
    mk('cam-3a', 'branch-3', 'Entrance', 'CH01', 'online', recent),
    mk('cam-3b', 'branch-3', 'Cashier Area', 'CH02', 'online', recent),
    mk('cam-3c', 'branch-3', 'Hall', 'CH03', 'online', recent),
    // Branch #7 — 2, one OFFLINE (17 min ago)
    mk('cam-7a', 'branch-7', 'Entrance', 'CH01', 'offline', iso(now - 17 * MIN)),
    mk('cam-7b', 'branch-7', 'Cashier Area', 'CH02', 'online', recent),
    // Branch #14 — 4 online
    mk('cam-14a', 'branch-14', 'Entrance', 'CH01', 'online', recent),
    mk('cam-14b', 'branch-14', 'Cashier Area', 'CH02', 'online', recent),
    mk('cam-14c', 'branch-14', 'Hall', 'CH03', 'online', recent),
    mk('cam-14d', 'branch-14', 'Back Office', 'CH04', 'online', recent),
  ];
}

function seed(now: number): DemoState {
  const e1Analysis: VisionAnalysis = {
    person_detected: true,
    restricted_area: true,
    outside_working_hours: true,
    confidence: 0.94,
    risk_level: 'high',
    summary:
      'Person detected in the cashier area outside working hours. No matching shift found; recommend manual review.',
    objects_visible: ['person'],
    likely_false_positive: false,
  };

  const events: EventItem[] = [
    {
      id: 'e1',
      organization_id: ORG_ID,
      branch_id: 'branch-14',
      camera_id: 'cam-14b',
      event_type: 'restricted_area',
      source: 'hikvision',
      severity: 'critical',
      timestamp: iso(now - 34 * MIN),
      raw_payload: { channel: 'CH02', description: 'Person in cashier area at 02:17 (local)' },
      snapshot_url: 'https://demo.splintermind.app/snapshots/e1.jpg',
      video_url: null,
      ai_analysis: e1Analysis,
      dedupe_key: null,
      processed_at: null,
      created_at: iso(now - 34 * MIN),
    },
    {
      id: 'e2',
      organization_id: ORG_ID,
      branch_id: 'branch-7',
      camera_id: 'cam-7a',
      event_type: 'camera_offline',
      source: 'hikvision',
      severity: 'high',
      timestamp: iso(now - 17 * MIN),
      raw_payload: { channel: 'CH01', last_frame_age_sec: 1020 },
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: null,
      processed_at: null,
      created_at: iso(now - 17 * MIN),
    },
    {
      id: 'e3',
      organization_id: ORG_ID,
      branch_id: 'branch-3',
      camera_id: null,
      event_type: 'rate_deviation',
      source: 'rule_engine',
      severity: 'medium',
      timestamp: iso(now - 2 * HOUR),
      raw_payload: { currency: 'USD', expected_sell: 89.5, actual_sell: 92.5, deviation_pct: 3.35 },
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: null,
      processed_at: null,
      created_at: iso(now - 2 * HOUR),
    },
    {
      id: 'e4',
      organization_id: ORG_ID,
      branch_id: 'branch-2',
      camera_id: null,
      event_type: 'cash_below_threshold',
      source: 'rule_engine',
      severity: 'medium',
      timestamp: iso(now - 3 * HOUR),
      raw_payload: { currency: 'USD', amount: 2400, threshold: 5000 },
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: null,
      processed_at: null,
      created_at: iso(now - 3 * HOUR),
    },
    {
      id: 'e5',
      organization_id: ORG_ID,
      branch_id: 'branch-1',
      camera_id: 'cam-1a',
      event_type: 'motion_detected',
      source: 'hikvision',
      severity: 'low',
      timestamp: iso(now - 55 * MIN),
      raw_payload: { channel: 'CH01', during_business_hours: true },
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: null,
      processed_at: null,
      created_at: iso(now - 55 * MIN),
    },
    {
      id: 'e6',
      organization_id: ORG_ID,
      branch_id: 'branch-14',
      camera_id: 'cam-14d',
      event_type: 'camera_offline',
      source: 'hikvision',
      severity: 'high',
      timestamp: iso(now - 26 * HOUR),
      raw_payload: { channel: 'CH04', restored_after_min: 42 },
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: null,
      processed_at: null,
      created_at: iso(now - 26 * HOUR),
    },
    {
      id: 'e7',
      organization_id: ORG_ID,
      branch_id: 'branch-1',
      camera_id: 'cam-1a',
      event_type: 'camera_online',
      source: 'hikvision',
      severity: 'info',
      timestamp: iso(now - 6 * HOUR),
      raw_payload: { channel: 'CH01' },
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: null,
      processed_at: null,
      created_at: iso(now - 6 * HOUR),
    },
    {
      id: 'e8',
      organization_id: ORG_ID,
      branch_id: 'branch-2',
      camera_id: null,
      event_type: 'info',
      source: 'system',
      severity: 'info',
      timestamp: iso(now - 5 * HOUR),
      raw_payload: { message: 'USD rates synchronized: buy 88.50, sell 89.50' },
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: null,
      processed_at: null,
      created_at: iso(now - 5 * HOUR),
    },
    {
      id: 'e9',
      organization_id: ORG_ID,
      branch_id: 'branch-3',
      camera_id: null,
      event_type: 'info',
      source: 'system',
      severity: 'info',
      timestamp: iso(now - 4 * HOUR),
      raw_payload: { message: 'Morning shift started — 2 cashiers on duty' },
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: null,
      processed_at: null,
      created_at: iso(now - 4 * HOUR),
    },
    {
      id: 'e10',
      organization_id: ORG_ID,
      branch_id: 'branch-14',
      camera_id: 'cam-14a',
      event_type: 'person_detected',
      source: 'hikvision',
      severity: 'low',
      timestamp: iso(now - 8 * HOUR),
      raw_payload: { channel: 'CH01', during_business_hours: true },
      snapshot_url: null,
      video_url: null,
      ai_analysis: null,
      dedupe_key: null,
      processed_at: null,
      created_at: iso(now - 8 * HOUR),
    },
  ];

  const alerts: Alert[] = [
    {
      id: 'a1',
      organization_id: ORG_ID,
      branch_id: 'branch-14',
      event_id: 'e1',
      title: 'Security event detected',
      description:
        'Person detected in the cashier area outside working hours (02:17). AI review attached.',
      severity: 'critical',
      status: 'open',
      assigned_to: null,
      created_at: iso(now - 34 * MIN),
      acknowledged_at: null,
      resolved_at: null,
    },
    {
      id: 'a2',
      organization_id: ORG_ID,
      branch_id: 'branch-7',
      event_id: 'e2',
      title: 'Camera offline',
      description: 'Entrance camera offline for 17 minutes.',
      severity: 'high',
      status: 'open',
      assigned_to: null,
      created_at: iso(now - 17 * MIN),
      acknowledged_at: null,
      resolved_at: null,
    },
    {
      id: 'a3',
      organization_id: ORG_ID,
      branch_id: 'branch-3',
      event_id: 'e3',
      title: 'Exchange rate not synchronized',
      description: 'USD SELL expected 89.50, current 92.50 (deviation +3.35%).',
      severity: 'medium',
      status: 'open',
      assigned_to: null,
      created_at: iso(now - 2 * HOUR),
      acknowledged_at: null,
      resolved_at: null,
    },
    {
      id: 'a4',
      organization_id: ORG_ID,
      branch_id: 'branch-2',
      event_id: 'e4',
      title: 'USD balance below threshold',
      description: 'USD $2,400 of $5,000 threshold.',
      severity: 'medium',
      status: 'open',
      assigned_to: null,
      created_at: iso(now - 3 * HOUR),
      acknowledged_at: null,
      resolved_at: null,
    },
    {
      id: 'a5',
      organization_id: ORG_ID,
      branch_id: 'branch-1',
      event_id: 'e5',
      title: 'Unusual activity detected',
      description: 'Motion detected at the entrance during business hours.',
      severity: 'low',
      status: 'acknowledged',
      assigned_to: 'user-aibek',
      created_at: iso(now - 55 * MIN),
      acknowledged_at: iso(now - 40 * MIN),
      resolved_at: null,
    },
    {
      id: 'a6',
      organization_id: ORG_ID,
      branch_id: 'branch-14',
      event_id: 'e6',
      title: 'Camera offline',
      description: 'Back Office camera was offline for 42 minutes; stream restored.',
      severity: 'high',
      status: 'resolved',
      assigned_to: 'user-erkin',
      created_at: iso(now - 26 * HOUR),
      acknowledged_at: iso(now - 25.5 * HOUR),
      resolved_at: iso(now - 25 * HOUR),
    },
  ];

  const notes: AlertNoteWithAuthor[] = [
    {
      id: 'note-a5-1',
      organization_id: ORG_ID,
      alert_id: 'a5',
      user_id: 'user-aibek',
      user_name: 'Aibek Koenbaev',
      note: 'Reviewed the feed — normal customer traffic at the entrance. Keeping an eye on it.',
      created_at: iso(now - 38 * MIN),
    },
  ];

  const audit: AuditLog[] = [
    {
      id: 'log-1',
      organization_id: ORG_ID,
      user_id: 'user-aibek',
      action: 'login',
      entity_type: 'user',
      entity_id: 'user-aibek',
      metadata: { method: 'demo' },
      created_at: iso(now - 5 * HOUR),
    },
    {
      id: 'log-2',
      organization_id: ORG_ID,
      user_id: 'user-aibek',
      action: 'alert_acknowledged',
      entity_type: 'alert',
      entity_id: 'a5',
      metadata: { via: 'demo' },
      created_at: iso(now - 40 * MIN),
    },
    {
      id: 'log-3',
      organization_id: ORG_ID,
      user_id: 'user-aibek',
      action: 'alert_resolved',
      entity_type: 'alert',
      entity_id: 'a6',
      metadata: { via: 'demo' },
      created_at: iso(now - 25 * HOUR),
    },
  ];

  const shifts: Shift[] = [
    { organization_id: ORG_ID, id: 'shift-1', branch_id: 'branch-1', employee_id: 'emp-cholpon', start_time: iso(now - 4 * HOUR), end_time: iso(now + 8 * HOUR), status: 'active', created_at: iso(now - 4 * HOUR) },
    { organization_id: ORG_ID, id: 'shift-2', branch_id: 'branch-2', employee_id: 'emp-daniyar', start_time: iso(now - 4 * HOUR), end_time: iso(now + 8 * HOUR), status: 'active', created_at: iso(now - 4 * HOUR) },
    { organization_id: ORG_ID, id: 'shift-3', branch_id: 'branch-3', employee_id: 'emp-gulnara', start_time: iso(now - 4 * HOUR), end_time: iso(now + 8 * HOUR), status: 'active', created_at: iso(now - 4 * HOUR) },
    { organization_id: ORG_ID, id: 'shift-7', branch_id: 'branch-7', employee_id: 'emp-erkin', start_time: iso(now + 1 * HOUR), end_time: iso(now + 13 * HOUR), status: 'scheduled', created_at: iso(now - 20 * HOUR) },
    { organization_id: ORG_ID, id: 'shift-14', branch_id: 'branch-14', employee_id: 'emp-aigerim', start_time: iso(now - 4 * HOUR), end_time: iso(now + 8 * HOUR), status: 'active', created_at: iso(now - 4 * HOUR) },
  ];

  return {
    version: 1,
    alerts,
    events,
    notes,
    audit,
    cameras: seedCameras(now),
    shifts,
    prefs: {
      user_id: 'user-aibek',
      push_enabled: true,
      severities: ['critical', 'high', 'medium'],
      quiet_hours: { start: '23:00', end: '07:00', timezone: 'Asia/Bishkek' },
      whatsapp_number: null,
      whatsapp_enabled: false,
    },
  };
}

async function load(): Promise<DemoState> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as DemoState;
          if (parsed && parsed.version === 1 && Array.isArray(parsed.alerts)) {
            cache = parsed;
            return parsed;
          }
        }
      } catch {
        // Corrupt or unavailable storage — reseed below.
      }
      const seeded = seed(Date.now());
      cache = seeded;
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      } catch {
        // Storage is best-effort; in-memory state still works.
      }
      return seeded;
    })();
  }
  return loadPromise;
}

async function save(): Promise<void> {
  if (!cache) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Best-effort persistence.
  }
}

/** Clear persisted demo state (e.g. from settings "Reset demo data"). */
export async function resetDemoState(): Promise<void> {
  cache = null;
  loadPromise = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getDemoAlerts(): Promise<Alert[]> {
  return (await load()).alerts;
}

export async function getDemoAlert(id: string): Promise<Alert | null> {
  return (await load()).alerts.find((a) => a.id === id) ?? null;
}

export async function getDemoAlertNotes(alertId: string): Promise<AlertNoteWithAuthor[]> {
  const notes = (await load()).notes
    .filter((n) => n.alert_id === alertId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return notes;
}

export async function getDemoAuditLogs(): Promise<AuditLog[]> {
  return (await load()).audit
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getDemoCameras(branchId?: string): Promise<Camera[]> {
  const cameras = (await load()).cameras;
  return branchId ? cameras.filter((c) => c.branch_id === branchId) : cameras;
}

export async function getDemoCamera(id: string): Promise<Camera | null> {
  return (await load()).cameras.find((c) => c.id === id) ?? null;
}

export interface EventFilters {
  branchId?: string;
  cameraId?: string;
  limit?: number;
}

export async function getDemoEvents(opts: EventFilters = {}): Promise<EventItem[]> {
  let events = (await load()).events;
  if (opts.branchId) events = events.filter((e) => e.branch_id === opts.branchId);
  if (opts.cameraId) events = events.filter((e) => e.camera_id === opts.cameraId);
  events = events.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return typeof opts.limit === 'number' ? events.slice(0, opts.limit) : events;
}

export async function getDemoEvent(id: string): Promise<EventItem | null> {
  return (await load()).events.find((e) => e.id === id) ?? null;
}

export async function getDemoShifts(branchId?: string): Promise<Shift[]> {
  const shifts = (await load()).shifts;
  return branchId ? shifts.filter((s) => s.branch_id === branchId) : shifts;
}

export async function getDemoNotificationPrefs(): Promise<NotificationPrefs> {
  return (await load()).prefs;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function pushAudit(
  state: DemoState,
  action: AuditAction,
  entity_type: string,
  entity_id: string,
  metadata: Record<string, unknown> = {}
): void {
  state.audit.push({
    id: nid('log'),
    organization_id: ORG_ID,
    user_id: getDemoUser().id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at: new Date().toISOString(),
  });
}

function pushNote(
  state: DemoState,
  alertId: string,
  note: string
): AlertNoteWithAuthor {
  const user = getDemoUser();
  const entry: AlertNoteWithAuthor = {
    id: nid('note'),
    organization_id: ORG_ID,
    alert_id: alertId,
    user_id: user.id,
    user_name: user.name,
    note,
    created_at: new Date().toISOString(),
  };
  state.notes.push(entry);
  pushAudit(state, 'alert_note_added', 'alert', alertId, { note_id: entry.id });
  return entry;
}

const ACTION_TO_AUDIT: Record<'acknowledge' | 'resolve' | 'ignore', AuditAction> = {
  acknowledge: 'alert_acknowledged',
  resolve: 'alert_resolved',
  ignore: 'alert_ignored',
};

export async function demoAlertAction(
  id: string,
  action: 'acknowledge' | 'resolve' | 'ignore',
  note?: string
): Promise<Alert> {
  const state = await load();
  const alert = state.alerts.find((a) => a.id === id);
  if (!alert) throw new Error(`Alert not found: ${id}`);
  const nowIso = new Date().toISOString();
  if (action === 'acknowledge') {
    alert.status = 'acknowledged';
    alert.acknowledged_at = nowIso;
  } else if (action === 'resolve') {
    alert.status = 'resolved';
    alert.resolved_at = nowIso;
  } else {
    alert.status = 'ignored';
  }
  pushAudit(state, ACTION_TO_AUDIT[action], 'alert', id, { via: 'demo' });
  if (note && note.trim().length > 0) pushNote(state, id, note.trim());
  await save();
  return { ...alert };
}

export async function demoAssignAlert(id: string, userId: string): Promise<Alert> {
  const state = await load();
  const alert = state.alerts.find((a) => a.id === id);
  if (!alert) throw new Error(`Alert not found: ${id}`);
  const user = getDemoUsers().find((u) => u.id === userId);
  if (!user) throw new Error(`User not found: ${userId}`);
  alert.assigned_to = userId;
  pushAudit(state, 'alert_assigned', 'alert', id, {
    via: 'demo',
    assigned_to: userId,
    assigned_to_name: user.name,
  });
  await save();
  return { ...alert };
}

export async function demoAddNote(alertId: string, note: string): Promise<AlertNoteWithAuthor> {
  const state = await load();
  const alert = state.alerts.find((a) => a.id === alertId);
  if (!alert) throw new Error(`Alert not found: ${alertId}`);
  if (note.trim().length === 0) throw new Error('Note cannot be empty');
  const entry = pushNote(state, alertId, note.trim());
  await save();
  return entry;
}

export async function demoUpdateNotificationPrefs(
  patch: Partial<Omit<NotificationPrefs, 'user_id'>>
): Promise<NotificationPrefs> {
  const state = await load();
  state.prefs = { ...state.prefs, ...patch };
  await save();
  return state.prefs;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

interface SimulateResult {
  event: EventItem;
  alert: Alert | null;
}

function makeEvent(
  state: DemoState,
  partial: Omit<EventItem, 'id' | 'organization_id' | 'created_at' | 'dedupe_key' | 'processed_at'>
): EventItem {
  const event: EventItem = {
    ...partial,
    dedupe_key: null,
    processed_at: null,
    id: nid('e'),
    organization_id: ORG_ID,
    created_at: new Date().toISOString(),
  };
  state.events.push(event);
  return event;
}

function makeAlert(
  state: DemoState,
  partial: Omit<Alert, 'id' | 'organization_id' | 'created_at'>
): Alert {
  const alert: Alert = {
    ...partial,
    id: nid('a'),
    organization_id: ORG_ID,
    created_at: new Date().toISOString(),
  };
  state.alerts.push(alert);
  pushAudit(state, 'alert_created', 'alert', alert.id, {
    via: 'demo_simulate',
    severity: alert.severity,
  });
  return alert;
}

const afterHoursAnalysis = (branchName: string): VisionAnalysis => ({
  person_detected: true,
  restricted_area: true,
  outside_working_hours: true,
  confidence: 0.9,
  risk_level: 'high',
  summary: `Person detected in a restricted area at ${branchName} outside working hours. Recommend manual review.`,
  objects_visible: ['person'],
  likely_false_positive: false,
});

export async function demoSimulate(scenario: SimulateScenario): Promise<SimulateResult> {
  const state = await load();
  const nowIso = new Date().toISOString();

  switch (scenario) {
    case 'camera_offline': {
      const camera = state.cameras.find((c) => c.id === 'cam-7b');
      if (camera) {
        camera.status = 'offline';
        camera.last_seen_at = nowIso;
      }
      const event = makeEvent(state, {
        branch_id: 'branch-7',
        camera_id: 'cam-7b',
        event_type: 'camera_offline',
        source: 'hikvision',
        severity: 'high',
        timestamp: nowIso,
        raw_payload: { channel: 'CH02', simulated: true },
        snapshot_url: null,
        video_url: null,
        ai_analysis: null,
      });
      const alert = makeAlert(state, {
        branch_id: 'branch-7',
        event_id: event.id,
        title: 'Camera offline',
        description: 'Cashier Area camera offline (simulated).',
        severity: 'high',
        status: 'open',
        assigned_to: null,
        acknowledged_at: null,
        resolved_at: null,
      });
      await save();
      return { event, alert };
    }
    case 'motion_after_hours': {
      const event = makeEvent(state, {
        branch_id: 'branch-3',
        camera_id: 'cam-3b',
        event_type: 'motion_detected',
        source: 'hikvision',
        severity: 'critical',
        timestamp: nowIso,
        raw_payload: { channel: 'CH02', simulated: true },
        snapshot_url: 'https://demo.splintermind.app/snapshots/sim-motion.jpg',
        video_url: null,
        ai_analysis: afterHoursAnalysis('Branch #3 — Airport'),
      });
      const alert = makeAlert(state, {
        branch_id: 'branch-3',
        event_id: event.id,
        title: 'Security event detected',
        description: 'Motion detected in a restricted area outside working hours (simulated). AI review attached.',
        severity: 'critical',
        status: 'open',
        assigned_to: null,
        acknowledged_at: null,
        resolved_at: null,
      });
      await save();
      return { event, alert };
    }
    case 'suspicious': {
      const event = makeEvent(state, {
        branch_id: 'branch-14',
        camera_id: 'cam-14b',
        event_type: 'person_detected',
        source: 'hikvision',
        severity: 'critical',
        timestamp: nowIso,
        raw_payload: { channel: 'CH02', simulated: true },
        snapshot_url: 'https://demo.splintermind.app/snapshots/sim-suspicious.jpg',
        video_url: null,
        ai_analysis: {
          ...afterHoursAnalysis('Branch #14 — Old Town'),
          confidence: 0.87,
          summary: 'Suspicious loitering near the cashier area (simulated). Recommend manual review.',
        },
      });
      const alert = makeAlert(state, {
        branch_id: 'branch-14',
        event_id: event.id,
        title: 'Security event detected',
        description: 'Suspicious activity near the cashier area (simulated). AI review attached.',
        severity: 'critical',
        status: 'open',
        assigned_to: null,
        acknowledged_at: null,
        resolved_at: null,
      });
      await save();
      return { event, alert };
    }
    case 'rate_mismatch': {
      const event = makeEvent(state, {
        branch_id: 'branch-1',
        camera_id: null,
        event_type: 'rate_deviation',
        source: 'rule_engine',
        severity: 'medium',
        timestamp: nowIso,
        raw_payload: { currency: 'EUR', expected_sell: 96.2, actual_sell: 99.1, deviation_pct: 3.01, simulated: true },
        snapshot_url: null,
        video_url: null,
        ai_analysis: null,
      });
      const alert = makeAlert(state, {
        branch_id: 'branch-1',
        event_id: event.id,
        title: 'Exchange rate not synchronized',
        description: 'EUR SELL expected 96.20, current 99.10 (deviation +3.01%, simulated).',
        severity: 'medium',
        status: 'open',
        assigned_to: null,
        acknowledged_at: null,
        resolved_at: null,
      });
      await save();
      return { event, alert };
    }
    case 'low_cash': {
      const event = makeEvent(state, {
        branch_id: 'branch-3',
        camera_id: null,
        event_type: 'cash_below_threshold',
        source: 'rule_engine',
        severity: 'medium',
        timestamp: nowIso,
        raw_payload: { currency: 'EUR', amount: 3100, threshold: 5000, simulated: true },
        snapshot_url: null,
        video_url: null,
        ai_analysis: null,
      });
      const alert = makeAlert(state, {
        branch_id: 'branch-3',
        event_id: event.id,
        title: 'EUR balance below threshold',
        description: 'EUR €3,100 of €5,000 threshold (simulated).',
        severity: 'medium',
        status: 'open',
        assigned_to: null,
        acknowledged_at: null,
        resolved_at: null,
      });
      await save();
      return { event, alert };
    }
    default: {
      throw new Error(`Unknown scenario: ${scenario}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Branch timeline
// ---------------------------------------------------------------------------

export async function branchTimeline(branchId: string): Promise<TimelineItem[]> {
  const state = await load();
  const items: TimelineItem[] = [];

  for (const e of state.events) {
    if (e.branch_id !== branchId) continue;
    items.push({
      id: e.id,
      time: e.timestamp,
      title: humanize(e.event_type),
      description: typeof e.raw_payload.message === 'string' ? e.raw_payload.message : undefined,
      kind: 'event',
      severity: e.severity,
    });
  }

  for (const a of state.alerts) {
    if (a.branch_id !== branchId) continue;
    items.push({
      id: a.id,
      time: a.created_at,
      title: a.title,
      description: a.description ?? undefined,
      kind: 'alert',
      severity: a.severity,
    });
  }

  const alertIds = new Set(state.alerts.filter((a) => a.branch_id === branchId).map((a) => a.id));
  for (const n of state.notes) {
    if (!alertIds.has(n.alert_id)) continue;
    items.push({
      id: n.id,
      time: n.created_at,
      title: `Note by ${n.user_name}`,
      description: n.note,
      kind: 'note',
    });
  }

  for (const log of state.audit) {
    const relevant =
      (log.entity_type === 'branch' && log.entity_id === branchId) ||
      (log.entity_type === 'alert' && log.entity_id !== null && alertIds.has(log.entity_id));
    if (!relevant) continue;
    items.push({
      id: log.id,
      time: log.created_at,
      title: humanize(log.action),
      kind: 'audit',
    });
  }

  for (const s of state.shifts) {
    if (s.branch_id !== branchId) continue;
    const emp = getDemoEmployee(s.employee_id);
    items.push({
      id: s.id,
      time: s.start_time,
      title: `Shift — ${emp ? emp.name : 'Unknown'}`,
      description: `${humanize(s.status)} shift`,
      kind: 'shift',
    });
  }

  items.sort((a, b) => b.time.localeCompare(a.time));
  return items;
}
