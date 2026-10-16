/**
 * Snapshot capture: fetch a still via the camera provider, store it in the
 * private `snapshots` Storage bucket, and return a short-lived signed URL.
 * Credentials never leave the server (SnapshotEnv is built from env/Vault
 * in each function's index.ts).
 */
import {
  HikvisionProvider,
  MockHikvisionProvider,
  type CameraProvider,
  type CameraRef,
  type ProviderCredentials,
} from '../../../packages/core/src/index.ts';
import type { Camera } from '../../../packages/core/src/index.ts';
import type { DbPort } from './db-port.ts';
import { log } from './log.ts';

export interface SnapshotEnv {
  hikvisionHost?: string;
  hikvisionPort?: number;
  hikvisionUseHttps?: boolean;
  hikvisionUser?: string;
  hikvisionPass?: string;
}

export function cameraToRef(camera: Camera): CameraRef {
  return {
    id: camera.id,
    external_id: camera.external_id,
    provider: camera.provider,
    configuration: camera.configuration,
    branch_id: camera.branch_id,
  };
}

export function getCameraProvider(
  camera: Camera,
  env: SnapshotEnv,
): { provider: CameraProvider; credentials: ProviderCredentials } {
  if (camera.provider === 'mock') {
    return {
      provider: new MockHikvisionProvider(),
      credentials: { host: 'mock', username: '', password: '' },
    };
  }
  if (!env.hikvisionHost || !env.hikvisionUser || !env.hikvisionPass) {
    throw new Error(
      'Hikvision credentials not configured (need HIKVISION_HOST, HIKVISION_USER, HIKVISION_PASS)',
    );
  }
  const credentials: ProviderCredentials = {
    host: env.hikvisionHost,
    port: env.hikvisionPort,
    useHttps: env.hikvisionUseHttps,
    username: env.hikvisionUser,
    password: env.hikvisionPass,
  };
  return { provider: new HikvisionProvider(credentials), credentials };
}

export async function captureSnapshot(
  db: DbPort,
  camera: Camera,
  env: SnapshotEnv,
): Promise<string> {
  const { provider } = getCameraProvider(camera, env);
  const { imageBytes, contentType } = await provider.getSnapshot(cameraToRef(camera));
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${camera.branch_id}/${camera.id}/${Date.now()}.${ext}`;
  await db.uploadSnapshot(path, imageBytes, contentType);
  const url = await db.createSignedUrl(path, 3600);
  await db.updateCameraLastSeen(camera.id, new Date().toISOString());
  log('info', 'snapshot captured', { camera_id: camera.id, path });
  return url;
}
