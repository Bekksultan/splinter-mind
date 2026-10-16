/**
 * Production database wiring: Supabase service_role client + DbPort impl.
 * Deno-only (Deno.env, jsr: import). Imported exclusively from each
 * function's index.ts — never from handler.ts (keeps handlers testable).
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type {
  Alert,
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
import { OPERATIONAL_ROLES } from '../../../packages/core/src/index.ts';
import type {
  CameraEventPatch,
  DbPort,
  NewAlert,
  NewAuditLog,
  NewCameraEvent,
  NewRuleFire,
} from './db-port.ts';

export function mustEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name);
}

export function createServiceClient(): SupabaseClient {
  return createClient(mustEnv('SUPABASE_URL'), mustEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

function throwIf(error: { message: string } | null, op: string): void {
  if (error) throw new Error(`${op} failed: ${error.message}`);
}

export class SupabaseDbPort implements DbPort {
  constructor(private readonly client: SupabaseClient) {}

  async getCameraByExternalId(externalId: string): Promise<Camera | null> {
    const { data, error } = await this.client
      .from('cameras')
      .select('*')
      .eq('external_id', externalId)
      .maybeSingle();
    throwIf(error, 'getCameraByExternalId');
    return (data ?? null) as Camera | null;
  }

  async getCamera(cameraId: string): Promise<Camera | null> {
    const { data, error } = await this.client.from('cameras').select('*').eq('id', cameraId).maybeSingle();
    throwIf(error, 'getCamera');
    return (data ?? null) as Camera | null;
  }

  async getBranch(branchId: string): Promise<Branch | null> {
    const { data, error } = await this.client.from('branches').select('*').eq('id', branchId).maybeSingle();
    throwIf(error, 'getBranch');
    return (data ?? null) as Branch | null;
  }

  async updateCameraLastSeen(cameraId: string, atIso: string): Promise<void> {
    const { error } = await this.client.from('cameras').update({ last_seen_at: atIso }).eq('id', cameraId);
    throwIf(error, 'updateCameraLastSeen');
  }

  async updateCameraStatus(cameraId: string, status: CameraStatus, lastSeenIso: string): Promise<void> {
    const { error } = await this.client
      .from('cameras')
      .update({ status, last_seen_at: lastSeenIso })
      .eq('id', cameraId);
    throwIf(error, 'updateCameraStatus');
  }

  async getRules(organizationId: string): Promise<Rule[]> {
    const { data, error } = await this.client
      .from('rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('enabled', true)
      .order('created_at', { ascending: true });
    throwIf(error, 'getRules');
    return (data ?? []) as Rule[];
  }

  async getRecentFires(ruleIds: string[], sinceIso: string): Promise<RuleFire[]> {
    if (ruleIds.length === 0) return [];
    const { data, error } = await this.client
      .from('rule_fires')
      .select('*')
      .in('rule_id', ruleIds)
      .gte('fired_at', sinceIso);
    throwIf(error, 'getRecentFires');
    return (data ?? []) as RuleFire[];
  }

  async recordFire(row: NewRuleFire): Promise<void> {
    const { error } = await this.client.from('rule_fires').insert(row);
    throwIf(error, 'recordFire');
  }

  async findEventByDedupe(dedupeKey: string): Promise<CameraEvent | null> {
    const { data, error } = await this.client
      .from('events')
      .select('*')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();
    throwIf(error, 'findEventByDedupe');
    return (data ?? null) as CameraEvent | null;
  }

  async insertEvent(row: NewCameraEvent): Promise<CameraEvent> {
    const { data, error } = await this.client.from('events').insert(row).select().single();
    throwIf(error, 'insertEvent');
    return data as CameraEvent;
  }

  async getEvent(eventId: string): Promise<CameraEvent | null> {
    const { data, error } = await this.client.from('events').select('*').eq('id', eventId).maybeSingle();
    throwIf(error, 'getEvent');
    return (data ?? null) as CameraEvent | null;
  }

  async claimEvent(eventId: string): Promise<CameraEvent | null> {
    const { data, error } = await this.client
      .from('events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', eventId)
      .is('processed_at', null)
      .select()
      .maybeSingle();
    throwIf(error, 'claimEvent');
    return (data ?? null) as CameraEvent | null;
  }

  async updateEvent(eventId: string, patch: CameraEventPatch): Promise<void> {
    const { error } = await this.client.from('events').update(patch).eq('id', eventId);
    throwIf(error, 'updateEvent');
  }

  async getAlertByEventId(eventId: string): Promise<Alert | null> {
    const { data, error } = await this.client
      .from('alerts')
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle();
    throwIf(error, 'getAlertByEventId');
    return (data ?? null) as Alert | null;
  }

  async insertAlert(row: NewAlert): Promise<Alert> {
    const { data, error } = await this.client.from('alerts').insert(row).select().single();
    throwIf(error, 'insertAlert');
    return data as Alert;
  }

  async getAlert(alertId: string): Promise<Alert | null> {
    const { data, error } = await this.client.from('alerts').select('*').eq('id', alertId).maybeSingle();
    throwIf(error, 'getAlert');
    return (data ?? null) as Alert | null;
  }

  async getLatestRates(branchId: string): Promise<ExchangeRate[]> {
    const { data, error } = await this.client
      .from('exchange_rates')
      .select('*')
      .eq('branch_id', branchId);
    throwIf(error, 'getLatestRates');
    return (data ?? []) as ExchangeRate[];
  }

  async getCashBalances(branchId: string): Promise<CashBalance[]> {
    const { data, error } = await this.client
      .from('cash_balances')
      .select('*')
      .eq('branch_id', branchId);
    throwIf(error, 'getCashBalances');
    return (data ?? []) as CashBalance[];
  }

  async getNotificationUsers(organizationId: string): Promise<OrgUser[]> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .in('role', [...OPERATIONAL_ROLES]);
    throwIf(error, 'getNotificationUsers');
    return (data ?? []) as OrgUser[];
  }

  async getPushTokens(userIds: string[]): Promise<PushToken[]> {
    if (userIds.length === 0) return [];
    const { data, error } = await this.client.from('push_tokens').select('*').in('user_id', userIds);
    throwIf(error, 'getPushTokens');
    return (data ?? []) as PushToken[];
  }

  async getNotificationPrefs(userIds: string[]): Promise<NotificationPref[]> {
    if (userIds.length === 0) return [];
    const { data, error } = await this.client
      .from('notification_prefs')
      .select('*')
      .in('user_id', userIds);
    throwIf(error, 'getNotificationPrefs');
    return (data ?? []) as NotificationPref[];
  }

  async insertAuditLog(row: NewAuditLog): Promise<void> {
    const { error } = await this.client.from('audit_logs').insert(row);
    throwIf(error, 'insertAuditLog');
  }

  async uploadSnapshot(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.client.storage
      .from('snapshots')
      .upload(path, bytes, { contentType, upsert: true });
    throwIf(error, 'uploadSnapshot');
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from('snapshots')
      .createSignedUrl(path, expiresInSeconds);
    throwIf(error, 'createSignedUrl');
    if (!data?.signedUrl) throw new Error('createSignedUrl returned no URL');
    return data.signedUrl;
  }
}
