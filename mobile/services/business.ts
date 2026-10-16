import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  AuditLog,
  CashBalance,
  Employee,
  ExchangeRate,
  NotificationPrefs,
  Shift,
} from '../types';
import {
  demoUpdateNotificationPrefs,
  getDemoAuditLogs,
  getDemoCash,
  getDemoEmployees,
  getDemoNotificationPrefs,
  getDemoRates,
  getDemoShifts,
  shouldUseDemo,
} from '../lib/demo';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';

export function useExchangeRates(
  branchId?: string
): UseQueryResult<ExchangeRate[], Error> {
  return useQuery({
    queryKey: ['exchange-rates', branchId ?? 'all'],
    queryFn: async () => {
      if (shouldUseDemo()) return getDemoRates(branchId);
      const supabase = getSupabase();
      let q = supabase
        .from('exchange_rates')
        .select('*')
        .order('created_at', { ascending: false });
      if (branchId) q = q.eq('branch_id', branchId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      // latest-wins per (branch, currency)
      const seen = new Set<string>();
      const latest: ExchangeRate[] = [];
      for (const row of (data ?? []) as ExchangeRate[]) {
        const key = `${row.branch_id}:${row.currency}`;
        if (!seen.has(key)) {
          seen.add(key);
          latest.push(row);
        }
      }
      return latest.sort((a, b) => a.currency.localeCompare(b.currency));
    },
  });
}

export function useCashBalances(
  branchId?: string
): UseQueryResult<CashBalance[], Error> {
  return useQuery({
    queryKey: ['cash-balances', branchId ?? 'all'],
    queryFn: async () => {
      if (shouldUseDemo()) return getDemoCash(branchId);
      const supabase = getSupabase();
      let q = supabase
        .from('cash_balances')
        .select('*')
        .order('currency');
      if (branchId) q = q.eq('branch_id', branchId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as CashBalance[];
    },
  });
}

export function useEmployees(): UseQueryResult<Employee[], Error> {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      if (shouldUseDemo()) return getDemoEmployees();
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as Employee[];
    },
  });
}

export function useShifts(branchId?: string): UseQueryResult<Shift[], Error> {
  return useQuery({
    queryKey: ['shifts', branchId ?? 'all'],
    queryFn: async () => {
      if (shouldUseDemo()) return getDemoShifts(branchId);
      const supabase = getSupabase();
      let q = supabase
        .from('shifts')
        .select('*')
        .order('start_time', { ascending: false });
      if (branchId) q = q.eq('branch_id', branchId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as Shift[];
    },
  });
}

export function useNotificationPrefs(): UseQueryResult<NotificationPrefs | null, Error> {
  const userId = useAuthStore((s) => s.currentUserId());
  return useQuery({
    queryKey: ['notification-prefs', userId],
    queryFn: async () => {
      if (shouldUseDemo()) return getDemoNotificationPrefs();
      if (!userId) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('notification_prefs')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as NotificationPrefs | null;
    },
  });
}

export function useUpdateNotificationPrefs(): UseMutationResult<
  NotificationPrefs,
  Error,
  Partial<Omit<NotificationPrefs, 'user_id'>>
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch) => {
      if (shouldUseDemo()) return demoUpdateNotificationPrefs(patch);
      const supabase = getSupabase();
      const userId = useAuthStore.getState().currentUserId();
      if (!userId) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('notification_prefs')
        .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as NotificationPrefs;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
}

export function useAuditLogs(
  limit: number = 50
): UseQueryResult<AuditLog[], Error> {
  return useQuery({
    queryKey: ['audit-logs', limit],
    queryFn: async () => {
      if (shouldUseDemo()) return (await getDemoAuditLogs()).slice(0, limit);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditLog[];
    },
  });
}
