import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../constants/theme';
import { useAlerts } from '../../services/alerts';
import { useBranches } from '../../services/branches';
import { shouldUseDemo } from '../../lib/demo';
import { getSupabase } from '../../lib/supabase';
import { AlertCard, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import type { Alert, AlertStatus } from '../../types';

type Filter = 'all' | AlertStatus;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'ignored', label: 'Ignored' },
];

export default function AlertsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: alerts,
    isLoading,
    isError,
    refetch,
  } = useAlerts(filter === 'all' ? undefined : { status: filter });
  const branchesQuery = useBranches();

  const branchNames = useMemo(() => {
    const map = new Map<string, string>();
    branchesQuery.data?.forEach((branch) => map.set(branch.id, branch.name));
    return map;
  }, [branchesQuery.data]);

  // Live updates: subscribe to new alerts in live mode; demo mode is driven locally.
  useEffect(() => {
    if (shouldUseDemo()) {
      return;
    }
    let dispose: (() => void) | undefined;
    try {
      const supabase = getSupabase();
      const channel = supabase
        .channel('alerts-rt')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'alerts' },
          () => {
            void queryClient.invalidateQueries({ queryKey: ['alerts'] });
          },
        )
        .subscribe();
      dispose = () => {
        void channel.unsubscribe();
      };
    } catch {
      // Realtime unavailable; pull-to-refresh remains the fallback.
    }
    return () => {
      dispose?.();
    };
  }, [queryClient]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: 22, fontWeight: '800', color: colors.text },
    chipsRow: { paddingHorizontal: 16, paddingBottom: 12 },
    chip: {
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 7,
      marginRight: 8,
    },
    chipText: { fontSize: 13, fontWeight: '600' },
    list: { flex: 1 },
    listContent: { paddingHorizontal: 16, paddingBottom: 32 },
    cardGap: { marginBottom: 8 },
  });

  const renderItem = ({ item }: { item: Alert }) => (
    <View style={styles.cardGap}>
      <AlertCard
        alert={item}
        branchName={branchNames.get(item.branch_id)}
        onPress={() => router.push(`/alerts/${item.id}`)}
      />
    </View>
  );

  const emptyState = (
    <EmptyState
      title={filter === 'all' ? 'No alerts' : `No ${filter} alerts`}
      message={
        filter === 'all'
          ? 'There are no alerts in the system.'
          : `There are no ${filter} alerts right now.`
      }
    />
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {FILTERS.map((entry) => {
          const active = entry.key === filter;
          return (
            <TouchableOpacity
              key={entry.key}
              onPress={() => setFilter(entry.key)}
              style={[
                styles.chip,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : colors.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? colors.onPrimary : colors.textSecondary },
                ]}
              >
                {entry.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <LoadingState message="Loading alerts…" />
      ) : isError ? (
        <ErrorState
          message="Could not load alerts."
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          style={styles.list}
          data={alerts ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={emptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
