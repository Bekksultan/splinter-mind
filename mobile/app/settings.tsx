import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTheme } from '../constants/theme';
import { useThemeMode } from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
} from '../services/business';
import { shouldUseDemo } from '../lib/demo';
import { ErrorState, LoadingState, PrimaryButton } from '../components/ui';
import { humanize } from '../lib/utils';
import type { Severity } from '../types';

const E164_RE = /^\+\d{7,15}$/;

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

function WhatsAppSection(): React.JSX.Element {
  const { colors } = useTheme();
  const prefsQuery = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();
  const [waEnabled, setWaEnabled] = React.useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ whatsapp_number: string }>({
    defaultValues: { whatsapp_number: '' },
  });

  React.useEffect(() => {
    if (prefsQuery.data) {
      reset({ whatsapp_number: prefsQuery.data.whatsapp_number ?? '' });
      setWaEnabled(prefsQuery.data.whatsapp_enabled ?? false);
    }
  }, [prefsQuery.data, reset]);

  const onSave = handleSubmit((values) => {
    const number = values.whatsapp_number.trim();
    updatePrefs.mutate({
      whatsapp_number: number === '' ? null : number,
      whatsapp_enabled: waEnabled,
    });
  });

  return (
    <SectionCard
      title="WhatsApp"
      description="Optional second channel. Alert messages use an approved Meta template — never free text."
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
            label="WhatsApp alerts"
            hint="Send template alerts to the number below"
            value={waEnabled}
            onChange={setWaEnabled}
          />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            WhatsApp number
          </Text>
          <Controller
            control={control}
            name="whatsapp_number"
            rules={{
              validate: (v) => {
                const t = v.trim();
                if (!waEnabled) return true;
                if (t === '') return 'Enter your WhatsApp number to enable alerts';
                return (
                  E164_RE.test(t) || 'Use international format, e.g. +996555123456'
                );
              },
            }}
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: errors.whatsapp_number
                      ? colors.danger
                      : colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="+996555123456"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          />
          {errors.whatsapp_number ? (
            <Text style={[styles.fieldError, { color: colors.danger }]}>
              {errors.whatsapp_number.message}
            </Text>
          ) : null}
          <View style={styles.saveRow}>
            <PrimaryButton
              title="Save WhatsApp settings"
              onPress={onSave}
              loading={updatePrefs.isPending}
            />
          </View>
          {updatePrefs.isSuccess ? (
            <Text style={[styles.savedText, { color: colors.success }]}>
              Saved
            </Text>
          ) : null}
        </View>
      )}
    </SectionCard>
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

        <WhatsAppSection />

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
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  fieldError: { fontSize: 13, marginTop: 6 },
  saveRow: { marginTop: 14 },
  savedText: { fontSize: 13, fontWeight: '600', marginTop: 8 },
});
