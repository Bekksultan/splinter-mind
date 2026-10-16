// Deno entrypoint: GET /snapshot?camera_id=<uuid>
import { handleSnapshot } from './handler.ts';
import { SupabaseDbPort, createServiceClient, optionalEnv } from '../_shared/db-supabase.ts';

Deno.serve(async (req) => {
  const db = new SupabaseDbPort(createServiceClient());
  return handleSnapshot(req, {
    db,
    snapshotEnv: {
      hikvisionHost: optionalEnv('HIKVISION_HOST'),
      hikvisionPort: optionalEnv('HIKVISION_PORT') ? parseInt(optionalEnv('HIKVISION_PORT')!, 10) : undefined,
      hikvisionUseHttps: optionalEnv('HIKVISION_HTTPS') === 'true',
      hikvisionUser: optionalEnv('HIKVISION_USER'),
      hikvisionPass: optionalEnv('HIKVISION_PASS'),
    },
  });
});
