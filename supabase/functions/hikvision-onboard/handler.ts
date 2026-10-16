/**
 * POST /hikvision-onboard — register a real Hikvision NVR/device (Phase 2B).
 *
 * Auth: service-role bearer, or an owner/admin user JWT (role checked by the
 * index.ts entrypoint; re-checked here for defense in depth).
 *
 * Body: {
 *   "branch_id": "<uuid>", "name": "NVR — Branch #14",
 *   "host": "192.168.10.20", "port"?: 80, "use_https"?: false,
 *   "username": "admin", "password": "<isapi password>"
 * }
 *
 * Flow: validate -> reach the device via ISAPI (getDeviceInfo) -> enumerate
 * channels (listChannels) -> store the password in Supabase Vault (only the
 * vault secret id is kept) -> insert the devices row -> insert one cameras
 * row per enabled channel.
 *
 * Security: the password is sent once over TLS, stored in Vault, and is
 * NEVER logged, NEVER persisted in any table, and NEVER returned.
 *
 * Responses:
 *   201 { device, cameras }      — onboarded
 *   400 { error }                — bad input
 *   401 { error: unauthorized }  — no/invalid credentials (from index.ts)
 *   403 { error: forbidden }     — caller is not owner/admin
 *   404 { error: branch_not_found }
 *   409 { error: device_already_registered } — same branch+host onboarded
 *   422 { error: no_enabled_channels } — device reachable, nothing to add
 *   502 { error: device_unreachable, reason } — ISAPI call failed
 */
import {
  HikvisionProvider,
  type HikvisionChannel,
  type HikvisionDeviceInfo,
  type ProviderCredentials,
} from '../../../packages/core/src/index.ts';
import type { UserRole } from '../../../packages/core/src/index.ts';
import type { DbPort, NewCamera, NewDevice } from '../_shared/db-port.ts';
import { badRequest, json, readJson } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';

export type OnboardCaller =
  | { kind: 'service' }
  | { kind: 'user'; userId: string; role: UserRole };

/** Minimal provider surface the handler needs — injectable in tests. */
export interface OnboardProvider {
  getDeviceInfo(): Promise<HikvisionDeviceInfo>;
  listChannels(): Promise<HikvisionChannel[]>;
}

export interface OnboardDeps {
  db: DbPort;
  caller: OnboardCaller;
  providerFactory?: (creds: ProviderCredentials) => OnboardProvider;
}

const ADMIN_ROLES: readonly UserRole[] = ['owner', 'admin'];

