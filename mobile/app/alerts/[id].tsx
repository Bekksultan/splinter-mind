import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../constants/theme';
import {
  useAddAlertNote,
  useAlert,
  useAlertAction,
  useAlertNotes,
  useAssignAlert,
  useUsers,
} from '../../services/alerts';
import { useBranches } from '../../services/branches';
import { useEvent } from '../../services/events';
import { formatDateTime, timeAgo } from '../../lib/utils';
import {
  ConfirmationModal,
  EmptyState,
  ErrorState,
  EventTimeline,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  SeverityBadge,
  StatusBadge,
} from '../../components/ui';
import type {
  AiAnalysis,
  Alert,
  AlertNoteWithAuthor,
  Severity,
  TimelineItem,
  VisionAnalysis,
} from '../../types';
import { isVisionAnalysis } from '../../types';

function formatConfidence(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  const pct = value > 1 ? value : value * 100;
  return `${Math.round(pct)}%`;
}

function AiAnalysisPendingCard(): React.JSX.Element {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 13, color: colors.textMuted }}>
        The vision service was unavailable when this event was processed. The
        event is stored — AI analysis can be retried from the backend.
      </Text>
    </View>
  );
}

function buildTimeline(
  alert: Alert,
  notes: AlertNoteWithAuthor[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      id: `${alert.id}-created`,
      time: alert.created_at,
      title: 'Alert created',
      description: alert.title,
      kind: 'alert',
    },
  ];
  for (const note of notes) {
    items.push({
      id: `note-${note.id}`,
      time: note.created_at,
      title: note.user_name ? `Note by ${note.user_name}` : 'Note added',
      description: note.note,
      kind: 'note',
    });
  }
  if (alert.acknowledged_at) {
    items.push({
      id: `${alert.id}-acknowledged`,
      time: alert.acknowledged_at,
      title: 'Acknowledged',
      kind: 'audit',
    });
  }
  if (alert.resolved_at) {
    items.push({
      id: `${alert.id}-resolved`,
      time: alert.resolved_at,
      title: 'Resolved',
      kind: 'audit',
    });
  }
  return items.sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );
}

function AiAnalysisCard({ analysis }: { analysis: VisionAnalysis }) {
  const { colors, radius } = useTheme();

  const rows: Array<[string, string]> = [
    ['Person detected', analysis.person_detected ? 'Yes' : 'No'],
    ['Restricted area', analysis.restricted_area ? 'Yes' : 'No'],
    ['Outside working hours', analysis.outside_working_hours ? 'Yes' : 'No'],
    ['Confidence', formatConfidence(analysis.confidence)],
  ];

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: 14,
    },
    summary: { fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 10 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    label: { fontSize: 13, color: colors.textMuted },
    value: { fontSize: 13, fontWeight: '600', color: colors.text },
  });

  return (
    <View style={styles.card}>
      {analysis.summary ? <Text style={styles.summary}>{analysis.summary}</Text> : null}
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      ))}
      <View style={styles.row}>
        <Text style={styles.label}>Risk level</Text>
        <SeverityBadge severity={(analysis.risk_level ?? 'low') as Severity} />
      </View>
    </View>
  );
}

