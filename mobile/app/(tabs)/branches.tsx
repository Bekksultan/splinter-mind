import React, { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../constants/theme';
import { useSyncStore } from '../../stores/sync';
import { useBranches } from '../../services/branches';
import { useAlerts } from '../../services/alerts';
import { useCameras } from '../../services/cameras';
import {
  BranchCard,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/ui';
import { formatLastSync } from '../../lib/utils';
import type { Branch } from '../../types';

export default function BranchesScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { lastSync, touch } = useSyncStore();
  const [refreshing, setRefreshing] = useState(false);

  const branchesQuery = useBranches();
  const alertsQuery = useAlerts({ status: 'open' });
  const camerasQuery = useCameras();

  const openAlertsByBranch = useMemo(() => {
    const map = new Map<string, number>();
    for (const alert of alertsQuery.data ?? []) {
      map.set(alert.branch_id, (map.get(alert.branch_id) ?? 0) + 1);
    }
    return map;
  }, [alertsQuery.data]);

  const cameraCounts = useMemo(() => {
    const online = new Map<string, number>();
    const total = new Map<string, number>();
    for (const camera of camerasQuery.data ?? []) {
      total.set(camera.branch_id, (total.get(camera.branch_id) ?? 0) + 1);
      if (camera.status === 'online') {
        online.set(camera.branch_id, (online.get(camera.branch_id) ?? 0) + 1);
      }
    }
    return { online, total };
  }, [camerasQuery.data]);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await Promise.all([
        branchesQuery.refetch(),
        alertsQuery.refetch(),
        camerasQuery.refetch(),
      ]);
      touch();
    } finally {
      setRefreshing(false);
    }
  };

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    title: { fontSize: 22, fontWeight: '800', color: colors.text },
    subtitle: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
    },
    cardGap: { marginBottom: spacing.sm },
  });

  const renderItem = ({ item }: { item: Branch }): React.JSX.Element => (
    <View style={styles.cardGap}>
      <BranchCard
        branch={item}
        openAlerts={openAlertsByBranch.get(item.id) ?? 0}
        camerasOnline={cameraCounts.online.get(item.id) ?? 0}
        camerasTotal={cameraCounts.total.get(item.id) ?? 0}
        onPress={() => router.push(`/branches/${item.id}`)}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Branches</Text>
        <Text style={styles.subtitle}>{formatLastSync(lastSync)}</Text>
      </View>
      {branchesQuery.isLoading ? (
        <LoadingState message="Loading branches…" />
      ) : branchesQuery.isError || !branchesQuery.data ? (
        <ErrorState
          message="Couldn't load branches."
          onRetry={() => {
            void branchesQuery.refetch();
          }}
        />
      ) : branchesQuery.data.length === 0 ? (
        <EmptyState
          title="No branches"
          message="No branches are registered for your organization yet."
        />
      ) : (
        <FlatList
          data={branchesQuery.data}
          keyExtractor={(branch) => branch.id}
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
