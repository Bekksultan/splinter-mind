import React, { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../constants/theme';
import {
  AlertCard,
  CameraStatus,
  EmptyState,
  ErrorState,
  EventTimeline,
  LoadingState,
  StatusBadge,
} from '../../components/ui';
import { useBranch, useBranchTimeline } from '../../services/branches';
import { useAlerts } from '../../services/alerts';
import { useCameras } from '../../services/cameras';
import {
  useCashBalances,
  useEmployees,
  useExchangeRates,
  useShifts,
} from '../../services/business';
import { formatMoney, timeAgo } from '../../lib/utils';
import type { CashBalance, ExchangeRate, WeekdayKey, WorkingHours } from '../../types';

const DAY_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** "Mon–Sat 09:00–21:00" — groups consecutive days sharing the same hours. */
function formatWorkingHours(workingHours: WorkingHours | null): string | null {
  if (!workingHours) return null;
  const rangeFor = (day: WeekdayKey): string | null => {
    const entry = workingHours[day];
    if (!entry || entry.closed || !entry.open || !entry.close) return null;
    return `${entry.open}–${entry.close}`;
  };
  const groups: Array<{ days: WeekdayKey[]; range: string }> = [];
  for (const day of DAY_ORDER) {
    const range = rangeFor(day);
    if (!range) continue;
    const last = groups[groups.length - 1];
    const prevDay = last ? last.days[last.days.length - 1] : null;
    const consecutive =
      prevDay !== null &&
      DAY_ORDER.indexOf(day) === DAY_ORDER.indexOf(prevDay) + 1;
    if (last && last.range === range && consecutive) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], range });
    }
  }
  if (groups.length === 0) return null;
  return groups
    .map((group) => {
      const label =
        group.days.length > 2
          ? `${DAY_SHORT[group.days[0]]}–${DAY_SHORT[group.days[group.days.length - 1]]}`
          : group.days.map((d) => DAY_SHORT[d]).join(', ');
      return `${label} ${group.range}`;
    })
    .join(' · ');
}

function formatRate(value: number): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function RateRow({ rate }: { rate: ExchangeRate }): React.JSX.Element {
  const { colors } = useTheme();
  const prev = rate.previous_sell_rate;
  const flagged =
    typeof prev === 'number' &&
    prev !== 0 &&
    Math.abs(rate.sell_rate - prev) / Math.abs(prev) > 0.02;

  return (
    <View
      style={[
        styles.rateRow,
        {
          borderBottomColor: colors.border,
          backgroundColor: flagged ? colors.severityBg.high : 'transparent',
        },
      ]}
    >
      <Text style={[styles.rateCurrency, { color: colors.text }]}>
        {rate.currency}
      </Text>
      <View style={styles.rateValues}>
        <Text style={[styles.rateValue, { color: colors.textSecondary }]}>
          BUY {formatRate(rate.buy_rate)}
        </Text>
        <Text style={[styles.rateValue, { color: colors.textSecondary }]}>
          SELL {formatRate(rate.sell_rate)}
        </Text>
      </View>
      <Text style={[styles.rateUpdated, { color: colors.textMuted }]}>
        {timeAgo(rate.created_at)}
      </Text>
    </View>
  );
}

