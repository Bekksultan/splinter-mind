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
import { Stack } from 'expo-router';
import { useTheme } from '../constants/theme';
import { useBranches } from '../services/branches';
import { useExchangeRates } from '../services/business';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import { timeAgo } from '../lib/utils';
import type { Branch, ExchangeRate } from '../types';

function formatRate(value: number): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function BranchChips({
  branches,
  selected,
  onSelect,
}: {
  branches: Branch[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const options: Array<{ id: string | null; name: string }> = [
    { id: null, name: 'All' },
    ...branches.map((b) => ({ id: b.id as string | null, name: b.name })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 8 }}
    >
      {options.map((option) => {
        const active = option.id === selected;
        return (
          <TouchableOpacity
            key={option.id ?? 'all'}
            activeOpacity={0.7}
            onPress={() => onSelect(option.id)}
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
              {option.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function RateRow({
  rate,
  branchName,
}: {
  rate: ExchangeRate;
  branchName?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const prev = rate.previous_sell_rate;
  const flagged =
    typeof prev === 'number' &&
    prev !== 0 &&
    Math.abs(rate.sell_rate - prev) / Math.abs(prev) > 0.02;

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: flagged ? colors.severityBg.high : colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.currency, { color: colors.text }]}>
          {rate.currency}
        </Text>
        {branchName ? (
          <Text style={[styles.branch, { color: colors.textMuted }]}>
            {branchName}
          </Text>
        ) : null}
      </View>
      <View style={styles.rates}>
        <Text style={[styles.rateText, { color: colors.textSecondary }]}>
          BUY {formatRate(rate.buy_rate)}
        </Text>
        <Text style={[styles.rateText, { color: colors.textSecondary }]}>
          SELL {formatRate(rate.sell_rate)}
        </Text>
      </View>
      <Text style={[styles.updated, { color: colors.textMuted }]}>
        {timeAgo(rate.created_at)}
      </Text>
    </View>
  );
}

export default function ExchangeRatesScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const branchesQuery = useBranches();
  const ratesQuery = useExchangeRates(branchId ?? undefined);

  const branchNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branchesQuery.data ?? []) {
      map.set(branch.id, branch.name);
    }
    return map;
  }, [branchesQuery.data]);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await Promise.all([branchesQuery.refetch(), ratesQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    chipsWrap: { paddingVertical: spacing.sm },
    listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
    cardGap: { marginBottom: spacing.sm },
  });

  const renderItem = ({ item }: { item: ExchangeRate }): React.JSX.Element => (
    <View style={styles.cardGap}>
      <RateRow
        rate={item}
        branchName={branchId ? undefined : branchNames.get(item.branch_id)}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ title: 'Exchange rates' }} />
      <View style={styles.chipsWrap}>
        <BranchChips
          branches={branchesQuery.data ?? []}
          selected={branchId}
          onSelect={setBranchId}
        />
      </View>
      {ratesQuery.isLoading ? (
        <LoadingState message="Loading exchange rates…" />
      ) : ratesQuery.isError || !ratesQuery.data ? (
        <ErrorState
          message="Couldn't load exchange rates."
          onRetry={() => {
            void ratesQuery.refetch();
          }}
        />
      ) : ratesQuery.data.length === 0 ? (
        <EmptyState
          title="No rates"
          message="No exchange rates published for this selection."
        />
      ) : (
        <FlatList
          data={ratesQuery.data}
          keyExtractor={(rate) => rate.id}
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

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  rowMain: { width: 64 },
  currency: { fontSize: 15, fontWeight: '700' },
  branch: { fontSize: 11, marginTop: 2 },
  rates: { flex: 1 },
  rateText: { fontSize: 13 },
  updated: { fontSize: 12 },
});
