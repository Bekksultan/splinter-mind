// Deno entrypoint: POST /hikvision-onboard
//
// Auth: service-role bearer, or an owner/admin user JWT. The user-JWT path
// validates the token via the Auth API and loads the role from public.users.
import { handleOnboard, type OnboardCaller } from './handler.ts';
import { SupabaseDbPort, createServiceClient, mustEnv } from '../_shared/db-supabase.ts';
import { json } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const url = mustEnv('SUPABASE_URL');
  const serviceKey = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
  const db = new SupabaseDbPort(createServiceClient());
  const auth = req.headers.get('authorization') ?? '';

  let caller: OnboardCaller;
  if (auth.startsWith('Bearer ') && timingSafeEqual(auth.slice(7), serviceKey)) {
    caller = { kind: 'service' };
  } else if (auth.startsWith('Bearer ')) {
    const anonKey = mustEnv('SUPABASE_ANON_KEY');
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      log('warn', 'onboard: invalid user token');
      return json(401, { error: 'unauthorized' });
    }
    const orgUser = await db.getUser(user.id);
    if (!orgUser || (orgUser.role !== 'owner' && orgUser.role !== 'admin')) {
      log('warn', 'onboard: forbidden role', { user_id: user.id });
      return json(403, { error: 'forbidden', reason: 'owner or admin role required' });
    }
    caller = { kind: 'user', userId: user.id, role: orgUser.role };
  } else {
    return json(401, { error: 'unauthorized' });
  }

  return handleOnboard(req, { db, caller });
});