function CashRow({ balance }: { balance: CashBalance }): React.JSX.Element {
  const { colors } = useTheme();
  const below = balance.amount < balance.threshold;
  const pct =
    balance.threshold > 0
      ? Math.min(100, (balance.amount / balance.threshold) * 100)
      : 100;

  return (
    <View style={[styles.cashRow, { borderBottomColor: colors.border }]}>
      <View style={styles.cashTop}>
        <Text style={[styles.rateCurrency, { color: colors.text }]}>
          {balance.currency}
        </Text>
        <Text style={[styles.cashAmount, { color: colors.text }]}>
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

interface SectionProps {
  title: string;
  loading: boolean;
  error: boolean;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}

function Section({
  title,
  loading,
  error,
  empty,
  emptyText,
  children,
}: SectionProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
        },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        {title}
      </Text>
      {loading ? (
        <Text style={[styles.sectionNote, { color: colors.textMuted }]}>
          Loading…
        </Text>
      ) : error ? (
        <Text style={[styles.sectionNote, { color: colors.danger }]}>
          Couldn't load this section.
        </Text>
      ) : empty ? (
        <Text style={[styles.sectionNote, { color: colors.textMuted }]}>
          {emptyText}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

export default function BranchDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const branchQuery = useBranch(id);
  const ratesQuery = useExchangeRates(id);
  const cashQuery = useCashBalances(id);
  const shiftsQuery = useShifts(id);
  const employeesQuery = useEmployees();
  const camerasQuery = useCameras(id);
  const alertsQuery = useAlerts({ branchId: id, status: 'open' });
  const timelineQuery = useBranchTimeline(id);

  const branch = branchQuery.data;

  const activeShift = useMemo(
    () => (shiftsQuery.data ?? []).find((s) => s.status === 'active') ?? null,
    [shiftsQuery.data]
  );
  const shiftEmployeeName = useMemo(
    () =>
      (employeesQuery.data ?? []).find((e) => e.id === activeShift?.employee_id)
        ?.name ?? null,
    [employeesQuery.data, activeShift]
  );
  const hoursSummary = useMemo(
    () => (branch ? formatWorkingHours(branch.working_hours) : null),
    [branch]
  );
  const timelineItems = useMemo(
    () => (timelineQuery.data ?? []).slice(0, 20),
    [timelineQuery.data]
  );

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await Promise.all([
        branchQuery.refetch(),
        ratesQuery.refetch(),
        cashQuery.refetch(),
        shiftsQuery.refetch(),
        employeesQuery.refetch(),
        camerasQuery.refetch(),
        alertsQuery.refetch(),
        timelineQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (branchQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <LoadingState message="Loading branch…" />
      </SafeAreaView>
    );
  }

  if (branchQuery.isError) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <ErrorState
          message="Couldn't load this branch."
          onRetry={() => {
            void branchQuery.refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  if (!branch) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <EmptyState
          title="Branch not found"
          message="This branch doesn't exist or was removed."
        />
      </SafeAreaView>
    );
  }

  const rates = ratesQuery.data ?? [];
  const balances = cashQuery.data ?? [];
  const cameras = camerasQuery.data ?? [];
  const alerts = alertsQuery.data ?? [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: branch.name }} />
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.md }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void onRefresh();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radius.md,
              padding: spacing.md,
            },
          ]}
        >
          <View style={styles.statusRow}>
            <StatusBadge status={branch.status} />
            <Text style={[styles.timezone, { color: colors.textMuted }]}>
              {branch.timezone}
            </Text>
          </View>
          <Text style={[styles.name, { color: colors.text }]}>{branch.name}</Text>
          {branch.address ? (
            <Text style={[styles.address, { color: colors.textSecondary }]}>
              {branch.address}
            </Text>
          ) : null}
          <Text style={[styles.hours, { color: colors.textMuted }]}>
            {hoursSummary ?? 'Working hours not set'}
          </Text>
        </View>

        <Section
          title="Exchange rates"
          loading={ratesQuery.isLoading}
          error={ratesQuery.isError}
          empty={rates.length === 0}
          emptyText="No exchange rates published for this branch."
        >
          {rates.map((rate) => (
            <RateRow key={rate.id} rate={rate} />
          ))}
        </Section>

        <Section
          title="Cash balances"
          loading={cashQuery.isLoading}
          error={cashQuery.isError}
          empty={balances.length === 0}
          emptyText="No cash balances reported for this branch."
        >
          {balances.map((balance) => (
            <CashRow key={balance.id} balance={balance} />
          ))}
        </Section>

        <Section
          title="Current shift"
          loading={shiftsQuery.isLoading || employeesQuery.isLoading}
          error={shiftsQuery.isError}
          empty={!activeShift}
          emptyText="No active shift right now."
        >
          {activeShift ? (
            <View>
              <Text style={[styles.shiftName, { color: colors.text }]}>
                {shiftEmployeeName ?? 'Unassigned'}
              </Text>
              <Text style={[styles.shiftTime, { color: colors.textSecondary }]}>
                {formatTime(activeShift.start_time)} –{' '}
                {formatTime(activeShift.end_time)}
              </Text>
              <View style={styles.shiftStatus}>
                <StatusBadge status={activeShift.status} />
              </View>
            </View>
          ) : null}
        </Section>

        <Section
          title="Cameras"
          loading={camerasQuery.isLoading}
          error={camerasQuery.isError}
          empty={cameras.length === 0}
          emptyText="No cameras registered at this branch."
        >
          {cameras.map((camera, index) => (
            <View
              key={camera.id}
              style={[
                index < cameras.length - 1 && styles.cameraDivider,
                { borderBottomColor: colors.border },
              ]}
            >
              <CameraStatus
                camera={camera}
                onPress={() => router.push(`/cameras/${camera.id}`)}
              />
            </View>
          ))}
        </Section>

        <Section
          title="Open alerts"
          loading={alertsQuery.isLoading}
          error={alertsQuery.isError}
          empty={alerts.length === 0}
          emptyText="No open alerts for this branch."
        >
          {alerts.map((alert) => (
            <View key={alert.id} style={styles.alertGap}>
              <AlertCard
                alert={alert}
                compact
                onPress={() => router.push(`/alerts/${alert.id}`)}
              />
            </View>
          ))}
        </Section>

        <Section
          title="Timeline"
          loading={timelineQuery.isLoading}
          error={timelineQuery.isError}
          empty={timelineItems.length === 0}
          emptyText="No recent activity at this branch."
        >
          <EventTimeline items={timelineItems} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: 32, gap: 16 },
  card: { borderWidth: 1 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timezone: { fontSize: 13 },
  name: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  address: { fontSize: 14, marginTop: 4 },
  hours: { fontSize: 13, marginTop: 4 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionNote: { fontSize: 13 },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  rateCurrency: { fontSize: 15, fontWeight: '700', width: 52 },
  rateValues: { flex: 1 },
  rateValue: { fontSize: 13 },
  rateUpdated: { fontSize: 12 },
  cashRow: { paddingVertical: 8, borderBottomWidth: 1 },
  cashTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashAmount: { fontSize: 15, fontWeight: '700' },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 6, borderRadius: 3 },
  belowLabel: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  thresholdLabel: { fontSize: 12, marginTop: 4 },
  shiftName: { fontSize: 15, fontWeight: '700' },
  shiftTime: { fontSize: 13, marginTop: 2 },
  shiftStatus: { marginTop: 6 },
  cameraDivider: { borderBottomWidth: 1 },
  alertGap: { marginBottom: 8 },
});
