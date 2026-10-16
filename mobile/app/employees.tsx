import React, { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '../constants/theme';
import { useBranches } from '../services/branches';
import { useEmployees, useShifts } from '../services/business';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/ui';
import { humanize } from '../lib/utils';
import type { Employee } from '../types';

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function EmployeesScreen(): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const employeesQuery = useEmployees();
  const shiftsQuery = useShifts();
  const branchesQuery = useBranches();

  const branchNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branchesQuery.data ?? []) {
      map.set(branch.id, branch.name);
    }
    return map;
  }, [branchesQuery.data]);

  const activeShiftByEmployee = useMemo(() => {
    const map = new Map<string, string>();
    for (const shift of shiftsQuery.data ?? []) {
      if (shift.status === 'active') {
        map.set(
          shift.employee_id,
          `${formatTime(shift.start_time)} – ${formatTime(shift.end_time)}`
        );
      }
    }
    return map;
  }, [shiftsQuery.data]);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await Promise.all([
        employeesQuery.refetch(),
        shiftsQuery.refetch(),
        branchesQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    listContent: { padding: spacing.md, paddingBottom: spacing.xl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    rowMain: { flex: 1 },
    name: { fontSize: 15, fontWeight: '700', color: colors.text },
    meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    shift: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    right: { alignItems: 'flex-end' },
  });

  const renderItem = ({ item }: { item: Employee }): React.JSX.Element => {
    const shiftTime = activeShiftByEmployee.get(item.id);
    return (
      <View style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {humanize(item.role)}
            {item.branch_id ? ` · ${branchNames.get(item.branch_id) ?? '—'}` : ''}
          </Text>
          {shiftTime ? <Text style={styles.shift}>On shift {shiftTime}</Text> : null}
        </View>
        <View style={styles.right}>
          <StatusBadge status={item.status} />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ title: 'Employees' }} />
      {employeesQuery.isLoading ? (
        <LoadingState message="Loading employees…" />
      ) : employeesQuery.isError || !employeesQuery.data ? (
        <ErrorState
          message="Couldn't load employees."
          onRetry={() => {
            void employeesQuery.refetch();
          }}
        />
      ) : employeesQuery.data.length === 0 ? (
        <EmptyState
          title="No employees"
          message="No employees are registered for your organization yet."
        />
      ) : (
        <FlatList
          data={employeesQuery.data}
          keyExtractor={(employee) => employee.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void onRefresh();
              }}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
