import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '../constants/theme';
import { useAuthStore } from '../stores/auth';
import {
  ConfirmationModal,
  EmptyState,
  SecondaryButton,
} from '../components/ui';
import { humanize } from '../lib/utils';

function InfoRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const { profile, signOut } = useAuthStore();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    header: { flexDirection: 'row', alignItems: 'center' },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    avatarText: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.onPrimary,
    },
    name: { fontSize: 18, fontWeight: '800', color: colors.text },
    roleChip: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 6,
    },
    roleText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
  });

  const doSignOut = async (): Promise<void> => {
    setConfirmVisible(false);
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
    router.replace('/(auth)/login');
  };

  const initials = (profile?.name ?? '?')
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ title: 'Profile' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {!profile ? (
          <EmptyState
            title="No profile"
            message="Your account details couldn't be loaded."
          />
        ) : (
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View>
                <Text style={styles.name}>{profile.name}</Text>
                <View style={styles.roleChip}>
                  <Text style={styles.roleText}>
                    {humanize(profile.role).toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {profile ? (
          <View style={styles.card}>
            <InfoRow label="Email" value={profile.email} />
            <InfoRow label="Phone" value={profile.phone ?? '—'} />
            <InfoRow label="Organization" value="Meridian Exchange Group" />
            <InfoRow label="Status" value={humanize(profile.status)} />
          </View>
        ) : null}

        <SecondaryButton
          title="Sign out"
          loading={signingOut}
          onPress={() => setConfirmVisible(true)}
        />
      </ScrollView>

      <ConfirmationModal
        visible={confirmVisible}
        title="Sign out"
        message="You will need to sign in again to access Splinter Mind."
        confirmLabel="Sign out"
        destructive
        onConfirm={() => {
          void doSignOut();
        }}
        onCancel={() => setConfirmVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: '600' },
});
