/**
 * Server-side data access. Every function runs with the per-user server
 * client, so Postgres RLS enforces tenant isolation — no org filtering here
 * is a security measure, it is only a convenience.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Alert,
  AlertStatus,
  Branch,
  Camera,
  CameraEvent,
  CashBalance,
  Employee,
  ExchangeRate,
  Organization,
  OrgUser,
  Severity,
  Shift,
} from "@splinter-mind/core";
import type { AlertNoteWithAuthor } from "./types";
import type { NotificationPref } from "@splinter-mind/core";

export async function getProfile(
  supabase: SupabaseClient
): Promise<OrgUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as OrgUser | null;
}

export async function getOrganization(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Organization | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Organization | null;
}

export async function getBranches(supabase: SupabaseClient): Promise<Branch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Branch[];
}

export async function getBranch(
  supabase: SupabaseClient,
  id: string
): Promise<Branch | null> {
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Branch | null;
}

export interface AlertFilters {
  status?: AlertStatus;
  severity?: Severity;
  branchId?: string;
  limit?: number;
}

export async function getAlerts(
  supabase: SupabaseClient,
  filters: AlertFilters = {}
): Promise<Alert[]> {
  let query = supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.limit) query = query.limit(filters.limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Alert[];
}

export async function getAlert(
  supabase: SupabaseClient,
  id: string
): Promise<Alert | null> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Alert | null;
}

/** alert_notes has no user_name column — join display names from users. */
export async function getAlertNotes(
  supabase: SupabaseClient,
  alertId: string
): Promise<AlertNoteWithAuthor[]> {
  const { data, error } = await supabase
    .from("alert_notes")
    .select("*")
    .eq("alert_id", alertId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const notes = (data ?? []) as Array<{
    id: string;
    organization_id: string;
    alert_id: string;
    user_id: string;
    note: string;
    created_at: string;
  }>;
  const userIds = [...new Set(notes.map((n) => n.user_id))];
  let names: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id,name")
      .in("id", userIds);
    if (usersError) throw new Error(usersError.message);
    names = Object.fromEntries(
      ((users ?? []) as Array<{ id: string; name: string }>).map((u) => [
        u.id,
        u.name,
      ])
    );
  }
  return notes.map((n) => ({ ...n, user_name: names[n.user_id] ?? null }));
}

export interface EventFilters {
  branchId?: string;
  cameraId?: string;
  eventType?: string;
  limit?: number;
}

export async function getEvents(
  supabase: SupabaseClient,
  filters: EventFilters = {}
): Promise<CameraEvent[]> {
  let query = supabase
    .from("events")
    .select("*")
    .order("timestamp", { ascending: false });
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.cameraId) query = query.eq("camera_id", filters.cameraId);
  if (filters.eventType) query = query.eq("event_type", filters.eventType);
  query = query.limit(filters.limit ?? 100);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as CameraEvent[];
}

export async function getEvent(
  supabase: SupabaseClient,
  id: string
): Promise<CameraEvent | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as CameraEvent | null;
}

export async function getCameras(
  supabase: SupabaseClient,
  branchId?: string
): Promise<Camera[]> {
  let query = supabase.from("cameras").select("*").order("name");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Camera[];
}

export async function getCamera(
  supabase: SupabaseClient,
  id: string
): Promise<Camera | null> {
  const { data, error } = await supabase
    .from("cameras")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Camera | null;
}

export async function getExchangeRates(
  supabase: SupabaseClient,
  branchId?: string
): Promise<ExchangeRate[]> {
  let query = supabase.from("exchange_rates").select("*").order("currency");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ExchangeRate[];
}

export async function getCashBalances(
  supabase: SupabaseClient,
  branchId?: string
): Promise<CashBalance[]> {
  let query = supabase.from("cash_balances").select("*").order("currency");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as CashBalance[];
}

export interface ShiftWithEmployee extends Shift {
  employee_name: string | null;
}

export async function getShifts(
  supabase: SupabaseClient,
  branchId?: string
): Promise<ShiftWithEmployee[]> {
  let query = supabase
    .from("shifts")
    .select("*")
    .order("start_time", { ascending: false })
    .limit(50);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const shifts = (data ?? []) as Shift[];
  const employeeIds = [...new Set(shifts.map((s) => s.employee_id))];
  let names: Record<string, string> = {};
  if (employeeIds.length > 0) {
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id,name")
      .in("id", employeeIds);
    if (empError) throw new Error(empError.message);
    names = Object.fromEntries(
      ((employees ?? []) as Array<{ id: string; name: string }>).map((e) => [
        e.id,
        e.name,
      ])
    );
  }
  return shifts.map((s) => ({
    ...s,
    employee_name: names[s.employee_id] ?? null,
  }));
}

export async function getEmployees(
  supabase: SupabaseClient,
  branchId?: string
): Promise<Employee[]> {
  let query = supabase.from("employees").select("*").order("name");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Employee[];
}

/** Users visible to the caller (RLS: self + operational roles see org users). */
export async function getUsers(supabase: SupabaseClient): Promise<OrgUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("status", "active")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as OrgUser[];
}

/**
 * Notification prefs. Track A added WhatsApp columns (migration 0003) —
 * select('*') so a not-yet-migrated DB can't break the query; the settings
 * form additionally checks key presence before rendering WhatsApp fields.
 */
export async function getNotificationPrefs(
  supabase: SupabaseClient,
  userId: string
): Promise<NotificationPref | null> {
  const { data, error } = await supabase
    .from("notification_prefs")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as NotificationPref | null;
}

export interface DashboardSummary {
  branchCount: number;
  openBySeverity: Record<Severity, number>;
  criticalAlerts: Alert[];
  warningAlerts: Alert[];
  recentAlerts: Alert[];
}

const EMPTY_COUNTS: Record<Severity, number> = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
};

export async function getDashboardSummary(
  supabase: SupabaseClient
): Promise<DashboardSummary> {
  const [branches, alerts] = await Promise.all([
    getBranches(supabase),
    getAlerts(supabase, { limit: 200 }),
  ]);
  const openBySeverity: Record<Severity, number> = { ...EMPTY_COUNTS };
  for (const alert of alerts) {
    if (alert.status === "open") {
      openBySeverity[alert.severity] += 1;
    }
  }
  return {
    branchCount: branches.length,
    openBySeverity,
    criticalAlerts: alerts.filter(
      (a) => a.status === "open" && a.severity === "critical"
    ),
    warningAlerts: alerts.filter(
      (a) => a.status === "open" && a.severity === "high"
    ),
    recentAlerts: alerts.slice(0, 10),
  };
}
