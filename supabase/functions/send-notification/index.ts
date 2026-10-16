// Deno entrypoint: POST /send-notification
import { handleSendNotification } from './handler.ts';
import { SupabaseDbPort, createServiceClient } from '../_shared/db-supabase.ts';
import { ExpoPushProvider, createWhatsAppProvider } from '../_shared/notifications.ts';

Deno.serve(async (req) => {
  const db = new SupabaseDbPort(createServiceClient());
  // Optional channel: null when WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID are
  // unset — the push batch proceeds normally (see createWhatsAppProvider).
  const whatsapp = createWhatsAppProvider({
    token: Deno.env.get('WHATSAPP_TOKEN'),
    phoneNumberId: Deno.env.get('WHATSAPP_PHONE_NUMBER_ID'),
    templateName: Deno.env.get('WHATSAPP_TEMPLATE_NAME'),
  });
  return handleSendNotification(req, { db, notifier: new ExpoPushProvider(), whatsapp });
});
