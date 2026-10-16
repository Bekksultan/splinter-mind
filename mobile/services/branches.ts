import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Alert, Branch, Severity, TimelineItem } from '../types';
import {
  branchTimeline,
  getDemoBranch,
  getDemoBranches,
  shouldUseDemo,
} from '../lib/demo';
import { getSupabase } from '../lib/supabase';
import { humanize } from '../lib/utils';
import { useAlerts } from './alerts';

export function useBranches(): UseQueryResult<Branch[], Error> {
  return useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      if (shouldUseDemo()) return getDemoBranches();
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as Branch[];
    },
  });
}

export function useBranch(id: string | undefined): UseQueryResult<Branch | null, Error> {
  return useQuery({
    queryKey: ['branch', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      if (shouldUseDemo()) return getDemoBranch(id);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return (data ?? null) as Branch | null;
    },
  });
}

export function useBranchTimeline(
  branchId: string | undefined
): UseQueryResult<TimelineItem[], Error> {
  return useQuery({
    queryKey: ['branch-timeline', branchId],
    enabled: !!branchId,
    queryFn: async () => {
      if (!branchId) return [];
      if (shouldUseDemo()) return branchTimeline(branchId);
      const supabase = getSupabase();
      const [eventsRes, alertsRes] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .eq('branch_id', branchId)
          .order('timestamp', { ascending: false })
          .limit(50),
        supabase
          .from('alerts')
          .select('*')
          .eq('branch_id', branchId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (eventsRes.error) throw new Error(eventsRes.error.message);
      if (alertsRes.error) throw new Error(alertsRes.error.message);
      const items: TimelineItem[] = [];
      for (const e of eventsRes.data ?? []) {
        items.push({
          id: e.id,
          time: e.timestamp,
          title: humanize(e.event_type),
          kind: 'event',
          severity: e.severity,
        });
      }
      for (const a of alertsRes.data ?? []) {
        items.push({
          id: a.id,
          time: a.created_at,
          title: a.title,
          description: a.description,
          kind: 'alert',
          severity: a.severity,
        });
      }
      items.sort((x, y) => y.time.localeCompare(x.time));
      return items;
    },
  });
}

export interface DashboardSummary {
  branchCount: number;
  openBySeverity: Record<Severity, number>;
  criticalAlerts: Alert[];
  warningAlerts: Alert[];
  isLoading: boolean;
  error: Error | null;
}

export function useDashboardSummary(): DashboardSummary {
  const alertsQ = useAlerts();
  const branchesQ = useBranches();
  return useMemo(() => {
    const alerts = alertsQ.data ?? [];
    const openBySeverity: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const a of alerts) {
      if (a.status === 'open') openBySeverity[a.severity] += 1;
    }
    const criticalAlerts = alerts.filter(
      (a) => a.status === 'open' && a.severity === 'critical'
    );
    const warningAlerts = alerts.filter(
      (a) => a.status === 'open' && a.severity === 'high'
    );
    return {
      branchCount: branchesQ.data?.length ?? 0,
      openBySeverity,
      criticalAlerts,
      warningAlerts,
      isLoading: alertsQ.isLoading || branchesQ.isLoading,
      error: alertsQ.error ?? branchesQ.error,
    };
  }, [
    alertsQ.data,
    alertsQ.isLoading,
    alertsQ.error,
    branchesQ.data,
    branchesQ.isLoading,
    branchesQ.error,
  ]);
}