function EventEvidence({ eventId }: { eventId: string }) {
  const { colors, radius } = useTheme();
  const { data: event, isLoading, isError } = useEvent(eventId);

  const styles = StyleSheet.create({
    section: { marginBottom: 20 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.5,
      color: colors.textMuted,
      marginBottom: 8,
    },
    snapshot: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.surface },
    aiTitleWrap: { marginTop: 16 },
  });

  const analysis: AiAnalysis | null | undefined = event?.ai_analysis;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>SNAPSHOT</Text>
      {isLoading ? (
        <LoadingState message="Loading snapshot…" />
      ) : isError || !event?.snapshot_url ? (
        <EmptyState
          title="No snapshot available"
          message="This event has no camera snapshot attached."
        />
      ) : (
        <Image
          source={{ uri: event.snapshot_url }}
          style={[styles.snapshot, { borderRadius: radius.md }]}
          resizeMode="cover"
        />
      )}
      {analysis ? (
        <View style={styles.aiTitleWrap}>
          <Text style={styles.sectionTitle}>AI ANALYSIS</Text>
          {isVisionAnalysis(analysis) ? (
            <AiAnalysisCard analysis={analysis} />
          ) : (
            <AiAnalysisPendingCard />
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function AlertDetailScreen() {
  const { colors, radius } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams();
  const rawId = params.id;
  const alertId = Array.isArray(rawId) ? rawId[0] : rawId ?? '';

  const { data: alert, isLoading, isError, refetch } = useAlert(alertId);
  const notesQuery = useAlertNotes(alertId);
  const usersQuery = useUsers();
  const branchesQuery = useBranches();
  const { mutate: runAction, isPending: actionPending } = useAlertAction();
  const { mutate: assignAlert, isPending: assignPending } = useAssignAlert();
  const { mutate: addNote, isPending: notePending } = useAddAlertNote();

  const [ignoreVisible, setIgnoreVisible] = useState(false);
  const [resolveVisible, setResolveVisible] = useState(false);
  const [assignVisible, setAssignVisible] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  const userNames = useMemo(() => {
    const map = new Map<string, string>();
    usersQuery.data?.forEach((user) => map.set(user.id, user.name));
    return map;
  }, [usersQuery.data]);

  const branchName = useMemo(() => {
    if (!alert) {
      return '';
    }
    return (
      branchesQuery.data?.find((branch) => branch.id === alert.branch_id)?.name ??
      'View branch'
    );
  }, [alert, branchesQuery.data]);

  const assigneeName = useMemo(() => {
    if (!alert?.assigned_to) {
      return 'Unassigned';
    }
    return userNames.get(alert.assigned_to) ?? 'Unassigned';
  }, [alert, userNames]);

  const timeline = useMemo(() => {
    if (!alert) {
      return [];
    }
    return buildTimeline(alert, notesQuery.data ?? []);
  }, [alert, notesQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    void queryClient.invalidateQueries({ queryKey: ['alert', alertId] });
  };

  const handleAcknowledge = () => {
    runAction({ id: alertId, action: 'acknowledge' }, { onSuccess: invalidate });
  };

  const handleIgnore = () => {
    setIgnoreVisible(false);
    runAction({ id: alertId, action: 'ignore' }, { onSuccess: invalidate });
  };

  const handleResolve = () => {
    setResolveVisible(false);
    runAction({ id: alertId, action: 'resolve' }, { onSuccess: invalidate });
  };

  const handleAssign = (userId: string) => {
    assignAlert(
      { id: alertId, userId },
      {
        onSuccess: () => {
          setAssignVisible(false);
          invalidate();
        },
      },
    );
  };

  const handleAddNote = () => {
    const note = noteText.trim();
    if (!note) {
      return;
    }
    addNote(
      { alertId, note },
      {
        onSuccess: () => {
          setNoteText('');
          setNoteOpen(false);
          void queryClient.invalidateQueries();
        },
      },
    );
  };

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 24 },
    headerCard: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: 16,
      marginBottom: 20,
    },
    badgeRow: { flexDirection: 'row', marginBottom: 10, columnGap: 8 },
    title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
    description: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 12 },
    metaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    metaLabel: {
      width: 84,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      color: colors.textMuted,
    },
    metaValue: { flex: 1, fontSize: 14, color: colors.text },
    metaLink: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.primary },
    section: { marginBottom: 20 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.5,
      color: colors.textMuted,
      marginBottom: 8,
    },
    actionBar: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 20,
    },
    actionRow: { flexDirection: 'row', columnGap: 8, marginBottom: 8 },
    actionFlex: { flex: 1 },
    noteInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.card,
      color: colors.text,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 72,
      textAlignVertical: 'top',
      marginBottom: 8,
    },
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
      maxHeight: '70%',
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    userName: { fontSize: 15, fontWeight: '600', color: colors.text },
    userEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    currentTag: { fontSize: 11, fontWeight: '700', color: colors.primary },
  });

  if (!alertId) {
    return (
      <SafeAreaView style={styles.root}>
        <Stack.Screen options={{ title: 'Alert detail' }} />
        <ErrorState message="No alert was specified." onRetry={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ title: 'Alert detail' }} />
      {isLoading ? (
        <LoadingState message="Loading alert…" />
      ) : isError || !alert ? (
        <ErrorState message="Could not load this alert." onRetry={() => refetch()} />
      ) : (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={styles.headerCard}>
              <View style={styles.badgeRow}>
                <SeverityBadge severity={alert.severity} />
                <StatusBadge status={alert.status} />
              </View>
              <Text style={styles.title}>{alert.title}</Text>
              {alert.description ? (
                <Text style={styles.description}>{alert.description}</Text>
              ) : null}
              <View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>BRANCH</Text>
                  <Link href={`/branches/${alert.branch_id}`} asChild>
                    <TouchableOpacity>
                      <Text style={styles.metaLink}>{branchName}</Text>
                    </TouchableOpacity>
                  </Link>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>CREATED</Text>
                  <Text style={styles.metaValue}>
                    {formatDateTime(alert.created_at)} · {timeAgo(alert.created_at)}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>ASSIGNED</Text>
                  <Text style={styles.metaValue}>{assigneeName}</Text>
                </View>
              </View>
            </View>

            {alert.event_id ? (
              <EventEvidence eventId={alert.event_id} />
            ) : (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>SNAPSHOT</Text>
                <EmptyState
                  title="No snapshot available"
                  message="This alert is not linked to a camera event."
                />
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>TIMELINE</Text>
              <EventTimeline items={timeline} />
            </View>
          </ScrollView>

          <View style={styles.actionBar}>
            {alert.status === 'open' ? (
              <View style={styles.actionRow}>
                <View style={styles.actionFlex}>
                  <PrimaryButton
                    title="Acknowledge"
                    onPress={handleAcknowledge}
                    loading={actionPending}
                  />
                </View>
                <View style={styles.actionFlex}>
                  <SecondaryButton title="Ignore" onPress={() => setIgnoreVisible(true)} />
                </View>
              </View>
            ) : null}
            {alert.status === 'acknowledged' ? (
              <View style={styles.actionRow}>
                <View style={styles.actionFlex}>
                  <PrimaryButton
                    title="Resolve"
                    onPress={() => setResolveVisible(true)}
                    loading={actionPending}
                  />
                </View>
              </View>
            ) : null}
            <View style={styles.actionRow}>
              <View style={styles.actionFlex}>
                <SecondaryButton title="Assign" onPress={() => setAssignVisible(true)} />
              </View>
              <View style={styles.actionFlex}>
                <SecondaryButton
                  title={noteOpen ? 'Cancel note' : 'Add note'}
                  onPress={() => setNoteOpen((open) => !open)}
                />
              </View>
            </View>
            {noteOpen ? (
              <View>
                <TextInput
                  style={styles.noteInput}
                  multiline
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder="Add a note…"
                  placeholderTextColor={colors.textMuted}
                  editable={!notePending}
                />
                <PrimaryButton
                  title="Add note"
                  onPress={handleAddNote}
                  loading={notePending}
                  disabled={noteText.trim().length === 0}
                />
              </View>
            ) : null}
          </View>
        </>
      )}

      <ConfirmationModal
        visible={ignoreVisible}
        title="Ignore this alert?"
        message="The alert will be marked as ignored and removed from the open queue."
        confirmLabel="Ignore"
        destructive
        onConfirm={handleIgnore}
        onCancel={() => setIgnoreVisible(false)}
      />

      <ConfirmationModal
        visible={resolveVisible}
        title="Resolve this alert?"
        message="The alert will be marked as resolved and closed."
        confirmLabel="Resolve"
        onConfirm={handleResolve}
        onCancel={() => setResolveVisible(false)}
      />

      <Modal
        visible={assignVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign alert</Text>
            {usersQuery.isLoading ? (
              <LoadingState message="Loading users…" />
            ) : usersQuery.isError ? (
              <ErrorState
                message="Could not load users."
                onRetry={() => usersQuery.refetch()}
              />
            ) : (
              <FlatList
                data={usersQuery.data ?? []}
                keyExtractor={(user) => user.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userRow}
                    onPress={() => handleAssign(item.id)}
                    disabled={assignPending}
                  >
                    <View>
                      <Text style={styles.userName}>{item.name}</Text>
                      <Text style={styles.userEmail}>{item.email}</Text>
                    </View>
                    {alert?.assigned_to === item.id ? (
                      <Text style={styles.currentTag}>CURRENT</Text>
                    ) : null}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <EmptyState title="No users" message="No team members found." />
                }
              />
            )}
            <View style={{ marginTop: 12 }}>
              <SecondaryButton title="Cancel" onPress={() => setAssignVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
