import React, { useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../constants/theme';
import { useAuthStore } from '../stores/auth';
import { useBranches } from '../services/branches';
import { useDevices } from '../services/devices';
import { callEdgeFunction } from '../lib/api';
import { timeAgo } from '../lib/utils';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '../components/ui';
import type { Branch, Camera, Device, EntityStatus } from '../types';

const ADMIN_ROLES = ['owner', 'admin'];

interface DeviceForm {
  branch_id: string;
  name: string;
  host: string;
  port: string;
  use_https: boolean;
  username: string;
  password: string;
}

interface OnboardResponse {
  device: Device;
  cameras: Camera[];
}

const PORT_PATTERN = /^\d{1,5}$/;

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'Onboarding failed.';
  if (msg.includes('device_unreachable'))
    return 'Could not reach the device. Check the host/port and that the NVR is on the network, then try again.';
  if (msg.includes('device_already_registered'))
    return 'This host is already registered for the selected branch.';
  if (msg.includes('no_enabled_channels'))
    return 'The device responded but reported no enabled video channels.';
  if (msg.includes('branch_not_found')) return 'The selected branch no longer exists.';
  if (msg.includes('forbidden')) return 'Only organization owners and admins can add devices.';
  if (msg.includes('not configured'))
    return 'Device onboarding needs a connected backend — it is unavailable in demo mode.';
  return msg;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 }}>
        {label}
      </Text>
      {children}
      {error ? (
        <Text style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>{error}</Text>
      ) : null}
    </View>
  );
}

function DeviceRow({ device, branch }: { device: Device; branch: Branch | undefined }): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.md,
        marginBottom: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 }} numberOfLines={1}>
          {device.name}
        </Text>
        <StatusBadge status={device.status as EntityStatus} />
      </View>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
        {device.use_https ? 'https' : 'http'}://{device.host}:{device.port}
        {device.username ? ` · ${device.username}` : ''}
      </Text>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
        {branch ? branch.name : 'Unknown branch'}
        {device.last_seen_at ? ` · last seen ${timeAgo(device.last_seen_at)}` : ''}
      </Text>
    </View>
  );
}

