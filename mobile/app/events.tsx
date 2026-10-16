import React, { useMemo, useState } from 'react';
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
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '../constants/theme';
import { useEvents } from '../services/events';
import { useBranches } from '../services/branches';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SeverityBadge,
} from '../components/ui';
import { humanize, timeAgo } from '../lib/utils';
import type { EventItem, Severity } from '../types';

type SeverityFilter = 'all' | Severity;

const FILTERS: Array<{ key: SeverityFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'info', label: 'Info' },
];

export default function EventsScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const eventsQuery = useEvents({ limit: 50 });
  const branchesQuery = useBranches();

  const branchNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branchesQuery.data ?? []) {
      map.set(branch.id, branch.name);
    }
    return map;
  }, [branchesQuery.data]);

  const filtered = useMemo(
    () =>
      (eventsQuery.data ?? []).filter(
        (event) => filter === 'all' || event.severity === filter
      ),
    [eventsQuery.data, filter]
  );

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await eventsQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
    chipsRow: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    chip: {
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 7,
      marginRight: 8,
    },
    chipText: { fontSize: 13, fontWeight: '600' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.sm,
      marginBottom: spacing.sm,
    },
    rowText: { flex: 1, marginLeft: spacing.sm },
    rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    rowTime: { fontSize: 12, color: colors.textMuted },
  });

  const renderItem = ({ item }: { item: EventItem }): React.JSX.Element => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.row}
      onPress={() => {
        if (item.camera_id) {
          router.push(`/cameras/${item.camera_id}`);
        } else {
          router.push(`/branches/${item.branch_id}`);
        }
      }}
    >
      <SeverityBadge severity={item.severity} size="sm" />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {humanize(item.event_type)}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {branchNames.get(item.branch_id) ?? 'Unknown branch'}
        </Text>
      </View>
      <Text style={styles.rowTime}>{timeAgo(item.timestamp)}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ title: 'Events' }} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {FILTERS.map((option) => {
          const active = filter === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              activeOpacity={0.7}
              onPress={() => setFilter(option.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? colors.onPrimary : colors.textSecondary },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {eventsQuery.isLoading ? (
        <LoadingState message="Loading events…" />
      ) : eventsQuery.isError || !eventsQuery.data ? (
        <ErrorState
          message="Couldn't load events."
          onRetry={() => {
            void eventsQuery.refetch();
          }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No events"
          message={
            filter === 'all'
              ? 'No events recorded yet.'
              : `No ${filter} events recorded yet.`
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(event) => event.id}
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
