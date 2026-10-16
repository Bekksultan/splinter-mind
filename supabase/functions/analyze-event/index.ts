// Deno entrypoint: POST /analyze-event
import { handleAnalyzeEvent } from './handler.ts';
import { SupabaseDbPort, createServiceClient, optionalEnv } from '../_shared/db-supabase.ts';
import { getVisionAnalyzer } from '../_shared/vision.ts';

Deno.serve(async (req) => {
  const db = new SupabaseDbPort(createServiceClient());
  return handleAnalyzeEvent(req, {
    db,
    vision: getVisionAnalyzer({
      provider: optionalEnv('VISION_PROVIDER') ?? 'mock',
      apiUrl: optionalEnv('VISION_API_URL'),
      apiKey: optionalEnv('VISION_API_KEY'),
      model: optionalEnv('VISION_MODEL'),
    }),
    snapshotEnv: {
      hikvisionHost: optionalEnv('HIKVISION_HOST'),
      hikvisionPort: optionalEnv('HIKVISION_PORT') ? parseInt(optionalEnv('HIKVISION_PORT')!, 10) : undefined,
      hikvisionUseHttps: optionalEnv('HIKVISION_HTTPS') === 'true',
      hikvisionUser: optionalEnv('HIKVISION_USER'),
      hikvisionPass: optionalEnv('HIKVISION_PASS'),
    },
  });
});
