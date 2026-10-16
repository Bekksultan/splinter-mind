import React, { useMemo, useState } from 'react';
import {
  Image,
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
  EmptyState,
  ErrorState,
  EventTimeline,
  LoadingState,
  SecondaryButton,
  SeverityBadge,
  StatusBadge,
} from '../../components/ui';
import { useCamera } from '../../services/cameras';
import { useEvents } from '../../services/events';
import { fnSnapshot } from '../../lib/api';
import { shouldUseDemo } from '../../lib/demo';
import { formatDateTime, humanize, timeAgo } from '../../lib/utils';
import type { EventItem, TimelineItem } from '../../types';

function MetaRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export default function CameraDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [snapshotOverride, setSnapshotOverride] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const cameraQuery = useCamera(id);
  const eventsQuery = useEvents({ cameraId: id, limit: 20 });

  const camera = cameraQuery.data;
  const events: EventItem[] = eventsQuery.data ?? [];
  const latestEvent: EventItem | undefined = events[0];
  const snapshotUri = snapshotOverride ?? latestEvent?.snapshot_url ?? null;

  const timelineItems: TimelineItem[] = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        time: event.timestamp,
        title: humanize(event.event_type),
        description: `Source: ${humanize(event.source)}`,
        kind: 'event' as const,
        severity: event.severity,
      })),
    [events]
  );

  const refreshSnapshot = async (): Promise<void> => {
    if (shouldUseDemo()) {
      // Demo mode is fully offline: reveal the stored snapshot, no network call.
      setSnapshotOverride(latestEvent?.snapshot_url ?? null);
      return;
    }
    setSnapshotLoading(true);
    try {
      const result = await fnSnapshot(id);
      if (result.snapshot_url) {
        setSnapshotOverride(result.snapshot_url);
        await eventsQuery.refetch();
      }
    } finally {
      setSnapshotLoading(false);
    }
  };

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await Promise.all([cameraQuery.refetch(), eventsQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  if (cameraQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <LoadingState message="Loading camera…" />
      </SafeAreaView>
    );
  }

  if (cameraQuery.isError) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <ErrorState
          message="Couldn't load this camera."
          onRetry={() => {
            void cameraQuery.refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  if (!camera) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <EmptyState
          title="Camera not found"
          message="This camera doesn't exist or was removed."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Camera' }} />
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
            <StatusBadge status={camera.status} />
            <Text style={[styles.seen, { color: colors.textMuted }]}>
              Last seen{' '}
              {camera.last_seen_at ? timeAgo(camera.last_seen_at) : 'never'}
            </Text>
          </View>
          <Text style={[styles.name, { color: colors.text }]}>{camera.name}</Text>
          <MetaRow label="External ID" value={camera.external_id ?? '—'} />
          <MetaRow label="Provider" value={humanize(camera.provider)} />
          <MetaRow
            label="Type"
            value={camera.camera_type ? humanize(camera.camera_type) : '—'}
          />
        </View>

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
            Latest snapshot
          </Text>
          {snapshotUri ? (
            <Image
              source={{ uri: snapshotUri }}
              style={[styles.snapshot, { borderRadius: radius.sm }]}
              resizeMode="cover"
            />
          ) : (
            <Text style={[styles.note, { color: colors.textMuted }]}>
              No snapshot available yet.
            </Text>
          )}
          {shouldUseDemo() ? (
            <Text style={[styles.note, { color: colors.textMuted }]}>
              Demo mode — showing the stored snapshot.
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <SecondaryButton
              title="Refresh snapshot"
              loading={snapshotLoading}
              onPress={() => {
                void refreshSnapshot();
              }}
            />
          </View>
        </View>

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
            Last event
          </Text>
          {eventsQuery.isLoading ? (
            <Text style={[styles.note, { color: colors.textMuted }]}>Loading…</Text>
          ) : eventsQuery.isError ? (
            <Text style={[styles.note, { color: colors.danger }]}>
              Couldn't load events.
            </Text>
          ) : latestEvent ? (
            <View>
              <View style={styles.eventTop}>
                <SeverityBadge severity={latestEvent.severity} size="sm" />
                <Text style={[styles.eventTime, { color: colors.textMuted }]}>
                  {formatDateTime(latestEvent.timestamp)}
                </Text>
              </View>
              <Text style={[styles.eventTitle, { color: colors.text }]}>
                {humanize(latestEvent.event_type)}
              </Text>
            </View>
          ) : (
            <Text style={[styles.note, { color: colors.textMuted }]}>
              No events recorded for this camera.
            </Text>
          )}
        </View>

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
            Event timeline
          </Text>
          {eventsQuery.isLoading ? (
            <Text style={[styles.note, { color: colors.textMuted }]}>Loading…</Text>
          ) : eventsQuery.isError ? (
            <Text style={[styles.note, { color: colors.danger }]}>
              Couldn't load events.
            </Text>
          ) : timelineItems.length === 0 ? (
            <EmptyState
              title="No events"
              message="No events recorded for this camera."
            />
          ) : (
            <EventTimeline items={timelineItems} />
          )}
        </View>

        <SecondaryButton
          title="View branch"
          onPress={() => router.push(`/branches/${camera.branch_id}`)}
        />
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
  seen: { fontSize: 12 },
  name: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metaLabel: { fontSize: 13 },
  metaValue: { fontSize: 13, fontWeight: '600' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  snapshot: { width: '100%', aspectRatio: 16 / 9, marginBottom: 8 },
  note: { fontSize: 13, marginBottom: 8 },
  buttonRow: { marginTop: 4 },
  eventTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  eventTime: { fontSize: 12 },
  eventTitle: { fontSize: 16, fontWeight: '700' },
});
