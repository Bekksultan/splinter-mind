// Deno entrypoint: POST /hikvision-webhook
import { handleHikvisionWebhook } from './handler.ts';
import { SupabaseDbPort, createServiceClient, mustEnv } from '../_shared/db-supabase.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req) => {
  const db = new SupabaseDbPort(createServiceClient());
  return handleHikvisionWebhook(req, {
    db,
    webhookSecret: mustEnv('HIKVISION_WEBHOOK_SECRET'),
    onEventStored: async (eventId) => {
      const url = `${mustEnv('SUPABASE_URL')}/functions/v1/process-event`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mustEnv('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ event_id: eventId }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        log('error', 'process-event invoke returned non-2xx', { event_id: eventId, status: res.status });
      }
    },
  });
});
