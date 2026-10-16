/**
 * Handler-level tests: POST /hikvision-onboard validation, authorization,
 * device-unreachable mapping, and the happy-path persistence (Vault ref +
 * device row + one camera per enabled channel).
 */
import { describe, expect, it } from 'vitest';
import {
  handleOnboard,
  type OnboardCaller,
  type OnboardDeps,
  type OnboardProvider,
} from '../../../../supabase/functions/hikvision-onboard/handler.ts';
import type {
  HikvisionChannel,
  HikvisionDeviceInfo,
  ProviderCredentials,
} from '../../src/providers.ts';
import { FakeDb, TEST_BRANCH } from './fake-db.ts';

const ADMIN: OnboardCaller = { kind: 'user', userId: 'admin-1', role: 'owner' };
const COORDINATOR: OnboardCaller = { kind: 'user', userId: 'coord-1', role: 'coordinator' };

const GOOD_BODY = {
  branch_id: TEST_BRANCH,
  name: 'NVR — Branch #14',
  host: '192.168.10.20',
  port: 80,
  use_https: false,
  username: 'splintermind',
  password: 's3cret-isapi',
};

const DEVICE_INFO: HikvisionDeviceInfo = {
  deviceName: 'NVR-Branch14',
  model: 'DS-7616NI-K2',
  serialNumber: 'SN123',
  firmwareVersion: 'V4.61',
};

const CHANNELS: HikvisionChannel[] = [
  { id: '101', name: 'Entrance', enabled: true },
  { id: '102', name: 'Cashier Area', enabled: true },
  { id: '103', name: 'Storage', enabled: false },
];

function postRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://functions.test/hikvision-onboard', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deps(
  db: FakeDb,
  caller: OnboardCaller = ADMIN,
  provider?: Partial<OnboardProvider>,
): OnboardDeps {
  const seen: ProviderCredentials[] = [];
  return {
    db,
    caller,
    providerFactory: (creds) => {
      seen.push(creds);
      return {
        getDeviceInfo: async () => provider?.getDeviceInfo?.() ?? DEVICE_INFO,
        listChannels: async () => provider?.listChannels?.() ?? CHANNELS,
      };
    },
  };
}

describe('handleOnboard validation', () => {
  it('rejects non-POST with 405', async () => {
    const req = new Request('https://functions.test/hikvision-onboard', { method: 'GET' });
    const res = await handleOnboard(req, deps(new FakeDb().seedBasics()));
    expect(res.status).toBe(405);
  });

  it.each(['branch_id', 'name', 'host', 'username', 'password'])(
    'returns 400 when %s is missing',
    async (field) => {
      const body = { ...GOOD_BODY, [field]: '' };
      const res = await handleOnboard(postRequest(body), deps(new FakeDb().seedBasics()));
      expect(res.status).toBe(400);
    },
  );

  it('returns 400 for a host with scheme/path', async () => {
    const db = new FakeDb().seedBasics();
    for (const host of ['http://192.168.10.20', '192.168.10.20/api', 'user@host']) {
      const res = await handleOnboard(postRequest({ ...GOOD_BODY, host }), deps(db));
      expect(res.status).toBe(400);
    }
  });

  it('returns 400 for an out-of-range port', async () => {
    const res = await handleOnboard(
      postRequest({ ...GOOD_BODY, port: 99999 }),
      deps(new FakeDb().seedBasics()),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown branch', async () => {
    const res = await handleOnboard(
      postRequest({ ...GOOD_BODY, branch_id: 'nope' }),
      deps(new FakeDb().seedBasics()),
    );
    expect(res.status).toBe(404);
  });
});

describe('handleOnboard authorization', () => {
  it('returns 403 for a non-admin caller', async () => {
    const res = await handleOnboard(
      postRequest(GOOD_BODY),
      deps(new FakeDb().seedBasics(), COORDINATOR),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('forbidden');
  });

  it('allows the service caller', async () => {
    const db = new FakeDb().seedBasics();
    const res = await handleOnboard(postRequest(GOOD_BODY), deps(db, { kind: 'service' }));
    expect(res.status).toBe(201);
  });
});

describe('handleOnboard device failures', () => {
  it('maps an unreachable device to 502 device_unreachable', async () => {
    const db = new FakeDb().seedBasics();
    const d = deps(db);
    d.providerFactory = () => ({
      getDeviceInfo: async () => {
        throw new Error('fetch failed');
      },
      listChannels: async () => [],
    });
    const res = await handleOnboard(postRequest(GOOD_BODY), d);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('device_unreachable');
    // nothing persisted on failure
    expect(db.devices.size).toBe(0);
    expect(db.vaultSecrets.size).toBe(0);
  });

  it('maps channel enumeration failure to 502', async () => {
    const db = new FakeDb().seedBasics();
    const d = deps(db);
    d.providerFactory = () => ({
      getDeviceInfo: async () => DEVICE_INFO,
      listChannels: async () => {
        throw new Error('http 500');
      },
    });
    const res = await handleOnboard(postRequest(GOOD_BODY), d);
    expect(res.status).toBe(502);
  });

  it('returns 422 when the device reports no enabled channels', async () => {
    const db = new FakeDb().seedBasics();
    const d = deps(db);
    d.providerFactory = () => ({
      getDeviceInfo: async () => DEVICE_INFO,
      listChannels: async () => [{ id: '101', name: 'Off', enabled: false }],
    });
    const res = await handleOnboard(postRequest(GOOD_BODY), d);
    expect(res.status).toBe(422);
  });
});

describe('handleOnboard happy path', () => {
  it('stores the Vault ref, device row and one camera per enabled channel', async () => {
    const db = new FakeDb().seedBasics();
    const res = await handleOnboard(postRequest(GOOD_BODY), deps(db));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      device: { id: string; host: string; username: string; credentials_ref?: string };
      cameras: Array<{ id: string; name: string; external_id: string; configuration: unknown }>;
    };

    // response carries no secret material
    expect(body.device.host).toBe('192.168.10.20');
    expect(body.device.username).toBe('splintermind');
    expect(body.device.credentials_ref).toBeUndefined();

    // password went to Vault; the device row keeps only the ref
    expect(db.vaultSecrets.size).toBe(1);
    const [secretId, stored] = [...db.vaultSecrets.entries()][0]!;
    expect(stored.secret).toBe('s3cret-isapi');
    const device = db.devices.get(body.device.id)!;
    expect(device.credentials_ref).toBe(secretId);
    expect((device as unknown as Record<string, unknown>)['password']).toBeUndefined();

    // disabled channel filtered out; external_id encodes device+channel
    expect(body.cameras).toHaveLength(2);
    const extIds = body.cameras.map((c) => c.external_id).sort();
    expect(extIds).toEqual([`${device.id}:101`, `${device.id}:102`].sort());
    const names = body.cameras.map((c) => c.name).sort();
    expect(names).toEqual(['Cashier Area', 'Entrance']);

    // audit trail written
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]!.action).toBe('camera_config_changed');
    expect(db.audit[0]!.entity_id).toBe(device.id);
  });

  it('returns 409 when the same branch+host is already registered', async () => {
    const db = new FakeDb().seedBasics();
    const first = await handleOnboard(postRequest(GOOD_BODY), deps(db));
    expect(first.status).toBe(201);
    const second = await handleOnboard(postRequest(GOOD_BODY), deps(db));
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe('device_already_registered');
  });
});
