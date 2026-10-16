import React, { useCallback, useState } from 'react';
import {
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../constants/theme';
import { useAuthStore } from '../../stores/auth';
import { useSyncStore } from '../../stores/sync';
import { useDashboardSummary } from '../../services/branches';
import { demoSimulate, shouldUseDemo, type SimulateScenario } from '../../lib/demo';
import { fnSimulate } from '../../lib/api';
import { useBranches } from '../../services/branches';
import { useCameras } from '../../services/cameras';
import { scheduleLocalNotification } from '../../lib/notifications';
import { formatLastSync, humanize } from '../../lib/utils';
import {
  AlertCard,
  EmptyState,
  ErrorState,
  LoadingState,
  SecondaryButton,
} from '../../components/ui';
import type { Alert, Severity } from '../../types';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

const SIMULATE_SCENARIOS: SimulateScenario[] = [
  'camera_offline',
  'motion_after_hours',
  'suspicious',
  'rate_mismatch',
  'low_cash',
];

/** Camera scenarios need a camera_id; business scenarios need a branch_id. */
const CAMERA_SCENARIOS: SimulateScenario[] = [
  'camera_offline',
  'motion_after_hours',
  'suspicious',
];

function extractTitle(result: unknown, fallback: string): string {
  if (typeof result === 'object' && result !== null && 'title' in result) {
    const title = (result as Record<string, unknown>).title;
    if (typeof title === 'string' && title.length > 0) {
      return title;
    }
  }
  return fallback;
}

function getOrgName(profile: unknown): string {
  if (typeof profile === 'object' && profile !== null) {
    const record = profile as Record<string, unknown>;
    const name = record.organization_name ?? record.orgName;
    if (typeof name === 'string' && name.length > 0) {
      return name;
    }
  }
  return 'Operations';
}

export default function DashboardScreen() {
  const { colors, radius } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuthStore();
  const { lastSync } = useSyncStore();
  const summary = useDashboardSummary();
  const { isLoading } = summary;
  const isError = summary.error !== null;
  const [refreshing, setRefreshing] = useState(false);
  const [simulateVisible, setSimulateVisible] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const demo = shouldUseDemo();
  const branchesQ = useBranches();
  const camerasQ = useCameras();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const handleSimulate = useCallback(
    async (scenario: SimulateScenario) => {
      setSimulateVisible(false);
      setSimulating(true);
      try {
        let result: unknown;
        if (demo) {
          result = await demoSimulate(scenario);
        } else {
          // Live mode: the backend needs a target — first camera for camera
          // scenarios, first branch for business scenarios.
          const cameras = camerasQ.data ?? [];
          const branches = branchesQ.data ?? [];
          const target = CAMERA_SCENARIOS.includes(scenario)
            ? { camera_id: cameras[0]?.id }
            : { branch_id: branches[0]?.id };
          result = await fnSimulate(scenario, target);
        }
        await queryClient.invalidateQueries();
        scheduleLocalNotification('New alert', extractTitle(result, humanize(scenario)));
      } catch {
        // Simulation failed; the next pull-to-refresh will surface current state.
      } finally {
        setSimulating(false);
      }
    },
    [demo, queryClient, branchesQ.data, camerasQ.data],
  );

  const renderAlerts = (alerts: Alert[]) =>
    alerts.map((alert) => (
      <View key={alert.id} style={styles.alertGap}>
        <AlertCard alert={alert} onPress={() => router.push(`/alerts/${alert.id}`)} />
      </View>
    ));

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    kicker: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 2,
      color: colors.textMuted,
      marginBottom: 2,
    },
    orgName: { fontSize: 20, fontWeight: '800', color: colors.text },
    demoBadge: {
      backgroundColor: colors.warning,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    demoBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
    syncLine: {
      fontSize: 12,
      color: colors.textMuted,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
    summaryCard: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: 16,
      marginBottom: 20,
    },
    branchCount: { fontSize: 32, fontWeight: '800', color: colors.text },
    branchLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
    severityRow: { flexDirection: 'row', justifyContent: 'space-between' },
    severityCell: { alignItems: 'center', flex: 1 },
    severityNumber: { fontSize: 22, fontWeight: '800' },
    severityLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.textMuted, marginTop: 2 },
    section: { marginBottom: 20 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.5,
      marginBottom: 8,
    },
    alertGap: { marginBottom: 8 },
    devTool: { marginTop: 8 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
      padding: 20,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
    modalButtonGap: { height: 8 },
  });

  const renderBody = () => {
    if (isLoading) {
      return <LoadingState message="Loading operations overview…" />;
    }
    if (isError) {
      return (
        <ErrorState
          message="Could not load the operations overview."
          onRetry={onRefresh}
        />
      );
    }
    if (!summary) {
      return (
        <EmptyState
          title="No data"
          message="Operations data is not available right now."
        />
      );
    }

    const critical = summary.criticalAlerts ?? [];
    const warnings = summary.warningAlerts ?? [];

    return (
      <View>
        <View style={styles.summaryCard}>
          <Text style={styles.branchCount}>{summary.branchCount}</Text>
          <Text style={styles.branchLabel}>branches operational</Text>
          <View style={styles.severityRow}>
            {SEVERITY_ORDER.map((sev) => (
              <View key={sev} style={styles.severityCell}>
                <Text style={[styles.severityNumber, { color: colors.severity[sev] }]}>
                  {summary.openBySeverity[sev] ?? 0}
                </Text>
                <Text style={styles.severityLabel}>{sev.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </View>

        {critical.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.danger }]}>CRITICAL</Text>
            {renderAlerts(critical)}
          </View>
        ) : null}

        {warnings.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.warning }]}>WARNINGS</Text>
            {renderAlerts(warnings)}
          </View>
        ) : null}

        {critical.length === 0 && warnings.length === 0 ? (
          <EmptyState
            title="All clear"
            message="No open alerts. Everything is operating normally."
          />
        ) : null}

        {demo ? (
          <View style={styles.devTool}>
            <SecondaryButton
              title={simulating ? 'Simulating…' : 'Simulate event'}
              onPress={() => setSimulateVisible(true)}
              disabled={simulating}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>OPERATIONS</Text>
          <Text style={styles.orgName}>{getOrgName(profile)}</Text>
        </View>
        {demo ? (
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>DEMO</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.syncLine}>
          {demo ? 'Demo data — ' : ''}
          {formatLastSync(lastSync)} · Pull to refresh
        </Text>
        {renderBody()}
      </ScrollView>

      <Modal
        visible={simulateVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSimulateVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Simulate event</Text>
            {SIMULATE_SCENARIOS.map((scenario) => (
              <View key={scenario}>
                <SecondaryButton
                  title={humanize(scenario)}
                  onPress={() => handleSimulate(scenario)}
                />
                <View style={styles.modalButtonGap} />
              </View>
            ))}
            <SecondaryButton title="Cancel" onPress={() => setSimulateVisible(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
