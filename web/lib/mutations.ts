/**
 * Client-side mutations against PostgREST. Alert status transitions are
 * guarded server-side: RLS tenant isolation + `guard_alert_update()` trigger
 * (operational roles only) + `log_alert_change()` trigger writing audit_logs
 * with auth.uid() as the actor. NEVER insert into audit_logs directly —
 * RLS denies it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertStatus, Severity } from "@splinter-mind/core";
import { getBrowserClient } from "./supabase/client";

export type AlertAction = "acknowledge" | "resolve" | "ignore";

const ACTION_TO_STATUS: Record<AlertAction, AlertStatus> = {
  acknowledge: "acknowledged",
  resolve: "resolved",
  ignore: "ignored",
};

export async function runAlertAction(
  alertId: string,
  action: AlertAction,
  note?: string
): Promise<void> {
  const supabase = getBrowserClient();
  const nowIso = new Date().toISOString();
  const patch: Record<string, string> = { status: ACTION_TO_STATUS[action] };
  if (action === "acknowledge") patch.acknowledged_at = nowIso;
  if (action === "resolve") patch.resolved_at = nowIso;

  const { data: alert, error } = await supabase
    .from("alerts")
    .update(patch)
    .eq("id", alertId)
    .select("id,organization_id")
    .single();
  if (error) throw new Error(error.message);

  if (note && note.trim().length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    const { error: noteError } = await supabase.from("alert_notes").insert({
      organization_id: (alert as { organization_id: string }).organization_id,
      alert_id: alertId,
      user_id: user.id,
      note: note.trim(),
    });
    if (noteError) throw new Error(noteError.message);
  }
}

export async function assignAlert(
  alertId: string,
  userId: string
): Promise<void> {
  const supabase = getBrowserClient();
  const { error } = await supabase
    .from("alerts")
    .update({ assigned_to: userId })
    .eq("id", alertId);
  if (error) throw new Error(error.message);
}

export async function addAlertNote(
  alertId: string,
  organizationId: string,
  note: string
): Promise<void> {
  const supabase = getBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase.from("alert_notes").insert({
    organization_id: organizationId,
    alert_id: alertId,
    user_id: user.id,
    note: note.trim(),
  });
  if (error) throw new Error(error.message);
}

export interface PrefsPatch {
  push_enabled?: boolean;
  severities?: Severity[];
  quiet_hours?: { start: string; end: string; timezone?: string } | null;
  // Track A (WhatsApp) columns — only sent when the caller provides them.
  whatsapp_enabled?: boolean;
  whatsapp_number?: string | null;
}

export async function updateNotificationPrefs(
  userId: string,
  patch: PrefsPatch
): Promise<void> {
  const supabase = getBrowserClient();
  const { error } = await supabase
    .from("notification_prefs")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

/**
 * GET /functions/v1/snapshot?camera_id=… — captures a still via the camera
 * provider and returns a short-lived signed URL. The function only accepts
 * GET, so this uses fetch directly (not supabase.functions.invoke).
 */
export async function fetchSnapshot(cameraId: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase is not configured");
  const supabase: SupabaseClient = getBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(
    `${url}/functions/v1/snapshot?camera_id=${encodeURIComponent(cameraId)}`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session?.access_token ?? anonKey}`,
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Snapshot request failed (${res.status})`);
  }
  const body = (await res.json()) as { snapshot_url?: string };
  if (!body.snapshot_url) throw new Error("Snapshot URL missing in response");
  return body.snapshot_url;
}

export async function signOut(): Promise<void> {
  const supabase = getBrowserClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}
