import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Device } from '../types';
import { shouldUseDemo } from '../lib/demo';
import { getSupabase } from '../lib/supabase';

/**
 * Registered ISAPI devices (NVRs). RLS tenant_all scopes rows to the caller's
 * organization; the password never leaves the server (Vault only).
 * Demo mode has no devices — returns an empty list.
 */
export function useDevices(): UseQueryResult<Device[], Error> {
  return useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      if (shouldUseDemo()) return [];
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('devices')
        .select(
          'id, organization_id, branch_id, name, provider, host, port, use_https, username, status, last_seen_at, created_at, updated_at'
        )
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as Device[];
    },
  });
}
