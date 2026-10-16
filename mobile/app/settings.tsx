import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '../constants/theme';
import { useThemeMode } from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
} from '../services/business';
import { shouldUseDemo } from '../lib/demo';
import { ErrorState, LoadingState } from '../components/ui';
import { humanize } from '../lib/utils';
import type { Severity } from '../types';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const DEFAULT_SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const DEMO_OPTIONS: Array<{ label: string; value: boolean | null }> = [
  { label: 'Auto', value: null },
  { label: 'On', value: true },
  { label: 'Off', value: false },
];

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}): React.JSX.Element {
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
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>
        {description}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.toggleHint, { color: colors.textMuted }]}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

export default function SettingsScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const { mode, toggle } = useThemeMode();
  const { demoOverride, setDemoOverride } = useAuthStore();

  const prefsQuery = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();
  // No prefs row yet (fresh account) → fall back to notify-on-everything.
  const pushEnabled = prefsQuery.data?.push_enabled ?? true;
  const severities = prefsQuery.data?.severities ?? DEFAULT_SEVERITIES;

  const toggleSeverity = (severity: Severity): void => {
    if (updatePrefs.isPending) return;
    const has = severities.includes(severity);
    updatePrefs.mutate({
      severities: has
        ? severities.filter((s) => s !== severity)
        : [...severities, severity],
    });
  };

  const demoOn = shouldUseDemo();

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    chipLabel: { fontSize: 13, fontWeight: '600', marginTop: 12 },
    chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
    chipText: { fontSize: 13, fontWeight: '600' },
    statusText: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  });

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ title: 'Settings' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionCard
          title="Notifications"
          description="Control push notifications for alert severities. Changes apply to this device."
        >
          {prefsQuery.isLoading ? (
            <LoadingState message="Loading preferences…" />
          ) : prefsQuery.isError ? (
            <ErrorState
              message="Couldn't load notification preferences."
              onRetry={() => {
                void prefsQuery.refetch();
              }}
            />
          ) : (
            <View>
              <ToggleRow
                label="Push notifications"
                hint="Receive push alerts on this device"
                value={pushEnabled}
                onChange={(value) =>
                  updatePrefs.mutate({ push_enabled: value })
                }
              />
              <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>
                Notify me about
              </Text>
              <View style={styles.chipRow}>
                {SEVERITIES.map((severity) => {
                  const active = severities.includes(severity);
                  return (
                    <TouchableOpacity
                      key={severity}
                      activeOpacity={0.7}
                      disabled={updatePrefs.isPending}
                      onPress={() => toggleSeverity(severity)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active
                            ? colors.severityBg[severity]
                            : colors.surface,
                          borderColor: active
                            ? colors.severity[severity]
                            : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: active
                              ? colors.severity[severity]
                              : colors.textMuted,
                          },
                        ]}
                      >
                        {humanize(severity)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </SectionCard>

        <SectionCard
          title="Appearance"
          description="Switch between light and dark themes. The choice is saved on this device."
        >
          <ToggleRow
            label="Dark mode"
            value={mode === 'dark'}
            onChange={() => toggle()}
          />
        </SectionCard>

        <SectionCard
          title="Demo mode"
          description="Run the app on built-in mock data without a backend connection. Auto follows the app configuration."
        >
          <Text
            style={[
              styles.statusText,
              { color: demoOn ? colors.success : colors.textMuted },
            ]}
          >
            {demoOn ? 'ON — running on mock data' : 'OFF'}
          </Text>
          <View style={styles.chipRow}>
            {DEMO_OPTIONS.map((option) => {
              const active = demoOverride === option.value;
              return (
                <TouchableOpacity
                  key={option.label}
                  activeOpacity={0.7}
                  onPress={() => setDemoOverride(option.value)}
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
                      {
                        color: active ? colors.onPrimary : colors.textSecondary,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sectionDesc: { fontSize: 13, lineHeight: 18 },
  sectionBody: { marginTop: 12 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleText: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 15, fontWeight: '600' },
  toggleHint: { fontSize: 13, marginTop: 2 },
  chipLabel: { fontSize: 13, fontWeight: '600', marginTop: 12 },
});
