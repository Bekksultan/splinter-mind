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
import { useCashBalances } from '../services/business';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import { formatMoney } from '../lib/utils';
import type { Branch, CashBalance } from '../types';

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

function BalanceRow({
  balance,
  branchName,
}: {
  balance: CashBalance;
  branchName?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const below = balance.amount < balance.threshold;
  const pct =
    balance.threshold > 0
      ? Math.min(100, (balance.amount / balance.threshold) * 100)
      : 100;

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.rowTop}>
        <View>
          <Text style={[styles.currency, { color: colors.text }]}>
            {balance.currency}
          </Text>
          {branchName ? (
            <Text style={[styles.branch, { color: colors.textMuted }]}>
              {branchName}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.amount, { color: colors.text }]}>
          {formatMoney(balance.amount, balance.currency)}
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.barFill,
            {
              width: `${pct}%`,
              backgroundColor: below ? colors.danger : colors.success,
            },
          ]}
        />
      </View>
      {below ? (
        <Text style={[styles.belowLabel, { color: colors.danger }]}>
          Below threshold
        </Text>
      ) : (
        <Text style={[styles.thresholdLabel, { color: colors.textMuted }]}>
          Threshold {formatMoney(balance.threshold, balance.currency)}
        </Text>
      )}
    </View>
  );
}

export default function CashBalancesScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const branchesQuery = useBranches();
  const balancesQuery = useCashBalances(branchId ?? undefined);

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
      await Promise.all([branchesQuery.refetch(), balancesQuery.refetch()]);
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

  const renderItem = ({ item }: { item: CashBalance }): React.JSX.Element => (
    <View style={styles.cardGap}>
      <BalanceRow
        balance={item}
        branchName={branchId ? undefined : branchNames.get(item.branch_id)}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ title: 'Cash balances' }} />
      <View style={styles.chipsWrap}>
        <BranchChips
          branches={branchesQuery.data ?? []}
          selected={branchId}
          onSelect={setBranchId}
        />
      </View>
      {balancesQuery.isLoading ? (
        <LoadingState message="Loading cash balances…" />
      ) : balancesQuery.isError || !balancesQuery.data ? (
        <ErrorState
          message="Couldn't load cash balances."
          onRetry={() => {
            void balancesQuery.refetch();
          }}
        />
      ) : balancesQuery.data.length === 0 ? (
        <EmptyState
          title="No balances"
          message="No cash balances reported for this selection."
        />
      ) : (
        <FlatList
          data={balancesQuery.data}
          keyExtractor={(balance) => balance.id}
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
  row: { borderWidth: 1, borderRadius: 12, padding: 12 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currency: { fontSize: 15, fontWeight: '700' },
  branch: { fontSize: 11, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700' },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  barFill: { height: 6, borderRadius: 3 },
  belowLabel: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  thresholdLabel: { fontSize: 12, marginTop: 4 },
});
