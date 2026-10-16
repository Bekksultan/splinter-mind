// Deno entrypoint: POST /create-alert
import { handleCreateAlert } from './handler.ts';
import { SupabaseDbPort, createServiceClient } from '../_shared/db-supabase.ts';

Deno.serve(async (req) => {
  const db = new SupabaseDbPort(createServiceClient());
  return handleCreateAlert(req, { db });
});
