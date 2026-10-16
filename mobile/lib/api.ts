import type { SimulateScenario } from '../types';
import { getSupabase } from './supabase';

/** Invoke a Supabase Edge Function (POST). Throws a typed Error on failure. */
export async function callEdgeFunction<T>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw new Error(error.message);
    return data as T;
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Edge function "${name}" failed`);
  }
}

/** POST /functions/v1/simulate result — mirrors the process-event result. */
export interface SimulateResponse {
  scenario: string;
  status: 'processed' | 'already_processed';
  event_id: string;
  actions: Array<{ action: string; severity?: string; rule_id?: string }>;
  alert_id: string | null;
}

export interface SimulateTarget {
  camera_id?: string;
  branch_id?: string;
}

/**
 * POST /functions/v1/simulate — dev-only: fire a mock scenario end-to-end.
 * Camera scenarios (camera_offline, motion_after_hours, suspicious) need a
 * camera_id; business scenarios (rate_mismatch, low_cash) need a branch_id.
 */
export function fnSimulate(
  scenario: SimulateScenario,
  target: SimulateTarget = {}
): Promise<SimulateResponse> {
  return callEdgeFunction<SimulateResponse>('simulate', { scenario, ...target });
}

/**
 * GET /functions/v1/snapshot?camera_id=… — captures a still via the camera
 * provider and returns a short-lived signed URL. (The snapshot function only
 * accepts GET, so this bypasses supabase.functions.invoke which POSTs.)
 */
export async function fnSnapshot(
  cameraId: string
): Promise<{ snapshot_url: string }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
  const supabase = getSupabase();
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
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`Snapshot failed (${res.status}) ${detail}`.trim());
  }
  return (await res.json()) as { snapshot_url: string };
}