interface OnboardBody {
  branch_id: unknown;
  name: unknown;
  host: unknown;
  port?: unknown;
  use_https?: unknown;
  username: unknown;
  password: unknown;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Hostname / IP literal — no scheme, path, userinfo or whitespace. */
function isValidHost(host: string): boolean {
  const h = host.trim();
  if (h.length === 0 || h.length > 253) return false;
  if (/\s/.test(h) || h.includes('/') || h.includes('@') || h.includes('://')) return false;
  return true;
}

function parsePort(v: unknown, useHttps: boolean): number | null {
  if (v === undefined || v === null) return useHttps ? 443 : 80;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

export async function handleOnboard(req: Request, deps: OnboardDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // -- caller authorization (index.ts enforces; re-check here) --------------
  const { caller } = deps;
  const actorId = caller.kind === 'user' ? caller.userId : null;
  if (caller.kind !== 'service' && !ADMIN_ROLES.includes(caller.role)) {
    return json(403, { error: 'forbidden', reason: 'owner or admin role required' });
  }

  // -- input validation -----------------------------------------------------
  const parsed = await readJson(req);
  if (!parsed.ok) return badRequest(parsed.error);
  const body = parsed.value as OnboardBody;

  if (!isNonEmptyString(body.branch_id)) return badRequest('branch_id is required');
  if (!isNonEmptyString(body.name)) return badRequest('name is required');
  if (!isNonEmptyString(body.host) || !isValidHost(body.host)) {
    return badRequest('host must be a hostname or IP (no scheme, path or credentials)');
  }
  if (!isNonEmptyString(body.username)) return badRequest('username is required');
  if (!isNonEmptyString(body.password)) return badRequest('password is required');
  const useHttps = body.use_https === true;
  const port = parsePort(body.port, useHttps);
  if (port === null) return badRequest('port must be an integer 1-65535');

  const host = body.host.trim();
  const name = body.name.trim();
  const username = body.username.trim();

  // -- branch + duplicate checks ---------------------------------------------
  const branch = await deps.db.getBranch(body.branch_id);
  if (!branch) return json(404, { error: 'branch_not_found' });
  const existing = await deps.db.getDeviceByHost(branch.id, host);
  if (existing) {
    return json(409, { error: 'device_already_registered', device_id: existing.id });
  }

  // -- reach the device (credentials live only in this scope) ----------------
  const creds: ProviderCredentials = {
    host,
    port,
    useHttps,
    username,
    password: body.password,
  };
  const provider: OnboardProvider = deps.providerFactory
    ? deps.providerFactory(creds)
    : new HikvisionProvider(creds);

  let deviceInfo: HikvisionDeviceInfo;
  try {
    deviceInfo = await provider.getDeviceInfo();
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';
    log('warn', 'onboard: device unreachable', { host, port, reason });
    return json(502, { error: 'device_unreachable', reason });
  }

  let channels: HikvisionChannel[];
  try {
    channels = await provider.listChannels();
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';
    log('warn', 'onboard: channel enumeration failed', { host, reason });
    return json(502, { error: 'device_unreachable', reason });
  }
  const enabled = channels.filter((c) => c.enabled);
  if (enabled.length === 0) {
    log('warn', 'onboard: no enabled channels', { host, channels: channels.length });
    return json(422, { error: 'no_enabled_channels' });
  }

  // -- persist: Vault first, then the device row, then one camera per channel
  const now = new Date().toISOString();
  let credentialsRef: string;
  try {
    credentialsRef = await deps.db.createVaultSecret(
      body.password,
      `hikvision:${host}`,
      `ISAPI credentials for "${name}" (branch ${branch.id})`,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';
    log('error', 'onboard: vault write failed', { host, reason });
    return json(500, { error: 'vault_unavailable', reason });
  }

  const deviceRow: NewDevice = {
    organization_id: branch.organization_id,
    branch_id: branch.id,
    name,
    provider: 'hikvision',
    host,
    port,
    use_https: useHttps,
    username,
    credentials_ref: credentialsRef,
    status: 'active',
    last_seen_at: now,
  };
  const device = await deps.db.insertDevice(deviceRow);

  const cameras = [];
  for (const ch of enabled) {
    const row: NewCamera = {
      organization_id: branch.organization_id,
      branch_id: branch.id,
      name: ch.name,
      external_id: `${device.id}:${ch.id}`,
      provider: 'hikvision',
      status: 'online',
      camera_type: null,
      last_seen_at: now,
      configuration: { device_id: device.id, channel_id: ch.id },
    };
    cameras.push(await deps.db.insertCamera(row));
  }

  await deps.db.insertAuditLog({
    organization_id: branch.organization_id,
    user_id: actorId,
    action: 'camera_config_changed',
    entity_type: 'device',
    entity_id: device.id,
    metadata: {
      host,
      port,
      channels_onboarded: enabled.length,
      device_model: deviceInfo.model || null,
    },
  });

  log('info', 'onboard: device registered', {
    device_id: device.id,
    host,
    channels: enabled.length,
  });

  // credentials_ref is a Vault id (not the password) — still, keep the
  // response surface minimal and don't return it.
  const devicePublic = {
    id: device.id,
    organization_id: device.organization_id,
    branch_id: device.branch_id,
    name: device.name,
    provider: device.provider,
    host: device.host,
    port: device.port,
    use_https: device.use_https,
    username: device.username,
    status: device.status,
    last_seen_at: device.last_seen_at,
    created_at: device.created_at,
    updated_at: device.updated_at,
  };
  return json(201, { device: devicePublic, cameras });
}
