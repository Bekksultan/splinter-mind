import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Alert,
  AlertNoteWithAuthor,
  AlertStatus,
  Severity,
  User,
} from '../types';
import {
  demoAddNote,
  demoAlertAction,
  demoAssignAlert,
  getDemoAlert,
  getDemoAlertNotes,
  getDemoAlerts,
  getDemoUsers,
  shouldUseDemo,
} from '../lib/demo';
import { getSupabase } from '../lib/supabase';
import { severityRank } from '../lib/utils';
import { useAuthStore } from '../stores/auth';
import { useSyncStore } from '../stores/sync';

export interface AlertFilters {
  status?: AlertStatus;
  branchId?: string;
  severity?: Severity;
}

const statusRank: Record<AlertStatus, number> = {
  open: 0,
  acknowledged: 1,
  resolved: 2,
  ignored: 3,
};

/** Open first, then by severity rank, then newest. Data access only. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      severityRank[a.severity] - severityRank[b.severity] ||
      b.created_at.localeCompare(a.created_at)
  );
}

function matchesFilters(a: Alert, f: AlertFilters): boolean {
  return (
    (!f.status || a.status === f.status) &&
    (!f.branchId || a.branch_id === f.branchId) &&
    (!f.severity || a.severity === f.severity)
  );
}

export function useAlerts(
  opts: AlertFilters = {}
): UseQueryResult<Alert[], Error> {
  const touch = useSyncStore((s) => s.touch);
  return useQuery({
    queryKey: ['alerts', opts],
    queryFn: async () => {
      let alerts: Alert[];
      if (shouldUseDemo()) {
        alerts = (await getDemoAlerts()).filter((a) => matchesFilters(a, opts));
      } else {
        const supabase = getSupabase();
        let q = supabase
          .from('alerts')
          .select('*')
          .order('created_at', { ascending: false });
        if (opts.status) q = q.eq('status', opts.status);
        if (opts.branchId) q = q.eq('branch_id', opts.branchId);
        if (opts.severity) q = q.eq('severity', opts.severity);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        alerts = (data ?? []) as Alert[];
      }
      touch();
      return sortAlerts(alerts);
    },
  });
}

export function useAlert(id: string | undefined): UseQueryResult<Alert | null, Error> {
  return useQuery({
    queryKey: ['alert', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      if (shouldUseDemo()) return getDemoAlert(id);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return (data ?? null) as Alert | null;
    },
  });
}

export function useAlertNotes(
  alertId: string | undefined
): UseQueryResult<AlertNoteWithAuthor[], Error> {
  return useQuery({
    queryKey: ['alert-notes', alertId],
    enabled: !!alertId,
    queryFn: async () => {
      if (!alertId) return [];
      if (shouldUseDemo()) return getDemoAlertNotes(alertId);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('alert_notes')
        .select('*')
        .eq('alert_id', alertId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const notes = (data ?? []) as Array<{
        id: string;
        organization_id: string;
        alert_id: string;
        user_id: string;
        note: string;
        created_at: string;
      }>;
      // alert_notes has no user_name column — join display names client-side.
      const userIds = [...new Set(notes.map((n) => n.user_id))];
      let names: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id,name')
          .in('id', userIds);
        if (usersError) throw new Error(usersError.message);
        names = Object.fromEntries(
          ((users ?? []) as Array<{ id: string; name: string }>).map((u) => [
            u.id,
            u.name,
          ])
        );
      }
      return notes.map((n) => ({
        ...n,
        user_name: names[n.user_id] ?? null,
      }));
    },
  });
}

export type AlertAction = 'acknowledge' | 'resolve' | 'ignore';

export function useAlertAction(): UseMutationResult<
  Alert,
  Error,
  { id: string; action: AlertAction; note?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, note }) => {
      if (shouldUseDemo()) return demoAlertAction(id, action, note);
      const supabase = getSupabase();
      const nowIso = new Date().toISOString();
      const patch: Partial<Alert> =
        action === 'acknowledge'
          ? { status: 'acknowledged', acknowledged_at: nowIso }
          : action === 'resolve'
            ? { status: 'resolved', resolved_at: nowIso }
            : { status: 'ignored' };
      const { data, error } = await supabase
        .from('alerts')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      const alert = data as Alert;
      // Audit trail is written server-side by the log_alert_change() trigger —
      // never insert audit_logs directly (RLS denies it).
      const profile = useAuthStore.getState().profile;
      if (note && note.trim().length > 0 && profile) {
        const { error: noteError } = await supabase.from('alert_notes').insert({
          organization_id: alert.organization_id,
          alert_id: id,
          user_id: profile.id,
          note: note.trim(),
        });
        if (noteError) throw new Error(noteError.message);
      }
      return alert;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert', vars.id] });
      queryClient.invalidateQueries({ queryKey: ['alert-notes', vars.id] });
    },
  });
}

export function useAssignAlert(): UseMutationResult<
  Alert,
  Error,
  { id: string; userId: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }) => {
      if (shouldUseDemo()) return demoAssignAlert(id, userId);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('alerts')
        .update({ assigned_to: userId })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      const alert = data as Alert;
      // Audit trail for the assignment is written by the log_alert_change() trigger.
      return alert;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert', vars.id] });
    },
  });
}

export function useAddAlertNote(): UseMutationResult<
  AlertNoteWithAuthor,
  Error,
  { alertId: string; note: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ alertId, note }) => {
      if (shouldUseDemo()) return demoAddNote(alertId, note);
      const supabase = getSupabase();
      const profile = useAuthStore.getState().profile;
      if (!profile) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('alert_notes')
        .insert({
          organization_id: profile.organization_id,
          alert_id: alertId,
          user_id: profile.id,
          note,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      const inserted = data as {
        id: string;
        organization_id: string;
        alert_id: string;
        user_id: string;
        note: string;
        created_at: string;
      };
      return { ...inserted, user_name: profile.name };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['alert-notes', vars.alertId] });
    },
  });
}

/** Users eligible for alert assignment. */
export function useUsers(): UseQueryResult<User[], Error> {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      if (shouldUseDemo()) return getDemoUsers();
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('status', 'active')
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as User[];
    },
  });
}
