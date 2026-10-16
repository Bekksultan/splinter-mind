import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { EventItem } from '../types';
import { getDemoEvent, getDemoEvents, shouldUseDemo } from '../lib/demo';
import { getSupabase } from '../lib/supabase';

export interface EventFilters {
  branchId?: string;
  cameraId?: string;
  limit?: number;
}

export function useEvents(
  opts: EventFilters = {}
): UseQueryResult<EventItem[], Error> {
  return useQuery({
    queryKey: ['events', opts],
    queryFn: async () => {
      if (shouldUseDemo()) return getDemoEvents(opts);
      const supabase = getSupabase();
      let q = supabase
        .from('events')
        .select('*')
        .order('timestamp', { ascending: false });
      if (opts.branchId) q = q.eq('branch_id', opts.branchId);
      if (opts.cameraId) q = q.eq('camera_id', opts.cameraId);
      if (opts.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as EventItem[];
    },
  });
}

export function useEvent(
  id: string | undefined
): UseQueryResult<EventItem | null, Error> {
  return useQuery({
    queryKey: ['event', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      if (shouldUseDemo()) return getDemoEvent(id);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return (data ?? null) as EventItem | null;
    },
  });
}