export default function IntegrationsScreen(): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  const queryClient = useQueryClient();
  const profile = useAuthStore((s) => s.profile);
  const devicesQuery = useDevices();
  const branchesQuery = useBranches();

  const [formOpen, setFormOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DeviceForm>({
    defaultValues: {
      branch_id: '',
      name: '',
      host: '',
      port: '80',
      use_https: false,
      username: '',
      password: '',
    },
  });

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl },
    title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 4 },
    subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
    },
    branchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderRadius: radius.sm,
      marginBottom: 6,
    },
    branchName: { fontSize: 14, color: colors.text },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
    toggleHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    banner: {
      borderRadius: radius.sm,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
    },
    bannerText: { fontSize: 13, lineHeight: 18 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.textMuted,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
  });

  const isAdmin = profile !== null && ADMIN_ROLES.includes(profile.role);

  const onSubmit = async (data: DeviceForm) => {
    setSubmitError(null);
    setSuccess(null);
    try {
      const port = parseInt(data.port, 10);
      const res = await callEdgeFunction<OnboardResponse>('hikvision-onboard', {
        branch_id: data.branch_id,
        name: data.name.trim(),
        host: data.host.trim(),
        port,
        use_https: data.use_https,
        username: data.username.trim(),
        password: data.password,
      });
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
      await queryClient.invalidateQueries({ queryKey: ['cameras'] });
      setSuccess(
        `“${res.device.name}” onboarded — ${res.cameras.length} camera${res.cameras.length === 1 ? '' : 's'} added.`
      );
      reset();
      setFormOpen(false);
    } catch (err) {
      setSubmitError(friendlyError(err));
    }
  };

  const branches = branchesQuery.data ?? [];
  const branchById = new Map(branches.map((b) => [b.id, b]));

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ title: 'Integrations' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Integrations</Text>
        <Text style={styles.subtitle}>Hikvision NVRs and camera devices</Text>

        {!isAdmin ? (
          <EmptyState
            title="Restricted to organization admins"
            message="Only owners and admins can register camera devices. Contact your administrator to onboard an NVR."
          />
        ) : (
          <>
            {success ? (
              <View style={[styles.banner, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Text style={[styles.bannerText, { color: '#065F46' }]}>{success}</Text>
              </View>
            ) : null}
            {submitError ? (
              <View style={[styles.banner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Text style={[styles.bannerText, { color: '#991B1B' }]}>{submitError}</Text>
              </View>
            ) : null}

            {!formOpen ? (
              <PrimaryButton title="Add Hikvision device" onPress={() => setFormOpen(true)} />
            ) : (
              <View
                style={{
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  marginBottom: spacing.md,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
                  New Hikvision device
                </Text>

                <Field label="Branch" error={errors.branch_id?.message}>
                  <Controller
                    control={control}
                    name="branch_id"
                    rules={{ required: 'Select a branch' }}
                    render={({ field: { onChange, value } }) => (
                      <View>
                        {branchesQuery.isLoading ? (
                          <LoadingState message="Loading branches…" />
                        ) : (
                          branches.map((b) => {
                            const selected = value === b.id;
                            return (
                              <TouchableOpacity
                                key={b.id}
                                activeOpacity={0.7}
                                onPress={() => onChange(b.id)}
                                style={[
                                  styles.branchRow,
                                  {
                                    borderColor: selected ? colors.primary : colors.border,
                                    backgroundColor: selected ? '#EFF6FF' : colors.surface,
                                  },
                                ]}
                              >
                                <Text style={styles.branchName}>{b.name}</Text>
                                {selected ? (
                                  <Text style={{ color: colors.primary, fontWeight: '700' }}>✓</Text>
                                ) : null}
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </View>
                    )}
                  />
                </Field>

                <Field label="Device name" error={errors.name?.message}>
                  <Controller
                    control={control}
                    name="name"
                    rules={{ required: 'Device name is required' }}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={styles.input}
                        placeholder="NVR — Branch #14"
                        placeholderTextColor={colors.textMuted}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                </Field>

                <Field label="Host (IP or hostname)" error={errors.host?.message}>
                  <Controller
                    control={control}
                    name="host"
                    rules={{ required: 'Host is required' }}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={styles.input}
                        placeholder="192.168.10.20"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                </Field>

                <Field
                  label="Port"
                  error={errors.port?.message}
                >
                  <Controller
                    control={control}
                    name="port"
                    rules={{
                      required: 'Port is required',
                      validate: (v) => {
                        if (!PORT_PATTERN.test(v)) return 'Port must be numeric';
                        const n = parseInt(v, 10);
                        return n >= 1 && n <= 65535 ? true : 'Port must be 1–65535';
                      },
                    }}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={styles.input}
                        placeholder="80"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                </Field>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>Use HTTPS</Text>
                    <Text style={styles.toggleHint}>Enable if the device serves ISAPI over TLS</Text>
                  </View>
                  <Controller
                    control={control}
                    name="use_https"
                    render={({ field: { onChange, value } }) => (
                      <Switch value={value} onValueChange={onChange} />
                    )}
                  />
                </View>

                <Field label="ISAPI username" error={errors.username?.message}>
                  <Controller
                    control={control}
                    name="username"
                    rules={{ required: 'Username is required' }}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={styles.input}
                        placeholder="admin"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                </Field>

                <Field label="ISAPI password" error={errors.password?.message}>
                  <Controller
                    control={control}
                    name="password"
                    rules={{ required: 'Password is required' }}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor={colors.textMuted}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                </Field>

                <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
                  The password is sent once over TLS and stored in the server-side
                  vault — it is never saved in the app.
                </Text>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <SecondaryButton title="Cancel" onPress={() => setFormOpen(false)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton
                      title="Connect"
                      loading={isSubmitting}
                      onPress={handleSubmit(onSubmit)}
                    />
                  </View>
                </View>
              </View>
            )}

            <Text style={styles.sectionTitle}>REGISTERED DEVICES</Text>
            {devicesQuery.isLoading ? (
              <LoadingState message="Loading devices…" />
            ) : devicesQuery.isError ? (
              <ErrorState
                message="Couldn't load devices."
                onRetry={() => devicesQuery.refetch()}
              />
            ) : (devicesQuery.data ?? []).length === 0 ? (
              <EmptyState
                title="No devices yet"
                message="Add your first Hikvision NVR to start onboarding its cameras."
              />
            ) : (
              (devicesQuery.data ?? []).map((d) => (
                <DeviceRow key={d.id} device={d} branch={branchById.get(d.branch_id)} />
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
