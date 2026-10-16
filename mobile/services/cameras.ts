import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Camera } from '../types';
import { getDemoCamera, getDemoCameras, shouldUseDemo } from '../lib/demo';
import { getSupabase } from '../lib/supabase';

export function useCameras(branchId?: string): UseQueryResult<Camera[], Error> {
  return useQuery({
    queryKey: ['cameras', branchId ?? 'all'],
    queryFn: async () => {
      if (shouldUseDemo()) return getDemoCameras(branchId);
      const supabase = getSupabase();
      let q = supabase.from('cameras').select('*').order('name');
      if (branchId) q = q.eq('branch_id', branchId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as Camera[];
    },
  });
}

export function useCamera(id: string | undefined): UseQueryResult<Camera | null, Error> {
  return useQuery({
    queryKey: ['camera', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      if (shouldUseDemo()) return getDemoCamera(id);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('cameras')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return (data ?? null) as Camera | null;
    },
  });
}
