// Deno entrypoint: POST /process-event
import { handleProcessEvent } from './handler.ts';
import { SupabaseDbPort, createServiceClient, optionalEnv } from '../_shared/db-supabase.ts';
import { getVisionAnalyzer } from '../_shared/vision.ts';
import { ExpoPushProvider } from '../_shared/notifications.ts';

Deno.serve(async (req) => {
  const db = new SupabaseDbPort(createServiceClient());
  return handleProcessEvent(req, {
    db,
    vision: getVisionAnalyzer({
      provider: optionalEnv('VISION_PROVIDER') ?? 'mock',
      apiUrl: optionalEnv('VISION_API_URL'),
      apiKey: optionalEnv('VISION_API_KEY'),
      model: optionalEnv('VISION_MODEL'),
    }),
    notifier: new ExpoPushProvider(),
    snapshotEnv: {
      hikvisionHost: optionalEnv('HIKVISION_HOST'),
      hikvisionPort: optionalEnv('HIKVISION_PORT') ? parseInt(optionalEnv('HIKVISION_PORT')!, 10) : undefined,
      hikvisionUseHttps: optionalEnv('HIKVISION_HTTPS') === 'true',
      hikvisionUser: optionalEnv('HIKVISION_USER'),
      hikvisionPass: optionalEnv('HIKVISION_PASS'),
    },
  });
});
