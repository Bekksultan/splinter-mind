// Deno entrypoint: POST /send-notification
import { handleSendNotification } from './handler.ts';
import { SupabaseDbPort, createServiceClient } from '../_shared/db-supabase.ts';
import { ExpoPushProvider } from '../_shared/notifications.ts';

Deno.serve(async (req) => {
  const db = new SupabaseDbPort(createServiceClient());
  return handleSendNotification(req, { db, notifier: new ExpoPushProvider() });
});
